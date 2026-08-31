import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import {
  Building2,
  Check,
  ChevronsUpDown,
  CircleDot,
  Eye,
  EyeOff,
  Image as ImageIcon,
  Layers,
  Link2,
  LocateFixed,
  MousePointer2,
  PencilRuler,
  Plus,
  Redo2,
  Route,
  Save,
  Search,
  Trash2,
  Undo2,
} from 'lucide-react';
import { Circle, Group, Image as KonvaImage, Label, Layer, Line, Rect, Stage, Tag, Text } from 'react-konva';
import * as editorApi from '../api/editorApi';
import * as organizationApi from '../api/organizationApi';
import * as routeApi from '../api/routeApi';
import { LocationSearchBox } from '../components/viewer/RoutePlanner';
import AppTopbar from '../components/common/AppTopbar';
import ConfirmModal from '../components/common/ConfirmModal';
import StatusMessage from '../components/common/StatusMessage';
import ToastStack from '../components/common/ToastStack';
import {
  NODE_TYPE_LABELS,
  buildNodeIndex,
  collectUniqueEdges,
  createCoordinateMapper,
  formatRoutePath,
  getActiveFloorNumber,
  getFloorsForLevel,
  geometryToKonvaPolygons,
  getFloorsForBuilding,
  getGeometryCentroid,
  getGeometryPolygons,
  getMapContentBounds,
  getNodeById,
  getVisibleEdges,
  normalizeMapPayload,
  routeEdgeSet,
  routeNodeSet,
} from '../domain/mapModel';
import * as mapApi from '../api/mapApi';

const ALL_NODE_TYPES = ['ROOM', 'CORRIDOR_POINT', 'ENTRANCE', 'EXIT', 'STAIR', 'ELEVATOR', 'RESTROOM', 'CAFETERIA', 'OFFICE', 'PATH', 'INTERSECTION', 'GATE', 'COURTYARD', 'LANDMARK'];
const MIN_SCALE = 0.08;
const MAX_SCALE = 3;

function isDefaultCampus(building) {
  return String(building?.name || '').trim().toLowerCase() === 'default campus';
}

function polygonGeometry(points) {
  const closed = points.length && (points[0].x !== points[points.length - 1].x || points[0].y !== points[points.length - 1].y)
    ? [...points, points[0]]
    : points;
  return { type: 'Polygon', coordinates: [closed.map((point) => [Math.round(point.x), Math.round(point.y)])] };
}

function offsetGeometry(geometry, dx, dy) {
  const polygons = getGeometryPolygons(geometry);
  if (polygons.length === 0) return geometry;
  if (polygons.length === 1) {
    return polygonGeometry(polygons[0].map((point) => ({ x: point.x + dx, y: point.y + dy })));
  }
  return {
    type: 'MultiPolygon',
    coordinates: polygons.map((polygon) => [[
      ...polygon.map((point) => [Math.round(point.x + dx), Math.round(point.y + dy)]),
      [Math.round(polygon[0].x + dx), Math.round(polygon[0].y + dy)],
    ]]),
  };
}

function updateGeometryPoint(geometry, pointIndex, nextPoint) {
  const polygon = getGeometryPolygons(geometry)[0] || [];
  const openPolygon = openGeometryRing(polygon);
  if (!openPolygon[pointIndex]) return geometry;
  const next = openPolygon.map((point, index) => (
    index === pointIndex ? { x: Math.round(nextPoint.x), y: Math.round(nextPoint.y) } : point
  ));
  return polygonGeometry(next);
}

function openGeometryRing(polygon) {
  if (!Array.isArray(polygon)) return [];
  return polygon.length > 1 && polygon[0].x === polygon[polygon.length - 1].x && polygon[0].y === polygon[polygon.length - 1].y
    ? polygon.slice(0, -1)
    : polygon;
}

function mapStateSnapshot({ organization, buildings, floors }) {
  return JSON.stringify({
    organization,
    buildings,
    floors,
  });
}

