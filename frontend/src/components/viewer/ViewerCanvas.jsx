import { useEffect, useMemo, useRef, useState } from 'react';
import { Circle, Group, Label, Layer, Line, Rect, Stage, Tag, Text } from 'react-konva';
import {
  buildNodesById,
  createCoordinateMapper,
  geometryToKonvaPolygons,
  geometryToKonvaPoints,
  getGeometryCentroid,
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

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function getRenderMetrics(bounds) {
  const span = Math.max(bounds.maxX - bounds.minX, bounds.maxY - bounds.minY, 1);
  return {
    buildingStroke: clamp(span / 220, 0.9, 5),
    activeBuildingStroke: clamp(span / 150, 1.6, 8),
    floorStroke: clamp(span / 260, 0.8, 4),
    edgeStroke: clamp(span / 250, 1.2, 5),
    routeStroke: clamp(span / 170, 2, 8),
    nodeRadius: clamp(span / 90, 3.5, 14),
    nodeStroke: clamp(span / 360, 0.8, 3.5),
    nodeHalo: clamp(span / 42, 8, 28),
    labelFont: clamp(span / 95, 6.5, 14),
    labelPadding: clamp(span / 230, 2, 6),
  };
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
  const [transform, setTransform] = useState(initialTransform);
  const stageRef = useRef(null);

  const routeNodes = useMemo(() => routeNodeSet(route), [route]);
  const routeEdges = useMemo(() => routeEdgeSet(route), [route]);
  const nodesById = useMemo(() => buildNodesById(visibleFloors), [visibleFloors]);
  const edges = useMemo(() => getVisibleEdges(visibleFloors), [visibleFloors]);
  const visibleNodes = useMemo(
    () => visibleFloors.flatMap((floor) =>
      (floor.nodes || []).map((node) => ({ ...node, floorId: floor.id, buildingId: floor.buildingId }))
    ),
    [visibleFloors]
  );
  const coordinateMapper = useMemo(() => createCoordinateMapper(transform), [transform]);
  const renderMetrics = useMemo(() => getRenderMetrics(contentBounds), [contentBounds]);

  useEffect(() => {
    setTransform(fitTransform(containerSize, contentBounds));
  }, [containerSize, contentBounds]);

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
  }, [containerSize, coordinateMapper, floors, focusedNodeId, initialTransform.scale, onFocusHandled, transform.scale, transform.x, transform.y]);

  function handleWheel(event) {
    event.evt.preventDefault();
    const stage = stageRef.current;
    const pointer = stage?.getPointerPosition();
    if (!pointer) return;

    const scaleBy = 1.08;
    const oldScale = transform.scale;
    const point = {
      x: (pointer.x - transform.x) / oldScale,
      y: (pointer.y - transform.y) / oldScale,
    };
    const direction = event.evt.deltaY > 0 ? -1 : 1;
    const nextScale = direction > 0 ? oldScale * scaleBy : oldScale / scaleBy;
    const scale = Math.max(MIN_SCALE, Math.min(MAX_SCALE, nextScale));

    setTransform({
      scale,
      x: pointer.x - point.x * scale,
      y: pointer.y - point.y * scale,
    });
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
    <section className="viewerCanvas mapCanvasShell" aria-label={`Level ${activeFloorNumber} map canvas`}>
      <div ref={containerRef} className="konvaCanvasHost">
        <Stage
          ref={stageRef}
          width={containerSize.width}
          height={containerSize.height}
          draggable
          x={transform.x}
          y={transform.y}
          scaleX={transform.scale}
          scaleY={transform.scale}
          onDragEnd={(event) => {
            setTransform((current) => ({
              ...current,
              x: event.target.x(),
              y: event.target.y(),
            }));
          }}
          onWheel={handleWheel}
          onMouseDown={(event) => {
            if (event.target === event.target.getStage()) onSelectNode(null);
          }}
          onTouchStart={(event) => {
            if (event.target === event.target.getStage()) onSelectNode(null);
          }}
        >
          <Layer>
            <Rect
              x={0}
              y={0}
              width={canvas.width}
              height={canvas.height}
              fill="#a8a8a8"
              stroke="#ffffff"
              strokeWidth={28}
              listening={false}
            />

            {buildings.flatMap((building) => {
              const polygons = geometryToKonvaPolygons(building.geometry);
              const labelPoint = getGeometryCentroid(building.geometry);
              if (polygons.length === 0) return [];
              const isActive = Number(building.id) === Number(activeBuildingId);

              return polygons.map((points, polygonIndex) => (
                <Line
                  key={`${building.id}-${polygonIndex}`}
                  points={points}
                  closed
                  fill={building.color || '#3d8f4a'}
                  opacity={isActive ? 0.92 : 0.72}
                  stroke={isActive ? '#173f37' : '#f7faf8'}
                  strokeWidth={isActive ? renderMetrics.activeBuildingStroke : renderMetrics.buildingStroke}
                  onClick={() => onSelectBuilding?.(building.id)}
                  onTap={() => onSelectBuilding?.(building.id)}
                />
              )).concat(labelPoint ? [
                <Label
                  key={`${building.id}-label`}
                  x={labelPoint.x}
                  y={labelPoint.y}
                  offsetX={24}
                  offsetY={renderMetrics.labelFont}
                  opacity={isActive ? 0.96 : 0.8}
                  listening={false}
                >
                  <Tag fill="#ffffff" stroke="#d6ded9" strokeWidth={renderMetrics.nodeStroke * 0.5} cornerRadius={3} />
                  <Text
                    text={building.name}
                    fill="#18211f"
                    padding={renderMetrics.labelPadding}
                    fontSize={renderMetrics.labelFont}
                    fontStyle="bold"
                  />
                </Label>,
              ] : []);
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
                  strokeWidth={renderMetrics.floorStroke}
                  dash={[renderMetrics.floorStroke * 5, renderMetrics.floorStroke * 3]}
                  opacity={0.84}
                  listening={false}
                />
              );
            })}

            {edges.map((edge) => {
              const fromNode = nodesById.get(Number(edge.fromNodeId));
              const toNode = nodesById.get(Number(edge.toNodeId));
              if (!fromNode || !toNode) return null;
              const routeKey = `${edge.fromNodeId}->${edge.toNodeId}`;
              const reverseRouteKey = `${edge.toNodeId}->${edge.fromNodeId}`;
              const isRoute = routeEdges.has(routeKey) || routeEdges.has(reverseRouteKey);

              return (
                <Line
                  key={edge.id}
                  points={[
                    Number(fromNode.xCoord),
                    Number(fromNode.yCoord),
                    Number(toNode.xCoord),
                    Number(toNode.yCoord),
                  ]}
                  stroke={isRoute ? '#ffd166' : '#f1f5f3'}
                  strokeWidth={isRoute ? renderMetrics.routeStroke : renderMetrics.edgeStroke}
                  opacity={isRoute ? 1 : 0.72}
                  dash={edge.accessible === false ? [renderMetrics.edgeStroke * 4, renderMetrics.edgeStroke * 3] : undefined}
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

              return (
                <Group
                  key={node.id}
                  x={Number(node.xCoord || 0)}
                  y={Number(node.yCoord || 0)}
                  onClick={() => onSelectNode(Number(node.id))}
                  onTap={() => onSelectNode(Number(node.id))}
                >
                  {nodeGeometry.length >= 6 ? (
                    <Line
                      points={nodeGeometry}
                      closed
                      fill="rgba(255, 255, 255, 0.12)"
                      stroke={isSelected ? '#0d4f46' : '#ffffff'}
                      strokeWidth={isSelected ? renderMetrics.nodeStroke * 2 : renderMetrics.nodeStroke}
                      dash={[renderMetrics.nodeRadius * 2, renderMetrics.nodeRadius]}
                      listening={false}
                    />
                  ) : null}
                  {isSelected ? (
                    <Circle radius={renderMetrics.nodeHalo} fill={fill} opacity={0.18} listening={false} />
                  ) : null}
                  <Circle
                    radius={renderMetrics.nodeRadius}
                    fill={fill}
                    stroke="#d8ebff"
                    strokeWidth={renderMetrics.nodeStroke}
                    shadowColor="rgba(0,0,0,0.28)"
                    shadowBlur={renderMetrics.nodeRadius * 0.5}
                    shadowOffsetY={renderMetrics.nodeRadius * 0.2}
                  />
                  <Label x={renderMetrics.nodeRadius + renderMetrics.labelPadding} y={-renderMetrics.labelFont} opacity={0.96} listening={false}>
                    <Tag fill="#ffffff" stroke="#d6ded9" strokeWidth={renderMetrics.nodeStroke * 0.5} cornerRadius={3} />
                    <Text
                      text={label}
                      fill="#18211f"
                      padding={renderMetrics.labelPadding}
                      fontSize={renderMetrics.labelFont}
                      fontStyle="bold"
                    />
                  </Label>
                </Group>
              );
            })}
          </Layer>
        </Stage>
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
