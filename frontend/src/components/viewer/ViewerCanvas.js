import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Circle, Group, Label, Layer, Line, Rect, Stage, Tag, Text } from 'react-konva';
import {
  buildNodesById,
  collectUniqueEdges,
  createCoordinateMapper,
  geometryToKonvaPolygons,
  geometryToKonvaPoints,
  getGeometryCentroid,
  getGeometryPolygons,
  getMapContentBounds,
  getNodeById,
  getVisibleEdges,
  nodeGeometryToLocalPoints,
  routeEdgeSet,
  routeNodeSet,
} from '../../domain/mapModel';

const MIN_SCALE = 0.08;
const MAX_SCALE = 3;

function getCanvasSize(organization) {
  return {
    width: Number(organization?.canvasWidth || 8000),
    height: Number(organization?.canvasHeight || 6000),
  };
}

function useElementSize() {
  const ref = useRef(null);
  const [size, setSize] = useState({ width: 900, height: 640 });

  useEffect(() => {
    if (!ref.current) return undefined;
    const element = ref.current;
    const updateSize = () => {
      const rect = element.getBoundingClientRect();
      setSize({
        width: Math.max(320, Math.floor(rect.width)),
        height: Math.max(420, Math.floor(rect.height)),
      });
    };
    updateSize();

    const observer = new ResizeObserver(updateSize);
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  return [ref, size];
}

function fitTransform(container, bounds) {
  const padding = 44;
  const boundsWidth = Math.max(1, bounds.maxX - bounds.minX);
  const boundsHeight = Math.max(1, bounds.maxY - bounds.minY);
  const scale = Math.min(
    (container.width - padding * 2) / boundsWidth,
    (container.height - padding * 2) / boundsHeight
  );
  const clampedScale = Math.max(MIN_SCALE, Math.min(MAX_SCALE, scale));

  return {
    scale: clampedScale,
    x: (container.width - boundsWidth * clampedScale) / 2 - bounds.minX * clampedScale,
    y: (container.height - boundsHeight * clampedScale) / 2 - bounds.minY * clampedScale,
  };
}

function getNodeFill(type, isRoute, isSelected) {
  if (isSelected) return '#0d4f46';
  if (isRoute) return '#d8913c';
  if (type === 'ENTRANCE' || type === 'GATE') return '#23a56f';
  if (type === 'STAIR' || type === 'ELEVATOR') return '#8763d6';
  return '#2f8cff';
}

function withFloorContext(node, floor) {
  return {
    ...node,
    floorId: floor.id,
    buildingId: floor.buildingId,
    floorNumber: Number(floor.floorNumber),
  };
}

function hasDifferentFloorLevel(fromNode, toNode) {
  const fromLevel = Number(fromNode?.floorNumber);
  const toLevel = Number(toNode?.floorNumber);

  if (Number.isFinite(fromLevel) && Number.isFinite(toLevel)) {
    return fromLevel !== toLevel;
  }

  return Number(fromNode?.floorId) !== Number(toNode?.floorId);
}

function getClientPoint(nativeEvent) {
  const touch = nativeEvent?.touches?.[0] || nativeEvent?.changedTouches?.[0];
  return {
    x: touch?.clientX ?? nativeEvent?.clientX ?? 0,
    y: touch?.clientY ?? nativeEvent?.clientY ?? 0,
  };
}

function openGeometryRing(polygon) {
  if (!Array.isArray(polygon)) return [];
  return polygon.length > 1 && polygon[0].x === polygon[polygon.length - 1].x && polygon[0].y === polygon[polygon.length - 1].y
    ? polygon.slice(0, -1)
    : polygon;
}

export default function ViewerCanvas({
  organization,
  buildings,
  floors,
  activeFloor,
  visibleFloors,
  activeFloorNumber,
  activeBuildingId,
  selectedNodeId,
  focusedNodeId,
  route,
  tool = 'pan',
  onSelectNode,
  onSelectBuilding,
  onFocusHandled,
}) {
  const [containerRef, containerSize] = useElementSize();
  const canvas = useMemo(() => getCanvasSize(organization), [organization]);
  const contentBounds = useMemo(
    () => getMapContentBounds({ organization, buildings, floors: visibleFloors }),
    [buildings, organization, visibleFloors]
  );
  const initialTransform = useMemo(() => fitTransform(containerSize, contentBounds), [containerSize, contentBounds]);
  const [transform, setTransformState] = useState(initialTransform);
  const transformRef = useRef(transform);
  const stageRef = useRef(null);
  const panWrapperRef = useRef(null);
  const panSessionRef = useRef(null);
  const zoomSessionRef = useRef(null);
  const draggedRef = useRef(false);

  const routeNodes = useMemo(() => routeNodeSet(route), [route]);
  const routeEdges = useMemo(() => routeEdgeSet(route), [route]);
  const visibleNodesById = useMemo(() => buildNodesById(visibleFloors), [visibleFloors]);
  const sameFloorEdges = useMemo(() => getVisibleEdges(visibleFloors), [visibleFloors]);
  const allEdges = useMemo(() => collectUniqueEdges(floors), [floors]);
  const visibleNodes = useMemo(
    () => floors.flatMap((floor) =>
      (floor.nodes || []).map((node) => withFloorContext(node, floor))
    ),
    [floors]
  );
  const viewerNodesById = useMemo(() => {
    const index = new Map();
    floors.forEach((floor) => {
      (floor.nodes || []).forEach((node) => {
        index.set(Number(node.id), withFloorContext(node, floor));
      });
    });
    return index;
  }, [floors]);
  const coordinateMapper = useMemo(() => createCoordinateMapper(transform), [transform]);
  const selectedHandleVisible = transform.scale >= 0.12;
  const handleRadius = Math.min(Math.max(12 / transform.scale, 8), 120);
  const handleStrokeWidth = Math.min(Math.max(2.5 / transform.scale, 1), 18);
  const nodeRadius = Math.min(Math.max(14 / transform.scale, 8), 150);
  const nodeStrokeWidth = Math.min(Math.max(3 / transform.scale, 1), 24);
  const nodeHaloRadius = nodeRadius * 2.25;
  const labelFontSize = Math.min(Math.max(13 / transform.scale, 10), 38);
  const labelPadding = Math.min(Math.max(5 / transform.scale, 3), 18);
  const buildingLabelFontSize = Math.min(Math.max(21 / transform.scale, 16), 64);
  const buildingLabelPadding = Math.min(Math.max(7 / transform.scale, 4), 26);
  const crossEdges = useMemo(
    () => allEdges.filter((edge) => {
      const from = viewerNodesById.get(Number(edge.fromNodeId));
      const to = viewerNodesById.get(Number(edge.toNodeId));
      return from && to && hasDifferentFloorLevel(from, to);
    }),
    [allEdges, viewerNodesById]
  );
  const routeSameFloorEdges = useMemo(
    () => allEdges.filter((edge) => {
      const from = viewerNodesById.get(Number(edge.fromNodeId));
      const to = viewerNodesById.get(Number(edge.toNodeId));
      const isRoute = routeEdges.has(`${edge.fromNodeId}->${edge.toNodeId}`) || routeEdges.has(`${edge.toNodeId}->${edge.fromNodeId}`);
      return from && to && !hasDifferentFloorLevel(from, to) && isRoute && !visibleNodesById.has(Number(edge.fromNodeId));
    }),
    [allEdges, routeEdges, viewerNodesById, visibleNodesById]
  );
  const displayedSameFloorEdges = useMemo(() => {
    const byId = new Map();
    sameFloorEdges.forEach((edge) => byId.set(Number(edge.id), edge));
    routeSameFloorEdges.forEach((edge) => byId.set(Number(edge.id), edge));
    return [...byId.values()];
  }, [routeSameFloorEdges, sameFloorEdges]);

  const setTransform = useCallback((nextTransform) => {
    setTransformState((current) => {
      const value = typeof nextTransform === 'function' ? nextTransform(current) : nextTransform;
      transformRef.current = value;
      return value;
    });
  }, []);

  useEffect(() => {
    setTransform(fitTransform(containerSize, contentBounds));
  }, [containerSize, contentBounds, setTransform]);

  useEffect(() => () => {
    if (zoomSessionRef.current?.timeoutId) window.clearTimeout(zoomSessionRef.current.timeoutId);
  }, []);

  useEffect(() => {
    if (!focusedNodeId) return;

    const node = getNodeById(floors, focusedNodeId);
    if (!node) return;

    const nextScale = Math.max(initialTransform.scale, Math.min(MAX_SCALE, 1.15));
    const screenPoint = coordinateMapper.mapToScreen({ xCoord: node.xCoord, yCoord: node.yCoord });
    setTransform({
      scale: nextScale,
      x: containerSize.width / 2 - (screenPoint.x - transform.x) / transform.scale * nextScale,
      y: containerSize.height / 2 - (screenPoint.y - transform.y) / transform.scale * nextScale,
    });
    onFocusHandled?.();
  }, [containerSize, coordinateMapper, floors, focusedNodeId, initialTransform.scale, onFocusHandled, setTransform, transform.scale, transform.x, transform.y]);

  function handleWheel(event) {
    event.evt.preventDefault();
    const hostRect = containerRef.current?.getBoundingClientRect();
    if (!hostRect) return;
    const clientPoint = getClientPoint(event.evt);
    const pointer = {
      x: clientPoint.x - hostRect.left,
      y: clientPoint.y - hostRect.top,
    };

    const session = zoomSessionRef.current || { live: { ...transformRef.current } };
    if (session.timeoutId) window.clearTimeout(session.timeoutId);

    const oldScale = session.live.scale;
    const point = {
      x: (pointer.x - session.live.x) / oldScale,
      y: (pointer.y - session.live.y) / oldScale,
    };
    const nextScale = event.evt.deltaY > 0 ? oldScale / 1.08 : oldScale * 1.08;
    const scale = Math.max(MIN_SCALE, Math.min(MAX_SCALE, nextScale));

    session.live = {
      scale,
      x: pointer.x - point.x * scale,
      y: pointer.y - point.y * scale,
    };

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
      setTransform(finalTransform);
      window.requestAnimationFrame(() => {
        if (panWrapperRef.current) panWrapperRef.current.style.transform = '';
      });
    }, 120);

    zoomSessionRef.current = session;
  }

  function handlePointerDown(event) {
    const stage = event.target.getStage();
    const pointer = stage?.getPointerPosition();
    if ((tool === 'pan' || tool === 'route') && pointer) {
      panSessionRef.current = {
        clientPoint: getClientPoint(event.evt),
        origin: { ...transformRef.current },
        moved: false,
        liveDx: 0,
        liveDy: 0,
      };
    } else {
      panSessionRef.current = null;
    }

    if (event.target === stage && tool === 'select') onSelectNode(null);
  }

  function handlePointerMove(event) {
    const panSession = panSessionRef.current;
    if (!panSession) return;
    const { x: clientX, y: clientY } = getClientPoint(event.evt);
    if (typeof clientX !== 'number' || typeof clientY !== 'number') return;

    const dx = clientX - panSession.clientPoint.x;
    const dy = clientY - panSession.clientPoint.y;
    if (Math.hypot(dx, dy) > 2) panSession.moved = true;
    if (!panSession.moved) return;

    draggedRef.current = true;
    panSession.liveDx = dx;
    panSession.liveDy = dy;
    if (panWrapperRef.current) {
      panWrapperRef.current.style.transformOrigin = '0 0';
      panWrapperRef.current.style.transform = `translate3d(${dx}px, ${dy}px, 0)`;
    }
  }

  function handlePointerUp() {
    const panSession = panSessionRef.current;
    if (panSession?.moved) {
      setTransform({
        ...panSession.origin,
        x: panSession.origin.x + (panSession.liveDx || 0),
        y: panSession.origin.y + (panSession.liveDy || 0),
      });
      window.requestAnimationFrame(() => {
        if (panWrapperRef.current) panWrapperRef.current.style.transform = '';
      });
      window.setTimeout(() => {
        draggedRef.current = false;
      }, 0);
    } else {
      draggedRef.current = false;
    }
    panSessionRef.current = null;
  }

  if (!activeFloor && visibleFloors.length === 0) {
    return (
      <section className="viewerCanvas emptyCanvas">
        <strong>No floor selected</strong>
        <p>Choose a building and floor to view its published map.</p>
      </section>
    );
  }

  return (
    <section className={`viewerCanvas mapCanvasShell tool-${tool}`} aria-label={`Level ${activeFloorNumber} map canvas`}>
      <div ref={containerRef} className="konvaCanvasHost">
        <div ref={panWrapperRef} className="konvaPanWrapper" style={{ width: '100%', height: '100%', willChange: 'transform' }}>
        <Stage
          ref={stageRef}
          width={containerSize.width}
          height={containerSize.height}
          draggable={false}
          x={transformRef.current.x}
          y={transformRef.current.y}
          scaleX={transformRef.current.scale}
          scaleY={transformRef.current.scale}
          onWheel={handleWheel}
          onMouseDown={handlePointerDown}
          onMouseMove={handlePointerMove}
          onMouseUp={handlePointerUp}
          onMouseLeave={handlePointerUp}
          onTouchStart={handlePointerDown}
          onTouchMove={handlePointerMove}
          onTouchEnd={handlePointerUp}
        >
          <Layer>
            <Rect
              x={0}
              y={0}
              width={canvas.width}
              height={canvas.height}
              fill="#202422"
              stroke="#f3f6f4"
              strokeWidth={24}
              listening={false}
            />

            {buildings.flatMap((building) => {
              const polygons = geometryToKonvaPolygons(building.geometry);
              if (polygons.length === 0) return [];
              const isActive = Number(building.id) === Number(activeBuildingId);
              const vertices = isActive && selectedHandleVisible
                ? getGeometryPolygons(building.geometry).flatMap((polygon) => openGeometryRing(polygon))
                : [];

              return polygons.map((points, polygonIndex) => (
                <Line
                  key={`${building.id}-${polygonIndex}`}
                  points={points}
                  closed
                  fill={building.color || '#25826f'}
                  opacity={isActive ? 0.68 : 0.48}
                  stroke={isActive ? '#b4fff0' : '#f0f7f4'}
                  strokeWidth={isActive ? 6 : 4}
                  onClick={() => {
                    if (draggedRef.current) return;
                    if (tool === 'route') return;
                    onSelectBuilding?.(building.id);
                  }}
                  onTap={() => {
                    if (draggedRef.current) return;
                    if (tool === 'route') return;
                    onSelectBuilding?.(building.id);
                  }}
                />
              )).concat(vertices.map((point, pointIndex) => (
                <Circle
                  key={`${building.id}-vertex-${pointIndex}`}
                  x={point.x}
                  y={point.y}
                  radius={handleRadius}
                  fill="#ffd166"
                  stroke="#332612"
                  strokeWidth={handleStrokeWidth}
                  listening={false}
                />
              )));
            })}

            {visibleFloors.map((visibleFloor) => {
              const points = geometryToKonvaPoints(visibleFloor.geometry);
              if (points.length < 6) return null;

              return (
                <Line
                  key={`floor-${visibleFloor.id}`}
                  points={points}
                  closed
                  fill="rgba(255, 255, 255, 0.08)"
                  stroke="#ffffff"
                  strokeWidth={4}
                  dash={[20, 12]}
                  opacity={0.85}
                  listening={false}
                />
              );
            })}

            {displayedSameFloorEdges.map((edge) => {
              const fromNode = viewerNodesById.get(Number(edge.fromNodeId));
              const toNode = viewerNodesById.get(Number(edge.toNodeId));
              if (!fromNode || !toNode) return null;
              const routeKey = `${edge.fromNodeId}->${edge.toNodeId}`;
              const reverseRouteKey = `${edge.toNodeId}->${edge.fromNodeId}`;
              const isRoute = routeEdges.has(routeKey) || routeEdges.has(reverseRouteKey);
              const isCurrentLevelEdge = Number(fromNode.floorNumber) === Number(activeFloorNumber) || Number(toNode.floorNumber) === Number(activeFloorNumber);

              return (
                <Line
                  key={edge.id}
                  points={[
                    Number(fromNode.xCoord),
                    Number(fromNode.yCoord),
                    Number(toNode.xCoord),
                    Number(toNode.yCoord),
                  ]}
                  stroke={isRoute ? '#ffd166' : '#e8efec'}
                  strokeWidth={isRoute ? 10 : 4}
                  opacity={isRoute || isCurrentLevelEdge ? 1 : 0.28}
                  lineCap="round"
                  listening={false}
                />
              );
            })}

            {crossEdges.map((edge) => {
              const fromNode = viewerNodesById.get(Number(edge.fromNodeId));
              const toNode = viewerNodesById.get(Number(edge.toNodeId));
              if (!fromNode || !toNode) return null;
              const routeKey = `${edge.fromNodeId}->${edge.toNodeId}`;
              const reverseRouteKey = `${edge.toNodeId}->${edge.fromNodeId}`;
              const isRoute = routeEdges.has(routeKey) || routeEdges.has(reverseRouteKey);

              return (
                <Line
                  key={`cross-${edge.id}`}
                  points={[
                    Number(fromNode.xCoord),
                    Number(fromNode.yCoord),
                    Number(toNode.xCoord),
                    Number(toNode.yCoord),
                  ]}
                  stroke={isRoute ? '#ffd166' : '#4aa3ff'}
                  strokeWidth={isRoute ? 10 : 4}
                  opacity={isRoute ? 1 : 0.52}
                  dash={isRoute ? [28, 16] : [16, 12]}
                  lineCap="round"
                  listening={false}
                />
              );
            })}

            {visibleNodes.map((node) => {
              const isSelected = Number(selectedNodeId) === Number(node.id);
              const isRoute = routeNodes.has(Number(node.id));
              const fill = getNodeFill(node.type, isRoute, isSelected);
              const label = node.externalIdentifier || node.name;
              const nodeGeometry = nodeGeometryToLocalPoints(node);
              const isCurrentLevelNode = activeFloorNumber === null || Number(node.floorNumber) === Number(activeFloorNumber);

              return (
                <Group
                  key={node.id}
                  x={Number(node.xCoord || 0)}
                  y={Number(node.yCoord || 0)}
                  onClick={() => {
                    if (draggedRef.current) return;
                    onSelectNode(Number(node.id), node);
                  }}
                  onTap={() => {
                    if (draggedRef.current) return;
                    onSelectNode(Number(node.id), node);
                  }}
                >
                  {nodeGeometry.length >= 6 ? (
                    <Line
                      points={nodeGeometry}
                      closed
                      fill="rgba(255, 255, 255, 0.12)"
                      stroke={isSelected ? '#0d4f46' : '#ffffff'}
                      strokeWidth={isSelected ? nodeStrokeWidth * 2 : nodeStrokeWidth}
                      dash={[nodeRadius * 2, nodeRadius]}
                      listening={false}
                    />
                  ) : null}
                  {isSelected ? (
                    <Circle radius={nodeHaloRadius} fill={fill} opacity={0.18} listening={false} />
                  ) : null}
                  <Circle
                    radius={nodeRadius}
                    fill={fill}
                    opacity={isCurrentLevelNode || isSelected || isRoute ? 1 : 0.34}
                    stroke={isCurrentLevelNode ? '#d8ebff' : '#9fb3c7'}
                    strokeWidth={nodeStrokeWidth}
                    shadowColor="rgba(0,0,0,0.32)"
                    shadowBlur={8}
                  />
                  {isSelected ? (
                    <Label x={nodeRadius + labelPadding} y={-labelFontSize} opacity={0.96} listening={false}>
                      <Tag fill="#ffffff" stroke="#d6ded9" strokeWidth={nodeStrokeWidth * 0.5} cornerRadius={3} />
                      <Text
                        text={label}
                        fill="#18211f"
                        padding={labelPadding}
                        fontSize={labelFontSize}
                        fontStyle="bold"
                      />
                    </Label>
                  ) : null}
                </Group>
              );
            })}

            {buildings.map((building) => {
              const labelPoint = getGeometryCentroid(building.geometry);
              if (!labelPoint) return null;
              const isActive = Number(building.id) === Number(activeBuildingId);
              return (
                <Label
                  key={`${building.id}-label`}
                  x={labelPoint.x}
                  y={labelPoint.y}
                  offsetX={buildingLabelFontSize * 1.8}
                  offsetY={buildingLabelFontSize}
                  opacity={isActive ? 0.98 : 0.88}
                  listening={false}
                >
                  <Tag fill="#f8fbfa" stroke="#d6ded9" strokeWidth={nodeStrokeWidth * 0.5} cornerRadius={3} opacity={0.94} />
                  <Text
                    text={building.name}
                    fill="#18211f"
                    padding={buildingLabelPadding}
                    fontSize={buildingLabelFontSize}
                    fontStyle="bold"
                  />
                </Label>
              );
            })}
          </Layer>
        </Stage>
        </div>
      </div>
      <div className="canvasControls">
        <button type="button" onClick={() => setTransform((current) => ({ ...current, scale: Math.min(MAX_SCALE, current.scale * 1.2) }))}>+</button>
        <button type="button" onClick={() => setTransform((current) => ({ ...current, scale: Math.max(MIN_SCALE, current.scale / 1.2) }))}>-</button>
        <button type="button" onClick={() => setTransform(fitTransform(containerSize, contentBounds))}>Fit</button>
        <span>{Math.round(transform.scale * 100)}%</span>
      </div>
      <div className="canvasCoordinateLabel">
        {canvas.width} x {canvas.height}
      </div>
    </section>
  );
}