function useElementSize() {
  const ref = useRef(null);
  const [size, setSize] = useState({ width: 0, height: 0 });

  useEffect(() => {
    if (!ref.current) return undefined;
    const element = ref.current;
    const update = () => {
      const rect = element.getBoundingClientRect();
      setSize({ width: Math.max(360, Math.floor(rect.width)), height: Math.max(460, Math.floor(rect.height)) });
    };
    update();
    const observer = new ResizeObserver(update);
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  return [ref, size];
}

function fitTransform(container, bounds) {
  const padding = 54;
  const width = Math.max(1, bounds.maxX - bounds.minX);
  const height = Math.max(1, bounds.maxY - bounds.minY);
  const scale = Math.min((container.width - padding * 2) / width, (container.height - padding * 2) / height);
  const clampedScale = Math.max(MIN_SCALE, Math.min(MAX_SCALE, scale));
  return {
    scale: clampedScale,
    x: (container.width - width * clampedScale) / 2 - bounds.minX * clampedScale,
    y: (container.height - height * clampedScale) / 2 - bounds.minY * clampedScale,
  };
}

function isCanceledError(error) {
  return Boolean(error) && (error.code === 'ERR_CANCELED' || error.name === 'CanceledError' || error.message === 'canceled');
}

function cleanNumber(value, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function clampNumber(value, min, max) {
  if (max < min) return min;
  return Math.max(min, Math.min(max, value));
}

function clampPointToCanvas(point, canvas) {
  return {
    x: clampNumber(cleanNumber(point?.x), 0, canvas.width),
    y: clampNumber(cleanNumber(point?.y), 0, canvas.height),
  };
}

function getGeometryBounds(geometry) {
  const points = getGeometryPolygons(geometry).flat();
  if (points.length === 0) return null;
  return points.reduce((bounds, point) => ({
    minX: Math.min(bounds.minX, point.x),
    minY: Math.min(bounds.minY, point.y),
    maxX: Math.max(bounds.maxX, point.x),
    maxY: Math.max(bounds.maxY, point.y),
  }), { minX: Infinity, minY: Infinity, maxX: -Infinity, maxY: -Infinity });
}

function clampGeometryToCanvas(geometry, canvas) {
  const bounds = getGeometryBounds(geometry);
  if (!bounds) return geometry;
  const dx = bounds.minX < 0 ? -bounds.minX : bounds.maxX > canvas.width ? canvas.width - bounds.maxX : 0;
  const dy = bounds.minY < 0 ? -bounds.minY : bounds.maxY > canvas.height ? canvas.height - bounds.maxY : 0;
  return dx || dy ? offsetGeometry(geometry, dx, dy) : geometry;
}

function clampImagePatch(item, patch, canvas) {
  const width = clampNumber(cleanNumber(patch.width, item.width || 800), 80, canvas.width);
  const height = clampNumber(cleanNumber(patch.height, item.height || 600), 80, canvas.height);
  const x = clampNumber(cleanNumber(patch.x, item.x), 0, Math.max(0, canvas.width - width));
  const y = clampNumber(cleanNumber(patch.y, item.y), 0, Math.max(0, canvas.height - height));
  const next = { ...patch };
  if ('width' in patch || 'x' in patch) next.width = width;
  if ('height' in patch || 'y' in patch) next.height = height;
  if ('x' in patch || 'width' in patch) next.x = x;
  if ('y' in patch || 'height' in patch) next.y = y;
  return next;
}

function targetHasSelectedElement(target, stage) {
  let node = target;
  while (node && node !== stage) {
    if (node.getAttr?.('mapElementSelected')) return true;
    node = node.getParent?.();
  }
  return false;
}

function moveKonvaNodeToLayer(node, layer) {
  if (!node || !layer || node.getLayer?.() === layer) return;
  const previousLayer = node.getLayer?.();
  node.moveTo(layer);
  previousLayer?.batchDraw();
  layer.batchDraw();
}

function makeRectFromPoints(a, b) {
  return {
    x: Math.min(a.x, b.x),
    y: Math.min(a.y, b.y),
    width: Math.abs(a.x - b.x),
    height: Math.abs(a.y - b.y),
  };
}

function rectsIntersect(a, b) {
  return a.x <= b.x + b.width
    && a.x + a.width >= b.x
    && a.y <= b.y + b.height
    && a.y + a.height >= b.y;
}

function pointInRect(point, rect) {
  return point.x >= rect.x
    && point.x <= rect.x + rect.width
    && point.y >= rect.y
    && point.y <= rect.y + rect.height;
}

function rectCorners(rect) {
  return [
    { x: rect.x, y: rect.y },
    { x: rect.x + rect.width, y: rect.y },
    { x: rect.x, y: rect.y + rect.height },
    { x: rect.x + rect.width, y: rect.y + rect.height },
  ];
}

function boundsFromRects(rects) {
  if (!rects.length) return null;
  const bounds = rects.reduce((current, rect) => ({
    minX: Math.min(current.minX, rect.x),
    minY: Math.min(current.minY, rect.y),
    maxX: Math.max(current.maxX, rect.x + rect.width),
    maxY: Math.max(current.maxY, rect.y + rect.height),
  }), { minX: Infinity, minY: Infinity, maxX: -Infinity, maxY: -Infinity });
  return {
    x: bounds.minX,
    y: bounds.minY,
    width: bounds.maxX - bounds.minX,
    height: bounds.maxY - bounds.minY,
  };
}

function lineBounds(from, to) {
  return {
    x: Math.min(from.x, to.x),
    y: Math.min(from.y, to.y),
    width: Math.abs(from.x - to.x),
    height: Math.abs(from.y - to.y),
  };
}

function emptySelection() {
  return { nodeIds: [], edgeIds: [], buildingIds: [], imageIds: [] };
}

function getFloorClosestToZero(floors) {
  return [...floors].sort((a, b) => {
    const distance = Math.abs(Number(a.floorNumber || 0)) - Math.abs(Number(b.floorNumber || 0));
    return distance || Number(a.floorNumber || 0) - Number(b.floorNumber || 0);
  })[0] || null;
}

function selectionCount(selection) {
  return (selection?.nodeIds?.length || 0)
    + (selection?.edgeIds?.length || 0)
    + (selection?.buildingIds?.length || 0)
    + (selection?.imageIds?.length || 0);
}

function humanType(type) {
  return NODE_TYPE_LABELS[type] || String(type || '').toLowerCase().replace(/_/g, ' ').replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function slugIdentifier(value, fallback = 'NODE') {
  const slug = String(value || fallback)
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return slug || fallback;
}

function uniqueIdentifier(base, floor) {
  const existing = new Set((floor?.nodes || []).map((node) => String(node.externalIdentifier || '').toUpperCase()));
  let candidate = slugIdentifier(base);
  let index = 2;
  while (existing.has(candidate)) {
    candidate = `${slugIdentifier(base)}-${index}`;
    index += 1;
  }
  return candidate;
}

function nextNodeName(floors) {
  const used = new Set(floors.flatMap((floor) => (floor.nodes || []).map((node) => String(node.name || '').toLowerCase())));
  let index = 1;
  while (used.has(`node ${index}`)) index += 1;
  return `Node ${index}`;
}

function useToasts() {
  const [toasts, setToasts] = useState([]);
  function pushToast(title, message, tone = 'info') {
    const id = `${Date.now()}-${Math.random()}`;
    setToasts((current) => [...current, { id, title, message, tone }].slice(-5));
    window.setTimeout(() => {
      setToasts((current) => current.filter((toast) => toast.id !== id));
    }, 5200);
  }
  return [toasts, pushToast, (id) => setToasts((current) => current.filter((toast) => toast.id !== id))];
}

function useKonvaImage(src) {
  const [image, setImage] = useState(null);
  useEffect(() => {
    if (!src) {
      setImage(null);
      return undefined;
    }
    const img = new window.Image();
    img.onload = () => setImage(img);
    img.src = src;
    return () => {
      img.onload = null;
    };
  }, [src]);
  return image;
}

function TracingImage({
  item,
  visible,
  opacity,
  selected,
  movable = true,
  tool,
  handleRadius,
  handleStrokeWidth,
  handlesVisible,
  mainLayerRef,
  dragLayerRef,
  onSelect,
  onDragEnd,
  onResizeEnd,
  onRotateEnd,
}) {
  const image = useKonvaImage(item.imagePath || item.url);
  if (!image || visible === false) return null;
  const width = cleanNumber(item.width, image.width || 600);
  const height = cleanNumber(item.height, image.height || 400);
  const x = cleanNumber(item.x);
  const y = cleanNumber(item.y);
  const rotation = cleanNumber(item.rotation);
  const canSelect = tool === 'select' || tool === 'pan';
  const canEdit = movable && (tool === 'select' || tool === 'pan') && selected && !item.locked;
  const center = { x: width / 2, y: height / 2 };
  const rotateHandleOffset = handleRadius * 4;
  return (
    <Group
      x={x + center.x}
      y={y + center.y}
      offsetX={center.x}
      offsetY={center.y}
      rotation={rotation}
      draggable={canEdit}
      listening={canSelect}
      mapElementSelected={selected}
      onClick={(event) => {
        event.cancelBubble = true;
        onSelect(item.id);
      }}
      onTap={() => onSelect(item.id)}
      onDragStart={(event) => moveKonvaNodeToLayer(event.target, dragLayerRef?.current)}
      onDragEnd={(event) => {
        moveKonvaNodeToLayer(event.target, mainLayerRef?.current);
        onDragEnd(item.id, {
          x: Math.round(event.target.x() - center.x),
          y: Math.round(event.target.y() - center.y),
        });
      }}
    >
      <KonvaImage
        image={image}
        width={width}
        height={height}
        opacity={cleanNumber(opacity ?? item.opacity, 0.48)}
      />
      {selected ? (
        <>
          <Rect width={width} height={height} stroke="#ffd166" strokeWidth={handleStrokeWidth} dash={[handleRadius * 3, handleRadius * 2]} listening={false} />
          {handlesVisible ? (
            <Circle
              x={width}
              y={height}
              radius={handleRadius}
              fill="#ffd166"
              stroke="#332612"
              strokeWidth={handleStrokeWidth}
              draggable={!item.locked}
              onDragEnd={(event) => {
                event.cancelBubble = true;
                onResizeEnd(item.id, {
                  width: Math.max(80, Math.round(event.target.x())),
                  height: Math.max(80, Math.round(event.target.y())),
                });
                event.target.position({ x: width, y: height });
              }}
            />
          ) : null}
          <Line
            points={[center.x, 0, center.x, -rotateHandleOffset]}
            stroke="#ffd166"
            strokeWidth={handleStrokeWidth}
            listening={false}
          />
          <Circle
            x={center.x}
            y={-rotateHandleOffset}
            radius={handleRadius}
            fill="#ffffff"
            stroke="#332612"
            strokeWidth={handleStrokeWidth}
            draggable={!item.locked}
            onDragEnd={(event) => {
              event.cancelBubble = true;
              const local = event.target.position();
              const angle = Math.atan2(local.y - center.y, local.x - center.x) * (180 / Math.PI) + 90;
              onRotateEnd(item.id, { rotation: Math.round(angle) });
              event.target.position({ x: center.x, y: -rotateHandleOffset });
            }}
          />
        </>
      ) : null}
    </Group>
  );
}

function EditorLayers({
  organization,
  buildings,
  floors,
  activeBuildingId,
  activeFloorId,
  selected,
  onSelectOrganization,
  onSelectImage,
  onToggleImage,
  onDeleteImage,
  onSelectBuilding,
  onSelectFloor,
  onSelectNode,
}) {
  const defaultCampus = buildings.find(isDefaultCampus);
  const regularBuildings = buildings.filter((building) => !isDefaultCampus(building));
  const orderedBuildings = defaultCampus ? [defaultCampus, ...regularBuildings] : regularBuildings;

  return (
    <aside className="editorSidebar">
      <div className="panelHeader">
        <Layers size={18} />
        <h2>Layers</h2>
      </div>
      <button className={`layerRow ${selected?.kind === 'organization' ? 'isActive' : ''}`} type="button" onClick={onSelectOrganization}>
        <ChevronsUpDown size={15} />
        <span>{organization?.name || 'Organization'}</span>
      </button>
      <section className="referenceLayerBlock">
        <h3>Reference Images</h3>
        {(organization?.tracingImages || []).length === 0 ? <p className="emptyHint">No blueprint overlays yet.</p> : null}
        {(organization?.tracingImages || []).sort((a, b) => cleanNumber(a.zIndex) - cleanNumber(b.zIndex)).map((image) => (
          <div className={`layerRow imageLayerRow ${selected?.kind === 'image' && selected.id === image.id ? 'isActive' : ''}`} key={image.id || image.imagePath}>
            <button type="button" title={image.visible === false ? 'Show blueprint' : 'Hide blueprint'} onClick={() => onToggleImage(image.id)}>
              {image.visible === false ? <EyeOff size={14} /> : <Eye size={14} />}
            </button>
            <button type="button" onClick={() => onSelectImage(image.id)}>
              <ImageIcon size={14} />
              <span>{image.name || image.filename || 'Reference image'}</span>
            </button>
            <button type="button" title="Delete blueprint" onClick={() => onDeleteImage(image.id)}>
              <Trash2 size={14} />
            </button>
          </div>
        ))}
      </section>
      <section className="buildingTree">
        <h3>Buildings</h3>
        {orderedBuildings.map((building) => {
          const buildingFloors = getFloorsForBuilding(floors, building.id);
          const isActive = Number(building.id) === Number(activeBuildingId);
          return (
            <section className="treeBuilding" key={building.id}>
              {isDefaultCampus(building) ? <div className="outdoorDivider">Outdoor</div> : null}
              <button
                className={`treeBuildingButton ${isActive ? 'isActive' : ''} ${selected?.kind === 'building' && Number(selected.id) === Number(building.id) ? 'isSelectedLayer' : ''}`}
                type="button"
                onClick={() => onSelectBuilding(building.id)}
              >
                <span className="buildingColor" style={{ backgroundColor: building.color || '#176b5f' }} aria-hidden="true" />
                <span>{building.name}</span>
                <small className={`statusPill status-${String(building.status || 'DRAFT').toLowerCase()}`}>{building.status || 'DRAFT'}</small>
              </button>
              {isActive ? (
                <div className="floorList">
                  {buildingFloors.length === 0 ? <p className="emptyHint">Add your first floor.</p> : null}
                  {buildingFloors.map((floor) => (
                    <div className="floorLayerGroup" key={floor.id}>
                      <button
                        className={`floorButton ${Number(activeFloorId) === Number(floor.id) ? 'isActive' : ''}`}
                        type="button"
                        onClick={() => onSelectFloor(floor.id)}
                      >
                        <Layers size={14} />
                        <span>{floor.name}</span>
                        <small>Level {floor.floorNumber}</small>
                      </button>
                      {Number(activeFloorId) === Number(floor.id) ? (
                        <div className="nodeLayerList">
                          {(floor.nodes || []).map((node) => (
                            <button
                              className={`nodeLayerRow ${selected?.kind === 'node' && Number(selected.id) === Number(node.id) ? 'isActive' : ''}`}
                              type="button"
                              key={node.id}
                              onClick={() => onSelectNode(node.id)}
                            >
                              <CircleDot size={12} />
                              <span>{node.externalIdentifier || node.name}</span>
                            </button>
                          ))}
                        </div>
                      ) : null}
                    </div>
                  ))}
                </div>
              ) : null}
            </section>
          );
        })}
      </section>
    </aside>
  );
}

function EditorCanvas({
  organization,
  buildings,
  floors,
  activeBuildingId,
  activeFloor,
  selected,
  tool,
  draftPolygon,
  currentRoute,
  connectSourceId,
  routePickStep,
  onCanvasPoint,
  onPolygonPoint,
  onClosePolygon,
  onSelectImage,
  onSelectBuilding,
  onSelectNode,
  onSelectEdge,
  onSelectMany,
  onActivateSelectTool,
  viewportMemoryRef,
  onImageChange,
  onBulkDragEnd,
  onNodeDragEnd,
  onBuildingDragEnd,
  onBuildingVertexDragEnd,
  onConnectNode,
  onRoutePickNode,
}) {
  const [hostRef, size] = useElementSize();
  // The marquee box and the pan offset used to be React state
  // (`selectionBox` / `transform`) updated on every single mousemove event.
  // Since every building/node/edge/image in the render body reads from
  // those, each drag frame forced a full re-render *and* a Konva prop-diff
  // of the entire map (plus a real canvas repaint of every shadowBlur'd
  // node) up to 60 times a second - this is what made "select" (marquee)
  // and "pan" unusably slow.
  // The marquee box is driven imperatively via a Konva ref during the live
  // gesture (see handleMouseMove/handleStagePointerUp).
  // Panning is driven by a plain CSS transform on panWrapperRef instead: a
  // pure GPU compositor translate of the already-painted canvas bitmap,
  // with no Konva reconciliation and no canvas repaint at all during the
  // drag (moving the Stage node itself every frame, even imperatively via
  // stage.position()/batchDraw(), still forces Konva to re-rasterize the
  // whole layer on every mousemove, which is what made an earlier attempt
  // at this fix slower than doing nothing). See handleMouseMove for how the
  // drag delta is computed from raw native pointer coordinates so this
  // CSS transform can't feed back into itself (that feedback loop is what
  // caused visible "glitter" in another earlier attempt).
  // Both marquee and pan only commit to React state once, when the gesture
  // actually ends.
  const panWrapperRef = useRef(null);
  const mainLayerRef = useRef(null);
  const dragLayerRef = useRef(null);
  const selectionRectRef = useRef(null);
  const drawPreviewCircleRef = useRef(null);
  const nodePreviewCircleRef = useRef(null);
  const stageSize = useMemo(() => (
    size.width && size.height ? size : { width: 900, height: 640 }
  ), [size]);
  const canvas = { width: cleanNumber(organization?.canvasWidth, 8000), height: cleanNumber(organization?.canvasHeight, 6000) };
  const activeFloorNumber = getActiveFloorNumber(floors, activeFloor?.id);
  const visibleFloors = activeFloorNumber === null ? floors : getFloorsForLevel(floors, activeFloorNumber);
  const activeBuilding = buildings.find((building) => Number(building.id) === Number(activeBuildingId));
  const bounds = useMemo(
    () => getMapContentBounds({ organization, buildings, floors }),
    [organization, buildings, floors]
  );
  const initialTransform = useMemo(() => fitTransform(stageSize, bounds), [stageSize, bounds]);
  const [transform, setTransformState] = useState(() => (
    viewportMemoryRef?.current?.organizationId === organization?.id
      ? viewportMemoryRef.current.transform
      : initialTransform
  ));
  // Mirrors `transform` at all times, but during an active pan drag it is
  // also updated synchronously (bypassing React state entirely - see
  // handleMouseMove). The Stage's x/y/scale props below read from this ref
  // rather than from `transform` directly, so if an unrelated re-render
  // fires mid-drag (autosave, a toast), React reapplies the true live
  // position instead of snapping the canvas back to a stale one.
  const transformRef = useRef(transform);
  const stageRef = useRef(null);
  const panSessionRef = useRef(null);
  const suppressClickSelectionRef = useRef(false);
  // Tracks an in-progress wheel/trackpad zoom gesture the same way
  // panSessionRef tracks an in-progress pan: { live, timeoutId }. `live` is
  // the not-yet-committed {x, y, scale}, chained across consecutive wheel
  // ticks. See handleWheel for why this can't just call setCanvasTransform
  // on every tick.
  const zoomSessionRef = useRef(null);
  const mapper = useMemo(() => createCoordinateMapper(transform), [transform]);
  const routeNodes = useMemo(() => routeNodeSet(currentRoute), [currentRoute]);
  const routeEdges = useMemo(() => routeEdgeSet(currentRoute), [currentRoute]);
  const nodesById = useMemo(() => buildNodeIndex(floors), [floors]);
  const visibleNodesById = useMemo(() => buildNodeIndex(visibleFloors), [visibleFloors]);
  const sameFloorEdges = useMemo(() => getVisibleEdges(visibleFloors), [visibleFloors]);
  const allEdges = useMemo(() => collectUniqueEdges(floors), [floors]);
  const tracingImages = useMemo(
    () => [...(organization?.tracingImages || [])].sort((a, b) => cleanNumber(a.zIndex) - cleanNumber(b.zIndex)),
    [organization?.tracingImages]
  );
  const lowerImages = tracingImages.filter((image) => cleanNumber(image.zIndex, 10) < 50);
  const upperImages = tracingImages.filter((image) => cleanNumber(image.zIndex, 10) >= 50);
  const selectedHandleVisible = transform.scale >= 0.12;
  const handleRadius = Math.min(Math.max(12 / transform.scale, 8), 120);
  const handleStrokeWidth = Math.min(Math.max(2.5 / transform.scale, 1), 18);
  const nodeRadius = Math.min(Math.max(14 / transform.scale, 8), 150);
  const nodeStrokeWidth = Math.min(Math.max(3 / transform.scale, 1), 24);
  const nodeHaloRadius = nodeRadius * 2.25;
  const labelFontSize = Math.min(Math.max(13 / transform.scale, 10), 38);
  const buildingLabelFontSize = Math.min(Math.max(21 / transform.scale, 16), 64);
  const buildingLabelPadding = Math.min(Math.max(7 / transform.scale, 4), 26);
  const visibleNodes = useMemo(
    () => floors.flatMap((floor) => (floor.nodes || []).map((node) => ({
      ...node,
      floorId: floor.id,
      buildingId: floor.buildingId,
      floorNumber: Number(floor.floorNumber),
    }))),
    [floors]
  );
  const multiSelection = selected?.kind === 'selection' ? selected.item : null;
  const selectedNodeIds = useMemo(() => new Set(multiSelection?.nodeIds || []), [multiSelection]);
  const selectedEdgeIds = useMemo(() => new Set(multiSelection?.edgeIds || []), [multiSelection]);
  const selectedBuildingIds = useMemo(() => new Set(multiSelection?.buildingIds || []), [multiSelection]);
  const selectedImageIds = useMemo(() => new Set(multiSelection?.imageIds || []), [multiSelection]);
  const selectedElementRects = useMemo(() => {
    if (!multiSelection) return [];
    const rects = [];
    buildings.forEach((building) => {
      if (!selectedBuildingIds.has(Number(building.id))) return;
      const bounds = getGeometryBounds(building.geometry);
      if (bounds) rects.push({ x: bounds.minX, y: bounds.minY, width: bounds.maxX - bounds.minX, height: bounds.maxY - bounds.minY });
    });
    tracingImages.forEach((image) => {
      if (!selectedImageIds.has(image.id) || image.visible === false) return;
      rects.push({
        x: cleanNumber(image.x),
        y: cleanNumber(image.y),
        width: cleanNumber(image.width, 800),
        height: cleanNumber(image.height, 600),
      });
    });
    visibleNodes.forEach((node) => {
      if (selectedNodeIds.has(Number(node.id))) {
        rects.push({ x: cleanNumber(node.xCoord) - nodeRadius, y: cleanNumber(node.yCoord) - nodeRadius, width: nodeRadius * 2, height: nodeRadius * 2 });
      }
    });
    return rects;
  }, [buildings, multiSelection, nodeRadius, selectedBuildingIds, selectedImageIds, selectedNodeIds, tracingImages, visibleNodes]);
  const selectedBounds = useMemo(() => boundsFromRects(selectedElementRects), [selectedElementRects]);
  const crossEdges = useMemo(
    () => allEdges.filter((edge) => {
      const from = nodesById.get(Number(edge.fromNodeId));
      const to = nodesById.get(Number(edge.toNodeId));
      return from && to && Number(from.floorNumber) !== Number(to.floorNumber);
    }),
    [allEdges, nodesById]
  );
  const otherLevelSameFloorEdges = useMemo(
    () => allEdges.filter((edge) => {
      const from = nodesById.get(Number(edge.fromNodeId));
      const to = nodesById.get(Number(edge.toNodeId));
      return from && to && Number(from.floorNumber) === Number(to.floorNumber) && !visibleNodesById.has(Number(edge.fromNodeId));
    }),
    [allEdges, nodesById, visibleNodesById]
  );
  const displayedSameFloorEdges = useMemo(() => {
    const byId = new Map();
    sameFloorEdges.forEach((edge) => byId.set(Number(edge.id), edge));
    otherLevelSameFloorEdges.forEach((edge) => byId.set(Number(edge.id), edge));
    return [...byId.values()];
  }, [otherLevelSameFloorEdges, sameFloorEdges]);

  const setCanvasTransform = useCallback((nextTransform) => {
    setTransformState((current) => {
      const value = typeof nextTransform === 'function' ? nextTransform(current) : nextTransform;
      transformRef.current = value;
      if (organization?.id) {
        viewportMemoryRef.current = { organizationId: organization.id, transform: value };
      }
      return value;
    });
  }, [organization?.id, viewportMemoryRef]);

  useEffect(() => {
    if (!organization?.id || !size.width || !size.height) return;
    if (viewportMemoryRef?.current?.organizationId === organization.id) return;
    setCanvasTransform(fitTransform(stageSize, bounds));
  }, [bounds, organization?.id, setCanvasTransform, size.height, size.width, stageSize, viewportMemoryRef]);

  useEffect(() => {
    panSessionRef.current = null;
    if (panWrapperRef.current) panWrapperRef.current.style.transform = '';
    if (drawPreviewCircleRef.current) {
      drawPreviewCircleRef.current.setAttrs({ visible: false });
      drawPreviewCircleRef.current.getLayer()?.batchDraw();
    }
    if (nodePreviewCircleRef.current) {
      nodePreviewCircleRef.current.setAttrs({ visible: false });
      nodePreviewCircleRef.current.getLayer()?.batchDraw();
    }
    if (selectionRectRef.current) {
      selectionRectRef.current.setAttrs({ visible: false, width: 0, height: 0 });
      selectionRectRef.current.getLayer()?.batchDraw();
    }
  }, [tool]);

  useEffect(() => () => {
    if (zoomSessionRef.current?.timeoutId) window.clearTimeout(zoomSessionRef.current.timeoutId);
  }, []);

  function pointerToMap() {
    const pointer = stageRef.current?.getPointerPosition();
    return pointer ? clampPointToCanvas(mapper.screenToMap(pointer), canvas) : null;
  }

  function collectMarqueeSelection(rect) {
    const next = emptySelection();
    buildings.forEach((building) => {
      const bounds = getGeometryBounds(building.geometry);
      if (!bounds) return;
      if (rectsIntersect(rect, { x: bounds.minX, y: bounds.minY, width: bounds.maxX - bounds.minX, height: bounds.maxY - bounds.minY })) {
        next.buildingIds.push(Number(building.id));
      }
    });
    tracingImages.forEach((image) => {
      if (image.visible === false) return;
      const imageRect = {
        x: cleanNumber(image.x),
        y: cleanNumber(image.y),
        width: cleanNumber(image.width, 800),
        height: cleanNumber(image.height, 600),
      };
      // A plain bounding-box overlap would also select an image whenever the
      // marquee merely happens to sit over it (e.g. selecting nodes/buildings
      // drawn on top of a blueprint). Require at least two of the image's
      // corners to actually fall inside the marquee before selecting it.
      const containedCorners = rectCorners(imageRect).filter((corner) => pointInRect(corner, rect)).length;
      if (containedCorners >= 2) {
        next.imageIds.push(image.id);
      }
    });
    visibleNodes.forEach((node) => {
      if (pointInRect({ x: cleanNumber(node.xCoord), y: cleanNumber(node.yCoord) }, rect)) {
        next.nodeIds.push(Number(node.id));
      }
    });
    sameFloorEdges.forEach((edge) => {
      const from = visibleNodesById.get(Number(edge.fromNodeId));
      const to = visibleNodesById.get(Number(edge.toNodeId));
      if (!from || !to) return;
      const edgeBounds = lineBounds(
        { x: cleanNumber(from.xCoord), y: cleanNumber(from.yCoord) },
        { x: cleanNumber(to.xCoord), y: cleanNumber(to.yCoord) }
      );
      if (rectsIntersect(rect, edgeBounds)) next.edgeIds.push(Number(edge.id));
    });
    return next;
  }

  function selectWithCurrentTool(action) {
    if (suppressClickSelectionRef.current) return;
    // Selecting an element (node/building/edge/blueprint) must never move or
    // rescale the canvas. This used to snapshot `transform` and forcibly
    // re-apply it to the Konva stage on every selection, but that snapshot
    // is React state and can be stale relative to the stage's actual live
    // position whenever a pan/zoom gesture is still settling (pan/zoom give
    // live visual feedback via a CSS transform before committing to
    // `transform` state - see handleMouseMove/handleWheel above). Re-applying
    // a stale snapshot at exactly that moment is what caused the viewport to
    // visibly jump/re-center when clicking something to select it. Simply
    // performing the selection, with no viewport side effects, is correct.
    if (tool === 'pan') onActivateSelectTool();
    action();
  }

  function handleStagePointerDown(event) {
    const stage = event.target.getStage();
    const pointer = stage?.getPointerPosition();
    const startsOnSelectedElement = targetHasSelectedElement(event.target, stage);
    if (tool === 'select' && !startsOnSelectedElement && pointer) {
      const point = pointerToMap();
      panSessionRef.current = point ? { type: 'marquee', pointer, startPoint: point, currentPoint: point, moved: false } : null;
      if (selectionRectRef.current) {
        selectionRectRef.current.setAttrs({ visible: false, width: 0, height: 0 });
        selectionRectRef.current.getLayer()?.batchDraw();
      }
      stage?.draggable(false);
      return;
    }
    const canPanWithTool = tool === 'pan' || tool === 'connect' || tool === 'route';
    const canMoveSelectedElement = tool === 'pan';
    panSessionRef.current = pointer && canPanWithTool && !(canMoveSelectedElement && startsOnSelectedElement)
      ? {
          type: 'pan',
          // Track the raw native pointer position (event.evt.clientX/Y), not
          // stage.getPointerPosition(). The pan gesture visually offsets the
          // Stage's container via a CSS transform on panWrapperRef while
          // dragging (see handleMouseMove), and getPointerPosition() derives
          // its result from that same container's live
          // getBoundingClientRect() - reading it again mid-drag would be
          // thrown off by the transform just applied on the previous frame,
          // a self-reinforcing feedback loop that produced visible
          // "glitter". clientX/clientY come straight from the native browser
          // event and are unaffected by any CSS transform on page elements.
          clientPoint: { x: event.evt?.clientX ?? 0, y: event.evt?.clientY ?? 0 },
          origin: { ...transformRef.current },
          moved: false,
          liveDx: 0,
          liveDy: 0,
        }
      : null;
    stage?.draggable(false);
    handleStageClick(event);
  }

  function handleStagePointerUp() {
    const session = panSessionRef.current;
    if (session?.type === 'marquee') {
      const box = makeRectFromPoints(session.startPoint, session.currentPoint);
      if (session.moved && box.width > 4 && box.height > 4) {
        const nextSelection = collectMarqueeSelection(box);
        onSelectMany(nextSelection);
      } else {
        onSelectNode(null);
      }
      if (selectionRectRef.current) {
        selectionRectRef.current.setAttrs({ visible: false, width: 0, height: 0 });
        selectionRectRef.current.getLayer()?.batchDraw();
      }
    }
    if (session?.type === 'pan' && session.moved) {
      // Commit the accumulated pan offset to React state exactly once (not
      // on every intermediate frame), then hand the wrapper's CSS transform
      // back to identity on the next animation frame - by then the Stage's
      // x/y props have already re-rendered at the same final position, so
      // there is no visible snap-back/flicker.
      const finalDx = session.liveDx || 0;
      const finalDy = session.liveDy || 0;
      setCanvasTransform({
        ...session.origin,
        x: session.origin.x + finalDx,
        y: session.origin.y + finalDy,
      });
      window.requestAnimationFrame(() => {
        if (panWrapperRef.current) panWrapperRef.current.style.transform = '';
      });
    }
    if (session?.moved) {
      suppressClickSelectionRef.current = true;
      window.setTimeout(() => {
        suppressClickSelectionRef.current = false;
      }, 0);
    }
    panSessionRef.current = null;
    stageRef.current?.draggable(false);
  }

  function handleStageClick(event) {
    if (suppressClickSelectionRef.current) return;
    if (event.target !== event.target.getStage()) return;
    const point = pointerToMap();
    if (!point) return;
    if (tool === 'draw') {
      onPolygonPoint(point);
    } else if (tool === 'addNode') {
      onCanvasPoint(point);
    } else {
      onSelectNode(null);
    }
  }

  function handleMouseMove(event) {
    const panSession = panSessionRef.current;
    if (panSession?.type === 'pan') {
      // Read the raw native event coordinates instead of
      // stage.getPointerPosition() - see the comment in
      // handleStagePointerDown for why getPointerPosition() is unsafe here
      // (it would feed back off the very CSS transform this handler applies
      // below, which is what caused the pan "glitter" in an earlier fix).
      const clientX = event?.evt?.clientX;
      const clientY = event?.evt?.clientY;
      if (typeof clientX !== 'number' || typeof clientY !== 'number') return;
      const dx = clientX - panSession.clientPoint.x;
      const dy = clientY - panSession.clientPoint.y;
      if (Math.hypot(dx, dy) > 2) panSession.moved = true;
      if (panSession.moved) {
        // Give live visual feedback with a plain CSS transform on a DOM
        // wrapper around the Stage, instead of pushing transform.x/y
        // through React state or calling stage.position()/batchDraw() on
        // every pointer event. This is purely a GPU compositor translate of
        // the already-rendered canvas bitmap - no Konva reconciliation and
        // no canvas repaint happen during the drag at all. The Stage itself
        // only moves once, when the gesture ends (see handleStagePointerUp).
        panSession.liveDx = dx;
        panSession.liveDy = dy;
        if (panWrapperRef.current) {
          panWrapperRef.current.style.transform = `translate3d(${dx}px, ${dy}px, 0)`;
        }
      }
      return;
    }
    const pointer = stageRef.current?.getPointerPosition();
    if (pointer && panSession) {
      if (panSession.type === 'marquee') {
        const point = pointerToMap();
        if (!point) return;
        const moved = Math.hypot(pointer.x - panSession.pointer.x, pointer.y - panSession.pointer.y);
        if (moved > 2) panSession.moved = true;
        panSession.currentPoint = point;
        if (panSession.moved) {
          // Update the marquee rectangle by mutating the Konva node directly
          // (via ref) instead of calling setState. This repaints only the
          // tiny, dedicated overlay layer it lives on - it never touches, or
          // triggers a re-render of, the layer holding every
          // building/node/edge/image.
          const rect = makeRectFromPoints(panSession.startPoint, point);
          if (selectionRectRef.current) {
            selectionRectRef.current.setAttrs({ x: rect.x, y: rect.y, width: rect.width, height: rect.height, visible: true });
            selectionRectRef.current.getLayer()?.batchDraw();
          }
        }
        return;
      }
    }
    const point = pointerToMap();
    if (!point) return;
    if (tool === 'draw') {
      const first = draftPolygon[0];
      const previewPoint = first && draftPolygon.length >= 3 && Math.hypot(point.x - first.x, point.y - first.y) < 42
        ? first
        : point;
      if (drawPreviewCircleRef.current) {
        drawPreviewCircleRef.current.setAttrs({
          x: previewPoint.x,
          y: previewPoint.y,
          radius: nodeRadius,
          strokeWidth: nodeStrokeWidth,
          visible: true,
        });
        drawPreviewCircleRef.current.getLayer()?.batchDraw();
      }
    }
    if (tool === 'addNode' && nodePreviewCircleRef.current) {
      nodePreviewCircleRef.current.setAttrs({
        x: point.x,
        y: point.y,
        radius: nodeRadius,
        strokeWidth: nodeStrokeWidth,
        visible: true,
      });
      nodePreviewCircleRef.current.getLayer()?.batchDraw();
    }
  }

  function handleWheel(event) {
    event.evt.preventDefault();
    // Wheel/trackpad zoom can fire many events per second. Committing a real
    // Konva scale/position change on every single one - which forces a React
    // re-render and a full prop-diff of every building/node/edge/image, the
    // same cost that made pan/marquee "unusably slow" per the notes above -
    // is what makes zoom feel slow. Even bypassing React and calling
    // stage.scale()/position()/batchDraw() imperatively on every tick isn't
    // fast enough either, for the same reason noted above for pan: Konva
    // still has to re-rasterize the whole layer's canvas on every change.
    // So apply the same fix used for pan: give live feedback with a plain
    // CSS transform on panWrapperRef (a GPU compositor transform of the
    // already-painted canvas bitmap - no Konva reconciliation, no canvas
    // repaint), and only commit one real Konva/React update after the
    // gesture settles.
    //
    // The pointer position is read from the raw native event relative to
    // hostRef's (untransformed) bounding rect rather than via
    // stage.getPointerPosition() - same reasoning as in
    // handleStagePointerDown/handleMouseMove: getPointerPosition() is
    // derived from the live CSS-transformed container and would feed back
    // on itself mid-gesture.
    const hostRect = hostRef.current?.getBoundingClientRect();
    if (!hostRect) return;
    const pointer = {
      x: event.evt.clientX - hostRect.left,
      y: event.evt.clientY - hostRect.top,
    };

    const session = zoomSessionRef.current || { live: { ...transformRef.current } };
    if (session.timeoutId) window.clearTimeout(session.timeoutId);

    const oldScale = session.live.scale;
    const mapPoint = {
      x: (pointer.x - session.live.x) / oldScale,
      y: (pointer.y - session.live.y) / oldScale,
    };
    const nextScale = event.evt.deltaY > 0 ? oldScale / 1.08 : oldScale * 1.08;
    const scale = Math.max(MIN_SCALE, Math.min(MAX_SCALE, nextScale));
    session.live = {
      scale,
      x: pointer.x - mapPoint.x * scale,
      y: pointer.y - mapPoint.y * scale,
    };

    // Express the live (uncommitted) transform as a CSS transform relative
    // to what's actually painted right now (the last committed transform):
    // screen_live = screen_painted * (live.scale / origin.scale) + t, the
    // same "screen_orig -> screen_live" derivation pan uses, generalized to
    // include scale so the pointer's map point stays fixed under the cursor.
    const origin = transformRef.current;
    const cssScale = session.live.scale / origin.scale;
    const cssX = session.live.x - origin.x * cssScale;
    const cssY = session.live.y - origin.y * cssScale;
    if (panWrapperRef.current) {
      panWrapperRef.current.style.transformOrigin = '0 0';
      panWrapperRef.current.style.transform = `translate3d(${cssX}px, ${cssY}px, 0) scale(${cssScale})`;
    }

    session.timeoutId = window.setTimeout(() => {
      const finalTransform = session.live;
      zoomSessionRef.current = null;
      setCanvasTransform(finalTransform);
      // Wait one frame before dropping the CSS transform back to identity -
      // by then the Stage's real x/y/scale props have already re-rendered
      // at the same final position, so there is no visible snap-back.
      window.requestAnimationFrame(() => {
        if (panWrapperRef.current) panWrapperRef.current.style.transform = '';
      });
    }, 120);

    zoomSessionRef.current = session;
  }

  return (
    <section className={`editorCanvas mapCanvasShell tool-${tool}`}>
      <div ref={hostRef} className="konvaCanvasHost">
        <div ref={panWrapperRef} className="konvaPanWrapper" style={{ width: '100%', height: '100%', willChange: 'transform' }}>
        <Stage
          ref={stageRef}
          width={stageSize.width}
          height={stageSize.height}
          x={transformRef.current.x}
          y={transformRef.current.y}
          scaleX={transformRef.current.scale}
          scaleY={transformRef.current.scale}
          draggable={false}
          onWheel={handleWheel}
          onMouseDown={handleStagePointerDown}
          onMouseUp={handleStagePointerUp}
          onMouseLeave={handleStagePointerUp}
          onMouseMove={handleMouseMove}
          onDblClick={() => {
            if (tool === 'draw' && draftPolygon.length >= 3) onClosePolygon();
          }}
        >
          <Layer ref={mainLayerRef}>
            <Rect x={0} y={0} width={canvas.width} height={canvas.height} fill="#202422" stroke="#f3f6f4" strokeWidth={24} listening={false} />
            {lowerImages.map((image) => (
              <TracingImage
                key={image.id || image.imagePath || image.url}
                item={image}
                visible={image.visible}
                opacity={image.opacity}
                selected={(selected?.kind === 'image' && selected.id === image.id) || selectedImageIds.has(image.id)}
                movable={selected?.kind !== 'selection'}
                tool={tool}
                onSelect={(id) => selectWithCurrentTool(() => onSelectImage(id))}
                onDragEnd={(id, patch) => onImageChange(id, patch)}
                onResizeEnd={(id, patch) => onImageChange(id, patch)}
                onRotateEnd={(id, patch) => onImageChange(id, patch)}
                handleRadius={handleRadius}
                handleStrokeWidth={handleStrokeWidth}
                handlesVisible={selectedHandleVisible}
                mainLayerRef={mainLayerRef}
                dragLayerRef={dragLayerRef}
              />
            ))}

            {buildings.map((building) => {
              const isActive = Number(building.id) === Number(activeBuildingId);
              const isSelected = (selected?.kind === 'building' && Number(selected.id) === Number(building.id)) || selectedBuildingIds.has(Number(building.id));
              const polygons = geometryToKonvaPolygons(building.geometry);
              return (
                <Group
                  key={`building-${building.id}`}
                  listening={tool === 'select' || tool === 'pan'}
                  draggable={(tool === 'select' || tool === 'pan') && isSelected && selected?.kind !== 'selection'}
                  mapElementSelected={isSelected && selected?.kind !== 'selection'}
                  onDragStart={(event) => moveKonvaNodeToLayer(event.target, dragLayerRef.current)}
                  onDragEnd={(event) => {
                    moveKonvaNodeToLayer(event.target, mainLayerRef.current);
                    onBuildingDragEnd(building.id, { dx: event.target.x(), dy: event.target.y() });
                    event.target.position({ x: 0, y: 0 });
                  }}
                  onClick={(event) => {
                    event.cancelBubble = true;
                    if (tool === 'select' || tool === 'pan') selectWithCurrentTool(() => onSelectBuilding(building.id));
                  }}
                  onTap={() => {
                    if (tool === 'select' || tool === 'pan') selectWithCurrentTool(() => onSelectBuilding(building.id));
                  }}
                >
                  {polygons.map((points, index) => (
                    <Line
                      key={`${building.id}-${index}`}
                      points={points}
                      closed
                      fill={building.color || '#25826f'}
                      opacity={isActive ? 0.42 : 0.22}
                      stroke={isSelected ? '#ffd166' : isActive ? '#9ce5d7' : '#d8e3df'}
                      strokeWidth={isSelected ? 8 : isActive ? 5 : 3}
                    />
                  ))}
                  {isSelected ? openGeometryRing(getGeometryPolygons(building.geometry)[0]).map((point, pointIndex) => (
                    selectedHandleVisible ? (
                      <Circle
                        key={`building-${building.id}-point-${pointIndex}`}
                        x={point.x}
                        y={point.y}
                        radius={handleRadius}
                        fill="#ffd166"
                        stroke="#332612"
                        strokeWidth={handleStrokeWidth}
                        draggable
                        onDragEnd={(event) => {
                          event.cancelBubble = true;
                          onBuildingVertexDragEnd(building.id, pointIndex, {
                            x: event.target.x(),
                            y: event.target.y(),
                          });
                        }}
                      />
                    ) : null
                  )) : null}
                </Group>
              );
            })}

            {upperImages.map((image) => (
              <TracingImage
                key={image.id || image.imagePath || image.url}
                item={image}
                visible={image.visible}
                opacity={image.opacity}
                selected={(selected?.kind === 'image' && selected.id === image.id) || selectedImageIds.has(image.id)}
                movable={selected?.kind !== 'selection'}
                tool={tool}
                onSelect={(id) => selectWithCurrentTool(() => onSelectImage(id))}
                onDragEnd={(id, patch) => onImageChange(id, patch)}
                onResizeEnd={(id, patch) => onImageChange(id, patch)}
                onRotateEnd={(id, patch) => onImageChange(id, patch)}
                handleRadius={handleRadius}
                handleStrokeWidth={handleStrokeWidth}
                handlesVisible={selectedHandleVisible}
                mainLayerRef={mainLayerRef}
                dragLayerRef={dragLayerRef}
              />
            ))}

            {activeFloor ? geometryToKonvaPolygons(activeFloor.geometry).map((points, index) => (
              <Line key={`floor-${activeFloor.id}-${index}`} points={points} closed stroke="#ffffff" strokeWidth={4} dash={[20, 12]} opacity={0.85} listening={false} />
            )) : null}

            {displayedSameFloorEdges.map((edge) => {
              const from = nodesById.get(Number(edge.fromNodeId));
              const to = nodesById.get(Number(edge.toNodeId));
              if (!from || !to) return null;
              const isSelected = (selected?.kind === 'edge' && Number(selected.id) === Number(edge.id)) || selectedEdgeIds.has(Number(edge.id));
              const isRoute = routeEdges.has(`${edge.fromNodeId}->${edge.toNodeId}`) || routeEdges.has(`${edge.toNodeId}->${edge.fromNodeId}`);
              const isCurrentLevelEdge = Number(from.floorNumber) === Number(activeFloorNumber) || Number(to.floorNumber) === Number(activeFloorNumber);
              return (
                <Group key={edge.id}>
                  <Line
                    points={[cleanNumber(from.xCoord), cleanNumber(from.yCoord), cleanNumber(to.xCoord), cleanNumber(to.yCoord)]}
                    stroke={isRoute ? '#ffd166' : isSelected ? '#9ce5d7' : '#e8efec'}
                    strokeWidth={isRoute ? 10 : isSelected ? 7 : 4}
                    opacity={isRoute || isCurrentLevelEdge ? 1 : 0.28}
                    dash={edge.accessible === false ? [16, 10] : undefined}
                    lineCap="round"
                    listening={tool === 'select' || tool === 'pan'}
                    onClick={(event) => {
                      event.cancelBubble = true;
                      if (tool === 'select' || tool === 'pan') selectWithCurrentTool(() => onSelectEdge(edge.id));
                    }}
                    onTap={() => {
                      if (tool === 'select' || tool === 'pan') selectWithCurrentTool(() => onSelectEdge(edge.id));
                    }}
                  />
                  {(isSelected || isRoute) ? (
                  <Label x={(cleanNumber(from.xCoord) + cleanNumber(to.xCoord)) / 2 + 10} y={(cleanNumber(from.yCoord) + cleanNumber(to.yCoord)) / 2 - 20} listening={false}>
                    <Tag fill="#ffffff" cornerRadius={3} opacity={0.88} />
                    <Text text={`${edge.distance}m`} fill="#24302d" fontSize={16} fontStyle="bold" padding={5} />
                  </Label>
                  ) : null}
                </Group>
              );
            })}

            {crossEdges.map((edge) => {
              const from = nodesById.get(Number(edge.fromNodeId));
              const to = nodesById.get(Number(edge.toNodeId));
              if (!from || !to) return null;
              const isSelected = selected?.kind === 'edge' && Number(selected.id) === Number(edge.id);
              const isRelatedToSelectedNode = selected?.kind === 'node' && (Number(edge.fromNodeId) === Number(selected.id) || Number(edge.toNodeId) === Number(selected.id));
              const isConnectSource = tool === 'connect' && (Number(edge.fromNodeId) === Number(connectSourceId) || Number(edge.toNodeId) === Number(connectSourceId));
              const isRoute = routeEdges.has(`${edge.fromNodeId}->${edge.toNodeId}`) || routeEdges.has(`${edge.toNodeId}->${edge.fromNodeId}`);
              return (
                <Group
                  key={`cross-${edge.id}`}
                  listening={tool === 'select' || tool === 'pan' || tool === 'connect'}
                  onClick={() => {
                    if (tool === 'select' || tool === 'pan') selectWithCurrentTool(() => onSelectEdge(edge.id));
                    else onSelectEdge(edge.id);
                  }}
                  onTap={() => {
                    if (tool === 'select' || tool === 'pan') selectWithCurrentTool(() => onSelectEdge(edge.id));
                    else onSelectEdge(edge.id);
                  }}
                >
                  <Line
                    points={[cleanNumber(from.xCoord), cleanNumber(from.yCoord), cleanNumber(to.xCoord), cleanNumber(to.yCoord)]}
                    stroke={isRoute ? '#ffd166' : '#4aa3ff'}
                    strokeWidth={isRoute ? 10 : isSelected ? 7 : 4}
                    dash={isRoute ? [28, 16] : [16, 12]}
                    opacity={isRoute || isSelected || isRelatedToSelectedNode || isConnectSource ? 1 : 0.52}
                    lineCap="round"
                  />
                </Group>
              );
            })}

            {draftPolygon.length > 0 ? (
              <>
                <Line
                  points={draftPolygon.flatMap((point) => [point.x, point.y])}
                  closed={false}
                  stroke="#ffd166"
                  strokeWidth={5}
                  dash={[14, 8]}
                  lineCap="round"
                  listening={false}
                />
                {draftPolygon.map((point, index) => (
                  <Circle
                    key={`draft-point-${index}`}
                    x={point.x}
                    y={point.y}
                    radius={index === 0 && draftPolygon.length >= 3 ? nodeRadius * 1.2 : nodeRadius}
                    fill={index === 0 && draftPolygon.length >= 3 ? '#fff3c4' : '#ffd166'}
                    stroke="#332612"
                    strokeWidth={nodeStrokeWidth}
                    onClick={(event) => {
                      event.cancelBubble = true;
                      if (index === 0 && draftPolygon.length >= 3) onClosePolygon();
                    }}
                    onTap={() => {
                      if (index === 0 && draftPolygon.length >= 3) onClosePolygon();
                    }}
                  />
                ))}
              </>
            ) : null}

            {visibleNodes.map((node) => {
              const isSelected = (selected?.kind === 'node' && Number(selected.id) === Number(node.id)) || selectedNodeIds.has(Number(node.id));
              const isRoute = routeNodes.has(Number(node.id));
              const isConnectSource = Number(connectSourceId) === Number(node.id);
              const isCurrentLevelNode = activeFloorNumber === null || Number(node.floorNumber) === Number(activeFloorNumber);
              const fill = isSelected || isConnectSource ? '#0d4f46' : isRoute ? '#d8913c' : node.type === 'ENTRANCE' || node.type === 'GATE' ? '#23a56f' : '#2f8cff';
              return (
                <Group
                  key={node.id}
                  x={cleanNumber(node.xCoord)}
                  y={cleanNumber(node.yCoord)}
                  draggable={(tool === 'select' || tool === 'pan') && isSelected && selected?.kind !== 'selection'}
                  mapElementSelected={isSelected && selected?.kind !== 'selection'}
                  onDragStart={(event) => moveKonvaNodeToLayer(event.target, dragLayerRef.current)}
                  onDragEnd={(event) => {
                    moveKonvaNodeToLayer(event.target, mainLayerRef.current);
                    const point = clampPointToCanvas({ x: event.target.x(), y: event.target.y() }, canvas);
                    onNodeDragEnd(node.id, { xCoord: point.x, yCoord: point.y });
                    event.target.position(point);
                  }}
                  onClick={(event) => {
                    event.cancelBubble = true;
                    if (tool === 'connect') onConnectNode(node.id);
                    else if (tool === 'route') onRoutePickNode(node);
                    else if (tool === 'select' || tool === 'pan') selectWithCurrentTool(() => onSelectNode(node.id));
                  }}
                  onTap={() => {
                    if (tool === 'connect') onConnectNode(node.id);
                    else if (tool === 'route') onRoutePickNode(node);
                    else if (tool === 'select' || tool === 'pan') selectWithCurrentTool(() => onSelectNode(node.id));
                  }}
                >
                  {isSelected || isConnectSource ? <Circle radius={nodeHaloRadius} fill={fill} opacity={0.18} listening={false} /> : null}
                  <Circle radius={nodeRadius} fill={fill} opacity={isCurrentLevelNode || isSelected || isRoute ? 1 : 0.34} stroke={isCurrentLevelNode ? '#d8ebff' : '#9fb3c7'} strokeWidth={nodeStrokeWidth} shadowColor="rgba(0,0,0,0.32)" shadowBlur={8} />
                  {(isSelected || isRoute || isConnectSource || tool === 'route') ? (
                  <Label x={nodeRadius + 7 / transform.scale} y={nodeRadius + 3 / transform.scale} listening={false}>
                    <Tag fill="#ffffff" stroke="#d6ded9" strokeWidth={1} cornerRadius={3} />
                    <Text text={node.externalIdentifier || node.name} fill="#18211f" padding={5 / transform.scale} fontSize={labelFontSize} fontStyle="bold" />
                  </Label>
                  ) : null}
                </Group>
              );
            })}

            {buildings.map((building) => {
              const isActive = Number(building.id) === Number(activeBuildingId);
              const isSelected = (selected?.kind === 'building' && Number(selected.id) === Number(building.id)) || selectedBuildingIds.has(Number(building.id));
              const labelPoint = getGeometryCentroid(building.geometry);
              if (!labelPoint || (!isSelected && !isActive)) return null;
              return (
                <Label key={`building-label-${building.id}`} x={labelPoint.x + buildingLabelFontSize} y={labelPoint.y + buildingLabelFontSize} listening={false}>
                  <Tag fill="#f8fbfa" cornerRadius={3} opacity={0.94} />
                  <Text text={building.name} fill="#1a2220" fontSize={buildingLabelFontSize} fontStyle="bold" padding={buildingLabelPadding} />
                </Label>
              );
            })}

            {selectedBounds && selectionCount(multiSelection) > 0 ? (
              <Group
                draggable={tool === 'select' || tool === 'pan'}
                mapElementSelected
                onDragStart={(event) => moveKonvaNodeToLayer(event.target, dragLayerRef.current)}
                onDragEnd={(event) => {
                  moveKonvaNodeToLayer(event.target, mainLayerRef.current);
                  onBulkDragEnd(multiSelection, { dx: event.target.x(), dy: event.target.y() });
                  event.target.position({ x: 0, y: 0 });
                }}
              >
                <Rect
                  x={selectedBounds.x}
                  y={selectedBounds.y}
                  width={selectedBounds.width}
                  height={selectedBounds.height}
                  fill="rgba(47, 140, 255, 0.02)"
                  stroke="#ffd166"
                  strokeWidth={handleStrokeWidth}
                  dash={[handleRadius * 2, handleRadius * 1.2]}
                />
              </Group>
            ) : null}
          </Layer>
          {/* Dedicated, always-listening={false} overlay layer for the live
              marquee rectangle and live tool preview dots. They are updated
              imperatively via refs (see handleMouseMove), so mouse movement
              repaints only this tiny layer instead of the layer above, which
              holds every building/node/edge/image. */}
          <Layer listening={false}>
            <Circle
              ref={drawPreviewCircleRef}
              x={0}
              y={0}
              radius={nodeRadius}
              fill="#fff3c4"
              stroke="#ffd166"
              strokeWidth={nodeStrokeWidth}
              opacity={0.88}
              visible={false}
              listening={false}
            />

            <Circle
              ref={nodePreviewCircleRef}
              x={0}
              y={0}
              radius={nodeRadius}
              fill="#d8ebff"
              stroke="#2f8cff"
              strokeWidth={nodeStrokeWidth}
              opacity={0.82}
              visible={false}
              listening={false}
            />

            <Rect
              ref={selectionRectRef}
              x={0}
              y={0}
              width={0}
              height={0}
              visible={false}
              fill="#2f8cff"
              opacity={0.12}
              stroke="#d8ebff"
              strokeWidth={2 / transform.scale}
              dash={[10 / transform.scale, 8 / transform.scale]}
              listening={false}
            />
          </Layer>
        </Stage>
        </div>
      </div>
      {!activeFloor ? (
        <div className="canvasEmptyOverlay">
          <strong>{activeBuilding ? 'Add your first floor' : 'Create or choose a building'}</strong>
          <span>{activeBuilding ? 'Use the plus button in the floor strip.' : 'The organization canvas is ready.'}</span>
        </div>
      ) : null}
      {tool === 'draw' ? (
        <div className="drawHint">{draftPolygon.length < 3 ? 'Click at least three points' : 'Double-click or press Enter to close the building boundary'}</div>
      ) : null}
      {tool === 'route' ? (
        <div className="drawHint">{routePickStep === 'source' ? 'Click the route source node' : 'Click the route destination node'}</div>
      ) : null}
      <div className="canvasControls">
        <button type="button" onClick={() => setCanvasTransform((current) => ({ ...current, scale: Math.min(MAX_SCALE, current.scale * 1.2) }))}>+</button>
        <button type="button" onClick={() => setCanvasTransform((current) => ({ ...current, scale: Math.max(MIN_SCALE, current.scale / 1.2) }))}>-</button>
        <button type="button" onClick={() => setCanvasTransform(fitTransform(stageSize, bounds))}>Fit</button>
        <span>{Math.round(transform.scale * 100)}%</span>
      </div>
      <div className="canvasCoordinateLabel">{canvas.width} x {canvas.height}</div>
    </section>
  );
}

function Field({ label, children }) {
  return (
    <label className="inspectorField">
      <span>{label}</span>
      {children}
    </label>
  );
}

function EditorInspector({
  selected,
  organization,
  buildings,
  floors,
  onSave,
  onDelete,
  onImageChange,
  onNodePlacementChange,
  onPropertyChange,
}) {
  const [draft, setDraft] = useState({});

  useEffect(() => {
    if (!selected) {
      setDraft({});
      return;
    }
    setDraft(selected.item || {});
  }, [selected]);

  const nodeTypes = ALL_NODE_TYPES;
  const buildingsWithFloors = buildings.filter((building) => getFloorsForBuilding(floors, building.id).length > 0);
  const selectedBuildingFloors = selected?.kind === 'node'
    ? getFloorsForBuilding(floors, draft.buildingId || selected.item?.buildingId)
    : [];

  function patch(key, value, options = {}) {
    setDraft((current) => {
      const next = { ...current, [key]: value };
      if (selected?.kind === 'image') {
        onImageChange(selected.id, { [key]: value }, { recordUndo: false, debounce: options.debounce !== false });
      } else if (selected?.kind && selected.kind !== 'selection') {
        onPropertyChange(selected.kind, next, { recordUndo: false, debounce: options.debounce !== false });
      }
      return next;
    });
  }

  function patchNodeBuilding(buildingId) {
    const nextFloors = getFloorsForBuilding(floors, buildingId);
    const floor = getFloorClosestToZero(nextFloors);
    if (!floor) return;
    setDraft((current) => ({
      ...current,
      buildingId: Number(buildingId),
      floorId: floor.id,
    }));
    onNodePlacementChange(selected.id, floor.id);
  }

  function patchNodeFloor(floorId) {
    const floor = floors.find((candidate) => Number(candidate.id) === Number(floorId));
    if (!floor) return;
    setDraft((current) => ({
      ...current,
      buildingId: Number(floor.buildingId),
      floorId: floor.id,
    }));
    onNodePlacementChange(selected.id, floor.id);
  }

  if (!selected) {
    return (
      <aside className="inspectorPanel">
        <div className="panelHeader">
          <MousePointer2 size={18} />
          <h2>Inspector</h2>
        </div>
        <p className="emptyHint">Select a building, floor, node, or edge to edit it.</p>
      </aside>
    );
  }

  return (
    <aside className="inspectorPanel">
      <div className="panelHeader">
        {selected.kind === 'selection' ? <MousePointer2 size={18} /> : selected.kind === 'node' ? <CircleDot size={18} /> : selected.kind === 'edge' ? <Route size={18} /> : <Building2 size={18} />}
        <h2>{selected.label}</h2>
      </div>

      {selected.kind === 'selection' ? (
        <>
          <div className="readOnlyMetric"><span>Buildings</span><strong>{selected.item.buildingIds.length}</strong></div>
          <div className="readOnlyMetric"><span>Blueprints</span><strong>{selected.item.imageIds.length}</strong></div>
          <div className="readOnlyMetric"><span>Nodes</span><strong>{selected.item.nodeIds.length}</strong></div>
          <div className="readOnlyMetric"><span>Edges</span><strong>{selected.item.edgeIds.length}</strong></div>
        </>
      ) : null}

      {selected.kind === 'organization' ? (
        <>
          <Field label="Name"><input value={draft.name || ''} onChange={(event) => patch('name', event.target.value)} /></Field>
          <Field label="Description"><input value={draft.description || ''} onChange={(event) => patch('description', event.target.value)} /></Field>
          <div className="readOnlyMetric"><span>Canvas</span><strong>{organization.canvasWidth} x {organization.canvasHeight}</strong></div>
        </>
      ) : null}

      {selected.kind === 'image' ? (
        <>
          <Field label="Name"><input value={draft.name || ''} onChange={(event) => patch('name', event.target.value)} /></Field>
          <div className="coordinateGrid">
            <Field label="X"><input type="number" value={Math.round(cleanNumber(draft.x))} onChange={(event) => patch('x', Number(event.target.value))} /></Field>
            <Field label="Y"><input type="number" value={Math.round(cleanNumber(draft.y))} onChange={(event) => patch('y', Number(event.target.value))} /></Field>
            <Field label="Width"><input type="number" min="80" value={Math.round(cleanNumber(draft.width, 800))} onChange={(event) => patch('width', Number(event.target.value))} /></Field>
            <Field label="Height"><input type="number" min="80" value={Math.round(cleanNumber(draft.height, 600))} onChange={(event) => patch('height', Number(event.target.value))} /></Field>
          </div>
          <Field label="Opacity"><input type="range" min="0.05" max="1" step="0.05" value={cleanNumber(draft.opacity, 0.48)} onChange={(event) => patch('opacity', Number(event.target.value))} /></Field>
          <Field label="Rotation"><input type="number" min="-360" max="360" value={Math.round(cleanNumber(draft.rotation))} onChange={(event) => patch('rotation', Number(event.target.value))} /></Field>
          <Field label="Z index"><input type="number" value={cleanNumber(draft.zIndex, 1)} onChange={(event) => patch('zIndex', Number(event.target.value))} /></Field>
          <label className="checkboxRow">
            <input type="checkbox" checked={draft.visible !== false} onChange={(event) => patch('visible', event.target.checked, { debounce: false })} />
            Visible
          </label>
          <label className="checkboxRow">
            <input type="checkbox" checked={Boolean(draft.locked)} onChange={(event) => patch('locked', event.target.checked, { debounce: false })} />
            Locked
          </label>
        </>
      ) : null}

      {selected.kind === 'building' ? (
        <>
          <Field label="Name"><input value={draft.name || ''} onChange={(event) => patch('name', event.target.value)} /></Field>
          <Field label="Description"><input value={draft.description || ''} onChange={(event) => patch('description', event.target.value)} /></Field>
          <Field label="Color"><input type="color" value={draft.color || '#176b5f'} onChange={(event) => patch('color', event.target.value, { debounce: false })} /></Field>
          <div className={`statusPill status-${String(draft.status || 'DRAFT').toLowerCase()}`}>{draft.status || 'DRAFT'}</div>
        </>
      ) : null}

      {selected.kind === 'floor' ? (
        <>
          <Field label="Name"><input value={draft.name || ''} onChange={(event) => patch('name', event.target.value)} /></Field>
          <Field label="Floor number"><input type="number" value={draft.floorNumber ?? 0} onChange={(event) => patch('floorNumber', event.target.value)} /></Field>
        </>
      ) : null}

      {selected.kind === 'node' ? (
        <>
          <div className="readOnlyMetric">
            <span>Current building</span>
            <strong>{buildings.find((building) => Number(building.id) === Number(draft.buildingId || selected.item?.buildingId))?.name || 'Unknown'}</strong>
          </div>
          <div className="readOnlyMetric">
            <span>Current floor</span>
            <strong>{floors.find((floor) => Number(floor.id) === Number(draft.floorId || selected.item?.floorId))?.name || 'Unknown'}</strong>
          </div>
          <Field label="Building">
            <select value={draft.buildingId || selected.item?.buildingId || ''} onChange={(event) => patchNodeBuilding(event.target.value)}>
              {buildingsWithFloors.map((building) => <option key={building.id} value={building.id}>{building.name}</option>)}
            </select>
          </Field>
          {selectedBuildingFloors.length > 0 ? (
            <Field label="Floor">
              <select value={draft.floorId || selected.item?.floorId || ''} onChange={(event) => patchNodeFloor(event.target.value)}>
                {selectedBuildingFloors.map((floor) => <option key={floor.id} value={floor.id}>{floor.name}</option>)}
              </select>
            </Field>
          ) : null}
          <Field label="Identifier"><input value={draft.externalIdentifier || ''} onChange={(event) => patch('externalIdentifier', event.target.value)} /></Field>
          <Field label="Name"><input value={draft.name || ''} onChange={(event) => patch('name', event.target.value)} /></Field>
          <Field label="Type">
            <select value={draft.type || nodeTypes[0]} onChange={(event) => patch('type', event.target.value, { debounce: false })}>
              {nodeTypes.map((type) => <option key={type} value={type}>{humanType(type)}</option>)}
            </select>
          </Field>
          <div className="coordinateGrid">
            <Field label="X"><input type="number" value={Math.round(cleanNumber(draft.xCoord))} onChange={(event) => patch('xCoord', event.target.value)} /></Field>
            <Field label="Y"><input type="number" value={Math.round(cleanNumber(draft.yCoord))} onChange={(event) => patch('yCoord', event.target.value)} /></Field>
          </div>
        </>
      ) : null}

      {selected.kind === 'edge' ? (
        <>
          <div className="readOnlyMetric">
            <span>Connection</span>
            <strong>{selected.from?.externalIdentifier || selected.from?.name} to {selected.to?.externalIdentifier || selected.to?.name}</strong>
          </div>
          <Field label="Distance"><input type="number" min="1" value={draft.distance ?? 1} onChange={(event) => patch('distance', event.target.value)} /></Field>
          <label className="checkboxRow">
            <input type="checkbox" checked={Boolean(draft.bidirectional)} onChange={(event) => patch('bidirectional', event.target.checked, { debounce: false })} />
            Bidirectional
          </label>
          <label className="checkboxRow" title="The backend currently serializes this value. If it rejects updates, the original value is kept.">
            <input type="checkbox" checked={draft.accessible !== false} onChange={(event) => patch('accessible', event.target.checked, { debounce: false })} />
            Accessible
          </label>
        </>
      ) : null}

      <div className="inspectorActions">
        {selected.kind !== 'selection' ? (
          <button className="button buttonPrimary" type="button" onClick={() => onSave(selected.kind, draft)}>
            <Save size={16} />
            Save changes
          </button>
        ) : null}
        {selected.kind !== 'organization' ? (
          <button className="button buttonDanger" type="button" disabled={selected.kind === 'building' && isDefaultCampus(selected.item)} onClick={() => onDelete(selected.kind, selected.item)}>
            <Trash2 size={16} />
            Delete
          </button>
        ) : null}
      </div>
    </aside>
  );
}

function NewBuildingModal({ points, onCreate, onCancel }) {
  const [draft, setDraft] = useState({ name: '', description: '', color: '#176b5f' });
  return (
    <ConfirmModal title="Create building boundary" confirmLabel="Create building" tone="primary" disabled={!draft.name.trim()} onCancel={onCancel} onConfirm={() => onCreate(draft)}>
      <p>{points.length} boundary points are ready.</p>
      <Field label="Name"><input value={draft.name} onChange={(event) => setDraft({ ...draft, name: event.target.value })} autoFocus /></Field>
      <Field label="Description"><input value={draft.description} onChange={(event) => setDraft({ ...draft, description: event.target.value })} /></Field>
      <Field label="Color"><input type="color" value={draft.color} onChange={(event) => setDraft({ ...draft, color: event.target.value })} /></Field>
    </ConfirmModal>
  );
}

function FloorPopover({ building, onCreate, onCancel }) {
  const [draft, setDraft] = useState({ name: 'Ground Floor', floorNumber: 0 });
  return (
    <form className="floorPopover" onSubmit={(event) => { event.preventDefault(); onCreate(draft); }}>
      <strong>Add floor to {building?.name}</strong>
      <input value={draft.name} onChange={(event) => setDraft({ ...draft, name: event.target.value })} placeholder="Floor name" required />
      <input type="number" value={draft.floorNumber} onChange={(event) => setDraft({ ...draft, floorNumber: event.target.value })} required />
      <div>
        <button className="button buttonGhost" type="button" onClick={onCancel}>Cancel</button>
        <button className="button buttonPrimary" type="submit">Add floor</button>
      </div>
    </form>
  );
}

export default function AdminEditorPage() {
  const { organizationId } = useParams();
  const navigate = useNavigate();
  const [organization, setOrganization] = useState(null);
  const [buildings, setBuildings] = useState([]);
  const [floors, setFloors] = useState([]);
  const [activeBuildingId, setActiveBuildingId] = useState(null);
  const [activeFloorId, setActiveFloorId] = useState(null);
  const [selected, setSelected] = useState(null);
  const [searchSelection, setSearchSelection] = useState(null);
  const [tool, setTool] = useState('select');
  const [loading, setLoading] = useState(true);
  const [savingCount, setSavingCount] = useState(0);
  const [saveState, setSaveState] = useState('saved');
  const [showSaveFlag, setShowSaveFlag] = useState(false);
  const [error, setError] = useState(null);
  const [toasts, pushToast, dismissToast] = useToasts();
  const [draftPolygon, setDraftPolygon] = useState([]);
  const [buildingModalOpen, setBuildingModalOpen] = useState(false);
  const [floorPopoverOpen, setFloorPopoverOpen] = useState(false);
  const [connectSourceId, setConnectSourceIdState] = useState(null);
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [publishResult, setPublishResult] = useState(null);
  const [currentRoute, setCurrentRoute] = useState(null);
  const [routeSource, setRouteSource] = useState(null);
  const [, setRouteDestination] = useState(null);
  const [routePickStep, setRoutePickStep] = useState('source');
  const [undoStack, setUndoStack] = useState([]);
  const [redoStack, setRedoStack] = useState([]);
  const pendingSavesRef = useRef(new Map());
  const activeSaveControllersRef = useRef(new Map());
  const operationQueueRef = useRef(Promise.resolve());
  const editorViewportMemoryRef = useRef(null);
  const connectSourceIdRef = useRef(null);
  const connectClickRef = useRef({ nodeId: null, timer: null });

  // Keeps a ref mirror of connectSourceId so async/delayed callbacks (used to
  // distinguish a single click from a double click) always read the latest
  // value instead of a stale one captured at the time the click happened.
  const setConnectSourceId = useCallback((nodeId) => {
    connectSourceIdRef.current = nodeId;
    setConnectSourceIdState(nodeId);
  }, []);

  const activeBuilding = useMemo(() => buildings.find((building) => Number(building.id) === Number(activeBuildingId)) || null, [activeBuildingId, buildings]);
  const activeFloor = useMemo(() => floors.find((floor) => Number(floor.id) === Number(activeFloorId)) || null, [activeFloorId, floors]);
  const canvasBounds = useMemo(() => ({
    width: cleanNumber(organization?.canvasWidth, 8000),
    height: cleanNumber(organization?.canvasHeight, 6000),
  }), [organization?.canvasHeight, organization?.canvasWidth]);
  const allEdges = useMemo(() => collectUniqueEdges(floors), [floors]);
  const nodeIndex = useMemo(() => buildNodeIndex(floors), [floors]);

  async function loadEditor() {
    setLoading(true);
    setError(null);
    try {
      const [orgPayload, mapPayload] = await Promise.all([
        organizationApi.getOrganization(organizationId),
        mapApi.getOrganizationMap(organizationId),
      ]);
      const normalized = normalizeMapPayload(mapPayload);
      setOrganization(orgPayload);
      setBuildings(normalized.buildings);
      setFloors(normalized.floors);
      const nextBuilding = normalized.buildings.find((building) => Number(building.id) === Number(activeBuildingId)) || normalized.buildings.find(isDefaultCampus) || normalized.buildings[0] || null;
      const nextFloor = nextBuilding
        ? getFloorsForBuilding(normalized.floors, nextBuilding.id).find((floor) => Number(floor.id) === Number(activeFloorId)) || getFloorsForBuilding(normalized.floors, nextBuilding.id)[0]
        : null;
      setActiveBuildingId(nextBuilding?.id || null);
      setActiveFloorId(nextFloor?.id || null);
      if (!selected) {
        setSelected({ kind: 'organization', id: orgPayload.id, label: 'Organization', item: orgPayload });
      }
    } catch (apiError) {
      setError(apiError);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadEditor();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [organizationId]);

  useEffect(() => () => {
    pendingSavesRef.current.forEach((entry) => window.clearTimeout(entry.timerId));
    pendingSavesRef.current.clear();
    activeSaveControllersRef.current.forEach((controller) => controller.abort());
    activeSaveControllersRef.current.clear();
    if (connectClickRef.current.timer) window.clearTimeout(connectClickRef.current.timer);
  }, []);

  useEffect(() => {
    if (!selected || !organization) return;
    if (selected.kind === 'organization') {
      setSelected({ kind: 'organization', id: organization.id, label: 'Organization', item: organization });
      return;
    }
    if (selected.kind === 'building') {
      const building = buildings.find((item) => Number(item.id) === Number(selected.id));
      if (building) setSelected({ kind: 'building', id: building.id, label: 'Building', item: building });
      return;
    }
    if (selected.kind === 'image') {
      const image = (organization.tracingImages || []).find((item) => item.id === selected.id);
      if (image) setSelected({ kind: 'image', id: image.id, label: 'Blueprint', item: image });
      return;
    }
    if (selected.kind === 'floor') {
      const floor = floors.find((item) => Number(item.id) === Number(selected.id));
      if (floor) setSelected({ kind: 'floor', id: floor.id, label: 'Floor', item: floor });
      return;
    }
    if (selected.kind === 'node') {
      const node = getNodeById(floors, selected.id);
      if (node) setSelected({ kind: 'node', id: node.id, label: 'Node', item: node, buildingId: node.buildingId });
      return;
    }
    if (selected.kind === 'edge') {
      const edge = allEdges.find((item) => Number(item.id) === Number(selected.id));
      if (edge) {
        setSelected({
          kind: 'edge',
          id: edge.id,
          label: 'Edge',
          item: edge,
          from: nodeIndex.get(Number(edge.fromNodeId)),
          to: nodeIndex.get(Number(edge.toNodeId)),
        });
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [organization, buildings, floors, allEdges]);

  useEffect(() => {
    function onKeyDown(event) {
      const tagName = event.target?.tagName?.toLowerCase();
      const isTyping = tagName === 'input' || tagName === 'textarea' || tagName === 'select' || event.target?.isContentEditable;
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'z') {
        event.preventDefault();
        if (event.shiftKey) handleRedo();
        else handleUndo();
        return;
      }
      if (event.key === 'Escape') {
        setActiveTool('select');
        setDraftPolygon([]);
        setConnectSourceId(null);
      }
      if (event.key === 'Enter' && tool === 'draw' && draftPolygon.length >= 3) {
        setBuildingModalOpen(true);
      }
      if (!isTyping && (event.key === 'Delete' || event.key === 'Backspace') && selected?.kind && selected.kind !== 'organization') {
        requestDelete(selected.kind, selected.item);
      }
    }
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [draftPolygon, selected, tool, undoStack, redoStack]);

  function selectOrganization() {
    setSearchSelection(null);
    setSelected({ kind: 'organization', id: organization.id, label: 'Organization', item: organization });
  }

  function selectBuilding(buildingId) {
    const building = buildings.find((item) => Number(item.id) === Number(buildingId));
    const firstFloor = getFloorsForBuilding(floors, buildingId)[0];
    setActiveBuildingId(buildingId);
    if (!activeFloorId && firstFloor) setActiveFloorId(firstFloor.id);
    setSearchSelection(null);
    setSelected({ kind: 'building', id: buildingId, label: 'Building', item: building });
  }

  function selectFloor(floorId) {
    const floor = floors.find((item) => Number(item.id) === Number(floorId));
    if (!floor) return;
    setActiveBuildingId(floor.buildingId);
    setActiveFloorId(floor.id);
    setSearchSelection(null);
    setSelected({ kind: 'floor', id: floor.id, label: 'Floor', item: floor });
  }

  function selectNode(nodeId, options = {}) {
    if (!nodeId) {
      setSearchSelection(null);
      setSelected(null);
      return;
    }
    const node = getNodeById(floors, nodeId);
    if (!node) return;
    if (!options.preserveContext) {
      setActiveFloorId(node.floorId);
      setActiveBuildingId(node.buildingId);
    }
    if (options.fromSearch) setSearchSelection(node);
    setSelected({ kind: 'node', id: node.id, label: 'Node', item: node, buildingId: node.buildingId });
  }

  function selectEdge(edgeId) {
    const edge = allEdges.find((item) => Number(item.id) === Number(edgeId));
    if (!edge) return;
    setSearchSelection(null);
    setSelected({
      kind: 'edge',
      id: edge.id,
      label: 'Edge',
      item: edge,
      from: nodeIndex.get(Number(edge.fromNodeId)),
      to: nodeIndex.get(Number(edge.toNodeId)),
    });
  }

  function selectMany(selection) {
    const count = selectionCount(selection);
    if (!count) {
      setSearchSelection(null);
      setSelected(null);
      return;
    }
    setSearchSelection(null);
    setSelected({ kind: 'selection', id: 'multi-selection', label: `${count} selected`, item: selection });
  }

  function requestDelete(kind, item) {
    if (kind === 'node' || kind === 'edge' || kind === 'selection') {
      void handleDelete(kind, item);
      return;
    }
    setDeleteTarget({ kind, item });
  }

  function captureSnapshot() {
    return {
      organization,
      buildings,
      floors,
    };
  }

  function pushUndoSnapshot() {
    const snapshot = captureSnapshot();
    setUndoStack((current) => [...current, snapshot].slice(-25));
    setRedoStack([]);
  }

  function restoreSnapshot(snapshot) {
    if (!snapshot) return;
    setOrganization(snapshot.organization);
    setBuildings(snapshot.buildings);
    setFloors(snapshot.floors);
    setSelected(null);
  }

  async function runBackgroundOperation(title, action, successMessage, { refetch = false, tone = 'success' } = {}) {
    void title;
    void successMessage;
    void tone;
    const run = async () => {
      setSavingCount((count) => count + 1);
      setSaveState('saving');
      setError(null);
      try {
        const result = await action();
        if (refetch) await loadEditor();
        setSaveState('saved');
        return result;
      } catch (apiError) {
        if (isCanceledError(apiError)) {
          return null;
        }
        setSaveState('error');
        pushToast(apiError.title || 'Could not complete that action', apiError.message, 'warning');
        return null;
      } finally {
        setSavingCount((count) => Math.max(0, count - 1));
      }
    };
    const queued = operationQueueRef.current.then(run, run);
    operationQueueRef.current = queued.catch(() => null);
    return queued;
  }

  async function syncSnapshotToServer(target, source = captureSnapshot()) {
    const current = source;
    const currentBuildings = new Map(current.buildings.map((building) => [Number(building.id), building]));
    const targetBuildings = new Map(target.buildings.map((building) => [Number(building.id), building]));
    const currentFloors = new Map(current.floors.map((floor) => [Number(floor.id), floor]));
    const targetFloors = new Map(target.floors.map((floor) => [Number(floor.id), floor]));
    const currentNodes = new Map(current.floors.flatMap((floor) => (floor.nodes || []).map((node) => [Number(node.id), node])));
    const targetNodes = new Map(target.floors.flatMap((floor) => (floor.nodes || []).map((node) => [Number(node.id), node])));
    const currentEdges = new Map(collectUniqueEdges(current.floors).map((edge) => [Number(edge.id), edge]));
    const targetEdges = new Map(collectUniqueEdges(target.floors).map((edge) => [Number(edge.id), edge]));
    const remappedBuildingIds = new Map();
    const remappedFloorIds = new Map();
    const remappedNodeIds = new Map();

    if (mapStateSnapshot({ organization: current.organization, buildings: [], floors: [] }) !== mapStateSnapshot({ organization: target.organization, buildings: [], floors: [] })) {
      await editorApi.updateOrganization(target.organization.id, target.organization);
    }

    for (const [id] of currentEdges) {
      if (!targetEdges.has(id)) await editorApi.deleteEdge(id);
    }
    for (const [id] of currentNodes) {
      if (!targetNodes.has(id)) await editorApi.deleteNode(id);
    }
    for (const [id] of currentFloors) {
      if (!targetFloors.has(id)) await editorApi.deleteFloor(id);
    }
    for (const [id] of currentBuildings) {
      if (!targetBuildings.has(id)) await editorApi.deleteBuilding(id);
    }

    targetBuildings.forEach((building, id) => {
      remappedBuildingIds.set(id, id);
    });
    for (const [id, building] of targetBuildings) {
      if (!currentBuildings.has(id)) {
        const created = await editorApi.createBuilding({
          organizationId: Number(target.organization.id),
          name: building.name,
          description: building.description || null,
          color: building.color,
          geometry: building.geometry || null,
        });
        remappedBuildingIds.set(id, created.id);
      } else if (JSON.stringify(currentBuildings.get(id)) !== JSON.stringify(building)) {
        await editorApi.updateBuilding(id, building);
      }
    }

    targetFloors.forEach((floor, id) => {
      remappedFloorIds.set(id, id);
    });
    for (const [id, floor] of targetFloors) {
      if (!currentFloors.has(id)) {
        const created = await editorApi.createFloor({
          buildingId: remappedBuildingIds.get(Number(floor.buildingId)) || floor.buildingId,
          name: floor.name,
          floorNumber: Number(floor.floorNumber),
          geometry: floor.geometry || null,
        });
        remappedFloorIds.set(id, created.id);
      } else if (JSON.stringify(currentFloors.get(id)) !== JSON.stringify(floor)) {
        await editorApi.updateFloor(id, floor);
      }
    }

    targetNodes.forEach((node, id) => {
      remappedNodeIds.set(id, id);
    });
    for (const [id, node] of targetNodes) {
      if (!currentNodes.has(id)) {
        const created = await editorApi.createNode({
          floorId: remappedFloorIds.get(Number(node.floorId)) || node.floorId,
          externalIdentifier: node.externalIdentifier,
          name: node.name,
          type: node.type,
          xCoord: Number(node.xCoord),
          yCoord: Number(node.yCoord),
          metadata: node.metadata || null,
          geometry: node.geometry || null,
        });
        remappedNodeIds.set(id, created.id);
      } else if (JSON.stringify(currentNodes.get(id)) !== JSON.stringify(node)) {
        await editorApi.updateNode(id, node);
      }
    }

    for (const [id, edge] of targetEdges) {
      if (!currentEdges.has(id)) {
        await editorApi.createEdge({
          fromNodeId: remappedNodeIds.get(Number(edge.fromNodeId)) || edge.fromNodeId,
          toNodeId: remappedNodeIds.get(Number(edge.toNodeId)) || edge.toNodeId,
          distance: Number(edge.distance),
          bidirectional: edge.bidirectional,
          accessible: edge.accessible,
        });
      } else if (JSON.stringify(currentEdges.get(id)) !== JSON.stringify(edge)) {
        await editorApi.updateEdge(id, edge);
      }
    }
  }

  function handleUndo() {
    const snapshot = undoStack[undoStack.length - 1];
    if (!snapshot) return;
    const current = captureSnapshot();
    setUndoStack((stack) => stack.slice(0, -1));
    setRedoStack((stack) => [...stack, current].slice(-25));
    // Apply the visual change immediately - the HTTP sync below runs in the
    // background, without refetching, so the UI never has to fall back to
    // the full-page "Loading editor" state (which looked like a freeze/reload).
    restoreSnapshot(snapshot);
    runBackgroundOperation('Undo saved', () => syncSnapshotToServer(snapshot, current), 'The previous map state was restored.')
      .then((result) => {
        if (result === null) {
          // The background sync failed: put the visual state (and the undo
          // stacks) back to how they were before this undo was attempted.
          restoreSnapshot(current);
          setUndoStack((stack) => [...stack, snapshot].slice(-25));
          setRedoStack((stack) => stack.slice(0, -1));
        }
      });
  }

  function handleRedo() {
    const snapshot = redoStack[redoStack.length - 1];
    if (!snapshot) return;
    const current = captureSnapshot();
    setRedoStack((stack) => stack.slice(0, -1));
    setUndoStack((stack) => [...stack, current].slice(-25));
    restoreSnapshot(snapshot);
    runBackgroundOperation('Redo saved', () => syncSnapshotToServer(snapshot, current), 'The map state was reapplied.')
      .then((result) => {
        if (result === null) {
          restoreSnapshot(current);
          setRedoStack((stack) => [...stack, snapshot].slice(-25));
          setUndoStack((stack) => stack.slice(0, -1));
        }
      });
  }

  function setActiveTool(nextTool) {
    setTool(nextTool);
    if (nextTool !== 'route') {
      setCurrentRoute(null);
      setRoutePickStep('source');
    }
    if (nextTool !== 'connect') {
      setConnectSourceId(null);
    }
    if (nextTool !== 'draw') {
      setDraftPolygon([]);
    }
  }

  function handleSaveNow() {
    const flushedCount = flushPendingSaves();
    setSaveState(flushedCount > 0 || savingCount > 0 ? 'saving' : 'saved');
    setShowSaveFlag(true);
    window.setTimeout(() => setShowSaveFlag(false), 2800);
  }

  async function handleCreateBuilding(draft) {
    pushUndoSnapshot();
    const created = await runBackgroundOperation('Building created', () => editorApi.createBuilding({
      organizationId: Number(organizationId),
      name: draft.name,
      description: draft.description || null,
      color: draft.color,
      geometry: polygonGeometry(draftPolygon),
    }), 'The boundary was saved to the map.');
    if (!created) return;
    setBuildings((current) => [...current, created]);
    setActiveBuildingId(created.id);
    setSelected({ kind: 'building', id: created.id, label: 'Building', item: created });
    setDraftPolygon([]);
    setBuildingModalOpen(false);
  }

  async function handleCreateFloor(draft) {
    if (!activeBuilding) return;
    pushUndoSnapshot();
    const result = await runBackgroundOperation('Floor created', () => editorApi.createFloor({
      buildingId: activeBuilding.id,
      name: draft.name,
      floorNumber: Number(draft.floorNumber),
    }), 'The floor is ready for nodes.');
    if (!result?.id) return;
    setFloors((current) => [...current, { ...result, buildingName: activeBuilding.name, nodes: [], edges: [] }]);
    setActiveFloorId(result.id);
    setSelected({ kind: 'floor', id: result.id, label: 'Floor', item: result });
    setFloorPopoverOpen(false);
  }

  async function handleCreateNode(point) {
    if (!activeFloor) return;
    pushUndoSnapshot();
    const clampedPoint = point ? clampPointToCanvas(point, canvasBounds) : null;
    const name = nextNodeName(floors);
    const created = await runBackgroundOperation('Node created', () => editorApi.createNode({
      floorId: activeFloor.id,
      externalIdentifier: uniqueIdentifier(name, activeFloor),
      name,
      type: isDefaultCampus(activeBuilding) ? 'PATH' : 'ROOM',
      xCoord: clampedPoint ? Math.round(clampedPoint.x) : undefined,
      yCoord: clampedPoint ? Math.round(clampedPoint.y) : undefined,
      metadata: null,
    }), 'The location was added.');
    if (!created) return;
    setFloors((current) => current.map((floor) => Number(floor.id) === Number(activeFloor.id)
      ? { ...floor, nodes: [...(floor.nodes || []), created] }
      : floor));
    setSelected({ kind: 'node', id: created.id, label: 'Node', item: { ...created, buildingId: activeBuildingId }, buildingId: activeBuildingId });
  }

  async function handleCreateEdge(fromNodeId, toNodeId) {
    pushUndoSnapshot();
    const created = await runBackgroundOperation('Edge created', () => editorApi.createEdge({
      fromNodeId,
      toNodeId,
      distance: 10,
      bidirectional: true,
      accessible: true,
    }), 'The connection is now part of the graph.');
    if (!created) return null;
    const touchedFloorIds = new Set([nodeIndex.get(Number(created.fromNodeId))?.floorId, nodeIndex.get(Number(created.toNodeId))?.floorId].filter(Boolean).map(Number));
    setFloors((current) => current.map((floor) => touchedFloorIds.has(Number(floor.id))
      ? { ...floor, edges: [...(floor.edges || []), created] }
      : floor));
    setSelected({
      kind: 'edge',
      id: created.id,
      label: 'Edge',
      item: created,
      from: nodeIndex.get(Number(created.fromNodeId)),
      to: nodeIndex.get(Number(created.toNodeId)),
    });
    return created;
  }

  // Completes a pending connection by creating the edge from the current
  // connect-source node to the given target node. The newly connected
  // target node always becomes the new source afterwards (instead of being
  // deselected), so the user can keep chaining connections node-to-node
  // with plain single clicks without reselecting the connect tool. A
  // double click (see handleConnectNode) can be used at any time to
  // redirect the chain to start from a different node instead.
  async function completeConnection(targetNodeId) {
    const sourceId = connectSourceIdRef.current;
    if (!sourceId || Number(sourceId) === Number(targetNodeId)) return;
    const created = await handleCreateEdge(sourceId, targetNodeId);
    if (!created) return;
    setConnectSourceId(targetNodeId);
  }

  // Resolves a click on a node while the connect tool is active, once it has
  // been determined this was a single click (not part of a double click).
  function resolveSingleConnectClick(nodeId) {
    const sourceId = connectSourceIdRef.current;
    if (!sourceId) {
      setConnectSourceId(nodeId);
      setSelected(null);
      return;
    }
    if (Number(sourceId) === Number(nodeId)) return;
    void completeConnection(nodeId);
  }

  function getSaveAction(kind, draft, signal) {
    const actions = {
      organization: () => editorApi.updateOrganization(organization.id, { name: draft.name, description: draft.description || null, tracingImages: organization.tracingImages || [] }, { signal }),
      image: () => editorApi.updateOrganization(organization.id, {
        tracingImages: (organization.tracingImages || []).map((image) => image.id === draft.id ? draft : image),
      }, { signal }),
      building: () => editorApi.updateBuilding(draft.id, { name: draft.name, description: draft.description || null, color: draft.color, geometry: draft.geometry || null }, { signal }),
      floor: () => editorApi.updateFloor(draft.id, { name: draft.name, floorNumber: Number(draft.floorNumber), geometry: draft.geometry || null }, { signal }),
      node: () => editorApi.updateNode(draft.id, {
        floorId: Number(draft.floorId),
        externalIdentifier: draft.externalIdentifier,
        name: draft.name,
        type: draft.type,
        xCoord: Number(draft.xCoord),
        yCoord: Number(draft.yCoord),
        metadata: draft.metadata || null,
        geometry: draft.geometry || null,
      }, { signal }),
      edge: () => editorApi.updateEdge(draft.id, {
        distance: Number(draft.distance),
        bidirectional: draft.bidirectional,
        accessible: draft.accessible,
      }, { signal }),
    };
    return actions[kind];
  }

  function applyDraftLocally(kind, draft) {
    if (kind === 'organization') setOrganization((current) => ({ ...current, ...draft }));
    if (kind === 'image') setOrganization((current) => ({
      ...current,
      tracingImages: (current.tracingImages || []).map((image) => image.id === draft.id ? draft : image),
    }));
    if (kind === 'building') setBuildings((current) => current.map((building) => Number(building.id) === Number(draft.id) ? { ...building, ...draft } : building));
    if (kind === 'floor') setFloors((current) => current.map((floor) => Number(floor.id) === Number(draft.id) ? { ...floor, ...draft, floorNumber: Number(draft.floorNumber) } : floor));
    if (kind === 'node') {
      const targetFloorId = Number(draft.floorId);
      const updatedNode = { ...draft, floorId: targetFloorId, buildingId: Number(draft.buildingId), xCoord: Number(draft.xCoord), yCoord: Number(draft.yCoord) };
      setFloors((current) => current.map((floor) => {
        const nodesWithoutDraft = (floor.nodes || []).filter((node) => Number(node.id) !== Number(draft.id));
        return Number(floor.id) === targetFloorId
          ? { ...floor, nodes: [...nodesWithoutDraft, updatedNode] }
          : { ...floor, nodes: nodesWithoutDraft };
      }));
    }
    if (kind === 'edge') setFloors((current) => current.map((floor) => ({
      ...floor,
      edges: (floor.edges || []).map((edge) => Number(edge.id) === Number(draft.id) ? { ...edge, ...draft, distance: Number(draft.distance) } : edge),
    })));
  }

  function cancelPendingSave(key) {
    const pending = pendingSavesRef.current.get(key);
    if (pending) {
      window.clearTimeout(pending.timerId);
      pendingSavesRef.current.delete(key);
    }
    activeSaveControllersRef.current.get(key)?.abort();
  }

  function flushPendingSaves() {
    const entries = [...pendingSavesRef.current.values()];
    entries.forEach((entry) => window.clearTimeout(entry.timerId));
    pendingSavesRef.current.clear();
    entries.forEach((entry) => entry.run());
    return entries.length;
  }

  function persistDraft(kind, draft, options = {}) {
    const key = `${kind}:${draft.id || organization.id}`;
    // A newer edit to the same element always supersedes an older one: drop any
    // scheduled-but-not-yet-sent save and cancel any request already in flight.
    cancelPendingSave(key);

    const controller = new AbortController();
    activeSaveControllersRef.current.set(key, controller);
    const action = getSaveAction(kind, draft, controller.signal);
    if (!action) {
      activeSaveControllersRef.current.delete(key);
      return Promise.resolve(null);
    }

    const run = () => runBackgroundOperation('Changes saved', action, `${kind} details were updated.`, { refetch: options.refetch ?? false })
      .finally(() => {
        if (activeSaveControllersRef.current.get(key) === controller) {
          activeSaveControllersRef.current.delete(key);
        }
      });

    if (options.debounce) {
      return new Promise((resolve) => {
        const timerId = window.setTimeout(() => {
          pendingSavesRef.current.delete(key);
          resolve(run());
        }, 320);
        pendingSavesRef.current.set(key, { timerId, run: () => { pendingSavesRef.current.delete(key); return run(); } });
      });
    }
    return run();
  }

  function handlePropertyChange(kind, draft, options = {}) {
    if (options.recordUndo !== false) pushUndoSnapshot();
    applyDraftLocally(kind, draft);
    void persistDraft(kind, draft, options);
  }

  async function handleSave(kind, draft) {
    const previousState = captureSnapshot();
    setUndoStack((current) => [...current, previousState].slice(-25));
    setRedoStack([]);
    // Apply the visual change immediately - the save below runs in the
    // background, without refetching, so the UI never falls back to the
    // full-page "Loading editor" state (which looked like a freeze/reload).
    applyDraftLocally(kind, draft);
    const result = await persistDraft(kind, draft, {});
    if (result === null) {
      // The save failed: revert the visual state back to what it was
      // before this edit, and drop the undo entry we just pushed for it.
      restoreSnapshot(previousState);
      setUndoStack((stack) => stack.slice(0, -1));
    }
  }

  async function handleBulkDragEnd(selection, delta) {
    if (!selection || (!delta.dx && !delta.dy)) return;
    const nodeIds = new Set((selection.nodeIds || []).map(Number));
    const buildingIds = new Set((selection.buildingIds || []).map(Number));
    const imageIds = new Set(selection.imageIds || []);
    const nextBuildingsById = new Map();
    const nextNodesById = new Map();
    let nextTracingImages = organization.tracingImages || [];

    pushUndoSnapshot();

    setBuildings((current) => current.map((building) => {
      if (!buildingIds.has(Number(building.id))) return building;
      const geometry = clampGeometryToCanvas(offsetGeometry(building.geometry, delta.dx, delta.dy), canvasBounds);
      const next = { ...building, geometry, status: 'DRAFT' };
      nextBuildingsById.set(Number(building.id), next);
      return next;
    }));

    setFloors((current) => current.map((floor) => ({
      ...floor,
      nodes: (floor.nodes || []).map((node) => {
        if (!nodeIds.has(Number(node.id))) return node;
        const point = clampPointToCanvas({ x: cleanNumber(node.xCoord) + delta.dx, y: cleanNumber(node.yCoord) + delta.dy }, canvasBounds);
        const next = { ...node, xCoord: Math.round(point.x), yCoord: Math.round(point.y) };
        nextNodesById.set(Number(node.id), next);
        return next;
      }),
    })));

    if (imageIds.size) {
      nextTracingImages = (organization.tracingImages || []).map((image) => (
        imageIds.has(image.id)
          ? { ...image, ...clampImagePatch(image, { x: cleanNumber(image.x) + delta.dx, y: cleanNumber(image.y) + delta.dy }, canvasBounds) }
          : image
      ));
      setOrganization((current) => ({ ...current, tracingImages: nextTracingImages }));
    }

    await runBackgroundOperation('Selection moved', async () => {
      for (const building of nextBuildingsById.values()) {
        await editorApi.updateBuilding(building.id, building);
      }
      for (const node of nextNodesById.values()) {
        await editorApi.updateNode(node.id, { xCoord: node.xCoord, yCoord: node.yCoord });
      }
      if (imageIds.size) {
        await editorApi.updateOrganization(organization.id, { tracingImages: nextTracingImages });
      }
    }, 'Selection moved.');
  }

  async function handleDelete(kind, item) {
    if (kind === 'selection') {
      await handleDeleteSelection(item);
      return;
    }

    if (kind === 'image') {
      handleDeleteImage(item.id);
      setDeleteTarget(null);
      return;
    }

    const actions = {
      building: () => editorApi.deleteBuilding(item.id),
      floor: () => editorApi.deleteFloor(item.id),
      node: () => editorApi.deleteNode(item.id),
      edge: () => editorApi.deleteEdge(item.id),
    };
    pushUndoSnapshot();
    if (kind === 'building') {
      setBuildings((current) => current.filter((building) => Number(building.id) !== Number(item.id)));
      setFloors((current) => current.filter((floor) => Number(floor.buildingId) !== Number(item.id)));
    }
    if (kind === 'floor') setFloors((current) => current.filter((floor) => Number(floor.id) !== Number(item.id)));
    if (kind === 'node') setFloors((current) => current.map((floor) => ({
      ...floor,
      nodes: (floor.nodes || []).filter((node) => Number(node.id) !== Number(item.id)),
      edges: (floor.edges || []).filter((edge) => Number(edge.fromNodeId) !== Number(item.id) && Number(edge.toNodeId) !== Number(item.id)),
    })));
    if (kind === 'edge') setFloors((current) => current.map((floor) => ({
      ...floor,
      edges: (floor.edges || []).filter((edge) => Number(edge.id) !== Number(item.id)),
    })));
    await runBackgroundOperation('Deleted', actions[kind], `${kind} was removed.`);
    setDeleteTarget(null);
    setSelected(null);
  }

  async function handleDeleteSelection(selection) {
    const nodeIds = new Set((selection.nodeIds || []).map(Number));
    const edgeIds = new Set((selection.edgeIds || []).map(Number));
    const buildingIds = new Set((selection.buildingIds || []).map(Number));
    const imageIds = new Set(selection.imageIds || []);

    pushUndoSnapshot();
    setBuildings((current) => current.filter((building) => !buildingIds.has(Number(building.id))));
    setFloors((current) => current
      .filter((floor) => !buildingIds.has(Number(floor.buildingId)))
      .map((floor) => ({
        ...floor,
        nodes: (floor.nodes || []).filter((node) => !nodeIds.has(Number(node.id))),
        edges: (floor.edges || []).filter((edge) => (
          !edgeIds.has(Number(edge.id))
          && !nodeIds.has(Number(edge.fromNodeId))
          && !nodeIds.has(Number(edge.toNodeId))
        )),
      })));
    const tracingImages = (organization.tracingImages || []).filter((image) => !imageIds.has(image.id));
    if (imageIds.size) setOrganization((current) => ({ ...current, tracingImages }));

    await runBackgroundOperation('Selection deleted', async () => {
      for (const edgeId of edgeIds) await editorApi.deleteEdge(edgeId);
      for (const nodeId of nodeIds) await editorApi.deleteNode(nodeId);
      for (const buildingId of buildingIds) await editorApi.deleteBuilding(buildingId);
      if (imageIds.size) await editorApi.updateOrganization(organization.id, { tracingImages });
    }, 'Selection deleted.');
    setSelected(null);
  }

  async function handleNodeDragEnd(nodeId, point) {
    pushUndoSnapshot();
    const clamped = clampPointToCanvas({ x: point.xCoord, y: point.yCoord }, canvasBounds);
    const nextPoint = { xCoord: Math.round(clamped.x), yCoord: Math.round(clamped.y) };
    setFloors((current) => current.map((floor) => ({
      ...floor,
      nodes: (floor.nodes || []).map((node) => Number(node.id) === Number(nodeId) ? { ...node, ...nextPoint } : node),
    })));
    await runBackgroundOperation('Map saved', () => editorApi.updateNode(nodeId, nextPoint), 'Node position saved.');
  }

  async function handleNodePlacementChange(nodeId, floorId) {
    const node = getNodeById(floors, nodeId);
    if (!node) return;
    const destinationFloor = floors.find((floor) => Number(floor.id) === Number(floorId));
    if (!destinationFloor || Number(destinationFloor.id) === Number(node.floorId)) return;
    const connectedEdges = allEdges.filter((edge) => Number(edge.fromNodeId) === Number(node.id) || Number(edge.toNodeId) === Number(node.id));

    pushUndoSnapshot();
    const updatedNode = { ...node, floorId: destinationFloor.id, buildingId: destinationFloor.buildingId };
    setFloors((current) => current.map((floor) => {
      const nodesWithoutNode = (floor.nodes || []).filter((candidate) => Number(candidate.id) !== Number(node.id));
      const existingEdgeIds = new Set((floor.edges || []).map((edge) => Number(edge.id)));
      const nextEdges = Number(floor.id) === Number(destinationFloor.id)
        ? [...(floor.edges || []), ...connectedEdges.filter((edge) => !existingEdgeIds.has(Number(edge.id)))]
        : floor.edges || [];
      return Number(floor.id) === Number(destinationFloor.id)
        ? { ...floor, nodes: [...nodesWithoutNode, updatedNode], edges: nextEdges }
        : { ...floor, nodes: nodesWithoutNode, edges: nextEdges };
    }));
    setActiveBuildingId(destinationFloor.buildingId);
    setActiveFloorId(destinationFloor.id);
    setSelected({ kind: 'node', id: node.id, label: 'Node', item: updatedNode, buildingId: destinationFloor.buildingId });
    await runBackgroundOperation('Node moved', () => editorApi.updateNode(node.id, { floorId: destinationFloor.id }), 'Node moved.');
  }

  async function handleBuildingDragEnd(buildingId, delta) {
    const building = buildings.find((item) => Number(item.id) === Number(buildingId));
    if (!building || (!delta.dx && !delta.dy)) return;
    pushUndoSnapshot();
    const geometry = clampGeometryToCanvas(offsetGeometry(building.geometry, delta.dx, delta.dy), canvasBounds);
    setBuildings((current) => current.map((item) => Number(item.id) === Number(buildingId) ? { ...item, geometry, status: 'DRAFT' } : item));
    await runBackgroundOperation('Map saved', () => editorApi.updateBuilding(buildingId, { ...building, geometry }), 'Building position saved.');
  }

  async function handleBuildingVertexDragEnd(buildingId, pointIndex, point) {
    const building = buildings.find((item) => Number(item.id) === Number(buildingId));
    if (!building) return;
    pushUndoSnapshot();
    const geometry = updateGeometryPoint(building.geometry, pointIndex, clampPointToCanvas(point, canvasBounds));
    setBuildings((current) => current.map((item) => Number(item.id) === Number(buildingId) ? { ...item, geometry, status: 'DRAFT' } : item));
    await runBackgroundOperation('Map saved', () => editorApi.updateBuilding(buildingId, { ...building, geometry }), 'Building shape saved.');
  }

  function updateTracingImages(updater, successMessage = 'Blueprint updated.', options = {}) {
    const { recordUndo = true, debounce = false } = options;
    if (recordUndo) pushUndoSnapshot();
    const tracingImages = updater(organization.tracingImages || []);
    setOrganization((current) => ({ ...current, tracingImages }));

    const key = `tracingImages:${organization.id}`;
    cancelPendingSave(key);

    const controller = new AbortController();
    activeSaveControllersRef.current.set(key, controller);
    const persist = () => runBackgroundOperation(
      'Blueprint saved',
      () => editorApi.updateOrganization(organization.id, { tracingImages }, { signal: controller.signal }),
      successMessage
    ).finally(() => {
      if (activeSaveControllersRef.current.get(key) === controller) {
        activeSaveControllersRef.current.delete(key);
      }
    });

    if (debounce) {
      const timerId = window.setTimeout(() => {
        pendingSavesRef.current.delete(key);
        persist();
      }, 320);
      pendingSavesRef.current.set(key, { timerId, run: () => { pendingSavesRef.current.delete(key); return persist(); } });
    } else {
      persist();
    }
  }

  function selectImage(imageId) {
    const image = (organization?.tracingImages || []).find((item) => item.id === imageId);
    if (image) setSelected({ kind: 'image', id: image.id, label: 'Blueprint', item: image });
  }

  function handleImageChange(imageId, patch, options) {
    updateTracingImages((images) => images.map((image) => image.id === imageId ? { ...image, ...clampImagePatch(image, patch, canvasBounds) } : image), 'Blueprint updated.', options);
  }

  function handleToggleImage(imageId) {
    updateTracingImages((images) => images.map((image) => image.id === imageId ? { ...image, visible: image.visible === false } : image));
  }

  function handleDeleteImage(imageId) {
    updateTracingImages((images) => images.filter((image) => image.id !== imageId), 'Blueprint removed.');
    if (selected?.kind === 'image' && selected.id === imageId) setSelected(null);
  }

  function handleConnectNode(nodeId) {
    const pending = connectClickRef.current;

    if (pending.nodeId === nodeId && pending.timer) {
      // A second click landed on the same node within the window: treat it
      // as a double click. This force-selects the node as the source,
      // discarding any pending source, without creating an edge - useful
      // for redirecting the chain to start from here.
      window.clearTimeout(pending.timer);
      connectClickRef.current = { nodeId: null, timer: null };
      setConnectSourceId(nodeId);
      setSelected(null);
      return;
    }

    if (pending.timer) {
      // A click landed on a different node while a previous click was still
      // waiting to see if it would become a double click. That previous
      // click is definitely a single click now, so resolve it immediately
      // before handling this new click.
      window.clearTimeout(pending.timer);
      connectClickRef.current = { nodeId: null, timer: null };
      resolveSingleConnectClick(pending.nodeId);
    }

    const timer = window.setTimeout(() => {
      connectClickRef.current = { nodeId: null, timer: null };
      resolveSingleConnectClick(nodeId);
    }, 260);
    connectClickRef.current = { nodeId, timer };
  }

  async function handleUploadImage(file) {
    if (!file) return;
    pushUndoSnapshot();
    await runBackgroundOperation('Blueprint uploaded', async () => {
      const upload = await editorApi.uploadMedia(file);
      const tracingImages = [
        ...(organization.tracingImages || []),
        {
          id: `${Date.now()}`,
          name: file.name,
          imagePath: upload.url,
          x: 120,
          y: 120,
          width: 1200,
          height: 800,
          opacity: 0.48,
          rotation: 0,
          visible: true,
          locked: false,
          zIndex: (organization.tracingImages || []).length + 1,
        },
      ];
      setOrganization((current) => ({ ...current, tracingImages }));
      return editorApi.updateOrganization(organization.id, { tracingImages });
    }, 'The image is available as a tracing layer.');
  }

  async function handlePublishBuilding() {
    if (!activeBuilding) return;
    const result = await runBackgroundOperation('Publish complete', () => editorApi.publishBuilding(activeBuilding.id), `${activeBuilding.name} is published.`, { refetch: true });
    if (result) setBuildings((current) => current.map((building) => Number(building.id) === Number(activeBuilding.id) ? { ...building, status: 'PUBLISHED' } : building));
  }

  async function handlePublishOrganization() {
    setSavingCount((count) => count + 1);
    setSaveState('saving');
    setPublishResult(null);
    try {
      const result = await organizationApi.publishOrganization(organizationId);
      setPublishResult(result);
      await loadEditor();
      setSaveState('saved');
    } catch (apiError) {
      setSaveState('error');
      setPublishResult(apiError.raw?.results ? apiError.raw : null);
      pushToast(apiError.title || 'Publish blocked', apiError.message, 'warning');
    } finally {
      setSavingCount((count) => Math.max(0, count - 1));
    }
  }

  async function handleRoutePickNode(node) {
    selectNode(node.id, { preserveContext: true });
    if (routePickStep === 'source') {
      setRouteSource(node);
      setRoutePickStep('destination');
      return;
    }
    setRouteDestination(node);
    setRoutePickStep('source');
    const source = routeSource;
    if (!source) return;
    const route = await runBackgroundOperation('Route ready', () => routeApi.findRoute({ sourceId: source.id, destinationId: node.id, accessibleOnly: false }), 'The route is highlighted on the canvas.');
    if (route) setCurrentRoute(route);
  }

  function focusSearchResult(result) {
    const node = getNodeById(floors, result.id) || result;
    if (node.floorId) setActiveFloorId(node.floorId);
    if (node.buildingId) setActiveBuildingId(node.buildingId);
    setSearchSelection(node);
    selectNode(result.id, { fromSearch: true });
  }

  const selectedSourceNode = connectSourceId ? nodeIndex.get(Number(connectSourceId)) : null;
  const routePathText = formatRoutePath(currentRoute, floors);
  const isSaving = savingCount > 0;

  return (
    <div className="appFrame editorFrame">
      <AppTopbar />
      <main className="editorPage">
        <header className="editorTopbar">
          <div className="editorContextStrip">
            <strong>{activeBuilding?.name || 'No building selected'}</strong>
            {getFloorsForBuilding(floors, activeBuildingId).map((floor) => (
              <button className={Number(activeFloorId) === Number(floor.id) ? 'isActive' : ''} type="button" key={floor.id} onClick={() => selectFloor(floor.id)}>
                {floor.name}
              </button>
            ))}
            {activeBuilding ? <button type="button" onClick={() => setFloorPopoverOpen(true)}><Plus size={14} /> Floor</button> : null}
          </div>
          <div className="editorToolbar" aria-label="Editor tools">
            <button className={`toolButton ${tool === 'select' ? 'isActive' : ''}`} type="button" onClick={() => setActiveTool('select')} title="Select"><MousePointer2 size={17} /></button>
            <button className={`toolButton ${tool === 'pan' ? 'isActive' : ''}`} type="button" onClick={() => setActiveTool('pan')} title="Pan"><LocateFixed size={17} /></button>
            <button className={`toolButton ${tool === 'draw' ? 'isActive' : ''}`} type="button" onClick={() => setActiveTool('draw')} title="Draw building boundary"><PencilRuler size={17} /></button>
            <button className={`toolButton ${tool === 'addNode' ? 'isActive' : ''}`} type="button" onClick={() => setActiveTool('addNode')} title="Add node"><Plus size={17} /></button>
            <button className={`toolButton ${tool === 'connect' ? 'isActive' : ''}`} type="button" onClick={() => setActiveTool('connect')} title="Connect nodes"><Link2 size={17} /></button>
            <button className={`toolButton ${tool === 'route' ? 'isActive' : ''}`} type="button" onClick={() => setActiveTool('route')} title="Pick route on canvas"><Route size={17} /></button>
            <label className="toolButton uploadToolButton" title="Upload blueprint">
              <ImageIcon size={17} />
              <input type="file" accept="image/png,image/jpeg,image/gif,image/webp" onChange={(event) => handleUploadImage(event.target.files?.[0])} />
            </label>
            <button className="toolButton" type="button" disabled={undoStack.length === 0} onClick={handleUndo} title="Undo restores content, not exact IDs"><Undo2 size={17} /></button>
            <button className="toolButton" type="button" disabled={redoStack.length === 0} onClick={handleRedo} title="Redo"><Redo2 size={17} /></button>
          </div>
          <div className="editorActions">
            <button className="button buttonGhost" type="button" onClick={handleSaveNow}><Save size={16} />Save now</button>
            <button className="button buttonGhost" type="button" onClick={() => navigate(`/maps/${organizationId}`)}>View map</button>
            <button className="button buttonSubtle" type="button" disabled={!activeBuilding} onClick={handlePublishBuilding}><Check size={16} />Publish building</button>
            <button className="button buttonPrimary" type="button" onClick={handlePublishOrganization}>Publish all</button>
          </div>
        </header>

        {error ? <StatusMessage title="Could not load editor" tone="error">{error.message}</StatusMessage> : null}
        {publishResult ? (
          <StatusMessage title={publishResult.success ? 'Published' : "Can't publish yet"} tone={publishResult.success ? 'success' : 'warning'}>
            {(publishResult.results || []).map((result) => `${result.name}: ${result.success ? 'published' : result.errors.join(', ')}`).join(' | ')}
          </StatusMessage>
        ) : null}

        {loading ? (
          <StatusMessage title="Loading editor">Fetching organization graph and canvas data.</StatusMessage>
        ) : (
          <>
            <section className="editorWorkspace">
              <EditorLayers
                organization={organization}
                buildings={buildings}
                floors={floors}
                activeBuildingId={activeBuildingId}
                activeFloorId={activeFloorId}
                selected={selected}
                onSelectOrganization={selectOrganization}
                onSelectImage={selectImage}
                onToggleImage={handleToggleImage}
                onDeleteImage={handleDeleteImage}
                onSelectBuilding={selectBuilding}
                onSelectFloor={selectFloor}
                onSelectNode={selectNode}
              />
              <div className="editorCenterColumn">
                <div className="editorCanvasStack">
                  <EditorCanvas
                    organization={organization}
                    buildings={buildings}
                    floors={floors}
                    activeBuildingId={activeBuildingId}
                    activeFloor={activeFloor}
                    selected={selected}
                    tool={tool}
                    draftPolygon={draftPolygon}
                    currentRoute={currentRoute}
                    connectSourceId={connectSourceId}
                    routePickStep={routePickStep}
                    onCanvasPoint={(point) => {
                      if (tool === 'draw') setBuildingModalOpen(true);
                      if (tool === 'addNode' && activeFloor) void handleCreateNode(point);
                    }}
                    onPolygonPoint={(point) => {
                      setDraftPolygon((current) => {
                        const first = current[0];
                        if (first && current.length >= 3 && Math.hypot(point.x - first.x, point.y - first.y) < 42) {
                          setBuildingModalOpen(true);
                          return current;
                        }
                        return [...current, point];
                      });
                    }}
                    onClosePolygon={() => {
                      if (draftPolygon.length >= 3) setBuildingModalOpen(true);
                    }}
                    onSelectImage={selectImage}
                    onSelectBuilding={selectBuilding}
                    onSelectNode={(nodeId) => selectNode(nodeId, { preserveContext: true })}
                    onSelectEdge={selectEdge}
                    onSelectMany={selectMany}
                    onActivateSelectTool={() => setActiveTool('select')}
                    viewportMemoryRef={editorViewportMemoryRef}
                    onImageChange={handleImageChange}
                    onBulkDragEnd={handleBulkDragEnd}
                    onNodeDragEnd={handleNodeDragEnd}
                    onBuildingDragEnd={handleBuildingDragEnd}
                    onBuildingVertexDragEnd={handleBuildingVertexDragEnd}
                    onConnectNode={handleConnectNode}
                    onRoutePickNode={handleRoutePickNode}
                  />
                  <div className="canvasFloatingTop">
                    <div className="canvasSearchFloat">
                      <Search size={16} />
                      <LocationSearchBox
                        label="Search draft and published nodes"
                        organizationId={organizationId}
                        selected={searchSelection}
                        onSelect={(node) => {
                          if (node) {
                            focusSearchResult(node);
                          } else {
                            setSearchSelection(null);
                            if (selected?.kind === 'node') setSelected(null);
                          }
                        }}
                        onLocationSelected={focusSearchResult}
                        displaySelectedInInput
                        hideSelectedLocation
                      />
                    </div>
                    {tool === 'connect' && connectSourceId ? (
                      <div className="crossConnectBox">
                        <span>Source: {selectedSourceNode?.externalIdentifier || selectedSourceNode?.name}</span>
                        <LocationSearchBox label="Connect to another floor/building" organizationId={organizationId} selected={null} onSelect={(node) => { if (node) void completeConnection(node.id); }} />
                      </div>
                    ) : null}
                  </div>
                  {currentRoute ? (
                    <div className="routeSegmentDock">
                      <strong>{currentRoute.totalDistance}m total</strong>
                      <span>{routePathText}</span>
                    </div>
                  ) : null}
                </div>
              </div>
              <EditorInspector
                selected={selected}
                organization={organization}
                buildings={buildings}
                floors={floors}
                onSave={handleSave}
                onDelete={requestDelete}
                onImageChange={handleImageChange}
                onNodePlacementChange={handleNodePlacementChange}
                onPropertyChange={handlePropertyChange}
                onUploadImage={handleUploadImage}
              />
            </section>
          </>
        )}
      </main>
      <ToastStack toasts={toasts} onDismiss={dismissToast} />
      {floorPopoverOpen ? <FloorPopover building={activeBuilding} onCreate={handleCreateFloor} onCancel={() => setFloorPopoverOpen(false)} /> : null}
      {buildingModalOpen ? <NewBuildingModal points={draftPolygon} onCreate={handleCreateBuilding} onCancel={() => setBuildingModalOpen(false)} /> : null}
      {deleteTarget ? (
        <ConfirmModal
          title={`Delete ${deleteTarget.kind}`}
          confirmLabel="Delete"
          onCancel={() => setDeleteTarget(null)}
          onConfirm={() => handleDelete(deleteTarget.kind, deleteTarget.item)}
        >
          <p>This action changes the saved map immediately.</p>
          {deleteTarget.kind === 'node' ? (
            <p>{allEdges.filter((edge) => Number(edge.fromNodeId) === Number(deleteTarget.item.id) || Number(edge.toNodeId) === Number(deleteTarget.item.id)).length} connected edges will be removed with this node.</p>
          ) : null}
        </ConfirmModal>
      ) : null}
      {showSaveFlag ? <div className={`saveFlag saveFlag-${saveState}`}>
        {isSaving ? 'Saving...' : saveState === 'error' ? 'Save needs attention' : 'Map saved'}
      </div> : null}
    </div>
  );
}
