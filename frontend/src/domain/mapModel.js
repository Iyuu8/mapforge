export const NODE_TYPE_LABELS = {
  ROOM: 'Room',
  CORRIDOR_POINT: 'Corridor',
  ENTRANCE: 'Entrance',
  EXIT: 'Exit',
  STAIR: 'Stair',
  ELEVATOR: 'Elevator',
  RESTROOM: 'Restroom',
  CAFETERIA: 'Cafeteria',
  OFFICE: 'Office',
  PATH: 'Path',
  INTERSECTION: 'Intersection',
  GATE: 'Gate',
  COURTYARD: 'Courtyard',
  LANDMARK: 'Landmark',
};

export function normalizeMapPayload(payload) {
  const buildings = payload?.buildings || (payload?.building ? [payload.building] : []);
  const floors = (payload?.floors || []).map((floor) => ({
    ...floor,
    buildingId: floor.buildingId || payload?.building?.id || null,
  }));

  return {
    buildings,
    floors: floors.map((floor) => ({
      ...floor,
      nodes: floor.nodes || [],
      edges: floor.edges || [],
    })),
  };
}

export function getFloorsForBuilding(floors, buildingId) {
  return floors
    .filter((floor) => Number(floor.buildingId || getBuildingIdFromFloor(floor)) === Number(buildingId))
    .sort((a, b) => Number(a.floorNumber) - Number(b.floorNumber));
}

export function getBuildingIdFromFloor(floor, buildings = []) {
  if (floor.buildingId) return floor.buildingId;

  const owningBuilding = buildings.find((building) =>
    (floor.nodes || []).some((node) => Number(node.buildingId) === Number(building.id))
  );
  return owningBuilding?.id || null;
}

export function buildNodeIndex(floors) {
  const index = new Map();
  floors.forEach((floor) => {
    (floor.nodes || []).forEach((node) => {
      index.set(Number(node.id), { ...node, floorId: floor.id });
    });
  });
  return index;
}

export function collectUniqueEdges(floors) {
  const edgesById = new Map();
  floors.forEach((floor) => {
    (floor.edges || []).forEach((edge) => {
      edgesById.set(Number(edge.id), edge);
    });
  });
  return [...edgesById.values()];
}

export function getVisibleEdges(floor) {
  const visibleFloors = Array.isArray(floor) ? floor : [floor].filter(Boolean);
  const floorNodeIds = new Set(
    visibleFloors.flatMap((visibleFloor) => (visibleFloor?.nodes || []).map((node) => Number(node.id)))
  );
  const edgesById = new Map();

  visibleFloors.forEach((visibleFloor) => {
    (visibleFloor?.edges || []).forEach((edge) => {
      if (floorNodeIds.has(Number(edge.fromNodeId)) && floorNodeIds.has(Number(edge.toNodeId))) {
        edgesById.set(Number(edge.id), edge);
      }
    });
  });

  return [...edgesById.values()];
}

export function getNodeById(floors, nodeId) {
  if (!nodeId) return null;
  for (const floor of floors) {
    const node = (floor.nodes || []).find((candidate) => Number(candidate.id) === Number(nodeId));
    if (node) return { ...node, floorId: floor.id, buildingId: floor.buildingId };
  }
  return null;
}

export function getFloorForNode(floors, nodeId) {
  return floors.find((floor) =>
    (floor.nodes || []).some((node) => Number(node.id) === Number(nodeId))
  ) || null;
}

export function getGeometryPoints(geometry) {
  const points = getGeometryPolygons(geometry)[0] || [];

  return points;
}

export function getGeometryPolygons(geometry) {
  const parsedGeometry = parseGeometryInput(geometry);
  if (!parsedGeometry) return [];

  if (parsedGeometry.type === 'MultiPolygon' && Array.isArray(parsedGeometry.coordinates)) {
    return parsedGeometry.coordinates
      .map((polygon) => parseGeometryRing(polygon?.[0] || polygon))
      .filter((points) => points.length >= 3);
  }

  if (parsedGeometry.type === 'Polygon' && Array.isArray(parsedGeometry.coordinates)) {
    return [parseGeometryRing(parsedGeometry.coordinates[0] || parsedGeometry.coordinates)].filter((points) => points.length >= 3);
  }

  const rawPoints = Array.isArray(parsedGeometry)
    ? parsedGeometry
    : parsedGeometry.points || parsedGeometry.polygon || parsedGeometry.coordinates || [];

  return [parseGeometryRing(unwrapGeometryPoints(rawPoints))].filter((points) => points.length >= 3);
}

function parseGeometryInput(geometry) {
  if (typeof geometry !== 'string') return geometry;

  try {
    return JSON.parse(geometry);
  } catch {
    return null;
  }
}

function parseGeometryRing(points) {
  if (!Array.isArray(points)) return [];

  return points
    .map((point) => {
      if (Array.isArray(point)) {
        return { x: Number(point[0]), y: Number(point[1]) };
      }
      return { x: Number(point?.x ?? point?.xCoord), y: Number(point?.y ?? point?.yCoord) };
    })
    .filter((point) => Number.isFinite(point.x) && Number.isFinite(point.y));
}

export function getMapContentBounds({ organization, buildings = [], floors = [] }) {
  const points = [];

  buildings.forEach((building) => {
    getGeometryPolygons(building.geometry).forEach((polygon) => points.push(...polygon));
  });

  floors.forEach((floor) => {
    getGeometryPolygons(floor.geometry).forEach((polygon) => points.push(...polygon));
    (floor.nodes || []).forEach((node) => {
      points.push({ x: Number(node.xCoord || 0), y: Number(node.yCoord || 0) });
      getGeometryPolygons(node.geometry).forEach((polygon) => points.push(...polygon));
    });
  });

  if (points.length === 0) {
    return {
      minX: 0,
      minY: 0,
      maxX: Number(organization?.canvasWidth || 8000),
      maxY: Number(organization?.canvasHeight || 6000),
    };
  }

  const xs = points.map((point) => point.x);
  const ys = points.map((point) => point.y);
  const minX = Math.min(...xs);
  const minY = Math.min(...ys);
  const maxX = Math.max(...xs);
  const maxY = Math.max(...ys);
  const width = Math.max(1, maxX - minX);
  const height = Math.max(1, maxY - minY);
  const padX = Math.max(width * 0.18, 80);
  const padY = Math.max(height * 0.18, 80);

  return {
    minX: Math.max(0, minX - padX),
    minY: Math.max(0, minY - padY),
    maxX: Math.min(Number(organization?.canvasWidth || 8000), maxX + padX),
    maxY: Math.min(Number(organization?.canvasHeight || 6000), maxY + padY),
  };
}

function unwrapGeometryPoints(points) {
  if (!Array.isArray(points)) return [];
  if (points.length === 0) return [];

  const first = points[0];
  if (Array.isArray(first) && Array.isArray(first[0])) {
    return unwrapGeometryPoints(first);
  }

  return points;
}

export function geometryToSvgPoints(geometry) {
  return getGeometryPoints(geometry)
    .map((point) => `${point.x},${point.y}`)
    .join(' ');
}

export function geometryToKonvaPoints(geometry) {
  return getGeometryPoints(geometry).flatMap((point) => [point.x, point.y]);
}

export function geometryToKonvaPolygons(geometry) {
  return getGeometryPolygons(geometry).map((polygon) => polygon.flatMap((point) => [point.x, point.y]));
}

export function getGeometryCentroid(geometry) {
  const points = getGeometryPoints(geometry);
  if (points.length === 0) return null;

  const uniquePoints = points.length > 1 &&
    points[0].x === points[points.length - 1].x &&
    points[0].y === points[points.length - 1].y
    ? points.slice(0, -1)
    : points;

  const total = uniquePoints.reduce(
    (accumulator, point) => ({
      x: accumulator.x + point.x,
      y: accumulator.y + point.y,
    }),
    { x: 0, y: 0 }
  );

  return {
    x: total.x / uniquePoints.length,
    y: total.y / uniquePoints.length,
  };
}

export function nodeGeometryToLocalPoints(node) {
  const points = getGeometryPoints(node?.geometry);
  if (points.length < 3) return [];

  const nodeX = Number(node.xCoord || 0);
  const nodeY = Number(node.yCoord || 0);
  const xs = points.map((point) => point.x);
  const ys = points.map((point) => point.y);
  const minX = Math.min(...xs);
  const maxX = Math.max(...xs);
  const minY = Math.min(...ys);
  const maxY = Math.max(...ys);
  const tolerance = Math.max(maxX - minX, maxY - minY, 1) * 0.5;
  const isProbablyAbsolute =
    nodeX >= minX - tolerance &&
    nodeX <= maxX + tolerance &&
    nodeY >= minY - tolerance &&
    nodeY <= maxY + tolerance;

  return points.flatMap((point) => [
    isProbablyAbsolute ? point.x - nodeX : point.x,
    isProbablyAbsolute ? point.y - nodeY : point.y,
  ]);
}

export function buildNodesById(floor) {
  const visibleFloors = Array.isArray(floor) ? floor : [floor].filter(Boolean);
  const nodesById = new Map();
  visibleFloors.forEach((visibleFloor) => {
    (visibleFloor?.nodes || []).forEach((node) => {
      nodesById.set(Number(node.id), { ...node, floorId: visibleFloor.id, buildingId: visibleFloor.buildingId });
    });
  });
  return nodesById;
}

export function getActiveFloorNumber(floors, activeFloorId) {
  const activeFloor = floors.find((floor) => Number(floor.id) === Number(activeFloorId));
  if (activeFloor) return Number(activeFloor.floorNumber);
  const sorted = [...floors].sort((a, b) => Number(a.floorNumber) - Number(b.floorNumber));
  return sorted.length ? Number(sorted[0].floorNumber) : null;
}

export function getFloorsForLevel(floors, floorNumber) {
  if (floorNumber === null || floorNumber === undefined) return [];
  return floors
    .filter((floor) => Number(floor.floorNumber) === Number(floorNumber))
    .sort((a, b) => String(a.buildingName || '').localeCompare(String(b.buildingName || '')));
}

export function getFloorLevelOptions(floors) {
  const levels = new Map();
  floors.forEach((floor) => {
    const floorNumber = Number(floor.floorNumber);
    if (!levels.has(floorNumber)) {
      levels.set(floorNumber, {
        floorNumber,
        label: floor.name || `Level ${floorNumber}`,
        count: 0,
      });
    }
    levels.get(floorNumber).count += 1;
  });
  return [...levels.values()].sort((a, b) => a.floorNumber - b.floorNumber);
}

export function createCoordinateMapper(transform) {
  const scale = Number(transform?.scale || 1);
  const offsetX = Number(transform?.x || 0);
  const offsetY = Number(transform?.y || 0);

  return {
    mapToScreen(point) {
      return {
        x: Number(point.x ?? point.xCoord ?? 0) * scale + offsetX,
        y: Number(point.y ?? point.yCoord ?? 0) * scale + offsetY,
      };
    },
    screenToMap(point) {
      return {
        x: (Number(point.x || 0) - offsetX) / scale,
        y: (Number(point.y || 0) - offsetY) / scale,
      };
    },
  };
}

export function makeEdgeKey(fromNodeId, toNodeId) {
  return `${fromNodeId}->${toNodeId}`;
}

export function routeNodeSet(route) {
  return new Set((route?.path || []).map((node) => Number(node.id)));
}

export function routeEdgeSet(route) {
  const keys = new Set();
  const path = route?.path || [];
  for (let index = 0; index < path.length - 1; index += 1) {
    keys.add(makeEdgeKey(path[index].id, path[index + 1].id));
  }
  return keys;
}

export function groupRouteByFloor(route, floors) {
  const floorById = new Map(floors.map((floor) => [Number(floor.id), floor]));
  const segments = [];

  (route?.path || []).forEach((node) => {
    const floorId = Number(node.floorId);
    const current = segments[segments.length - 1];
    if (!current || Number(current.floorId) !== floorId) {
      segments.push({
        floorId,
        floorName: floorById.get(floorId)?.name || `Floor ${floorId}`,
        nodes: [node],
      });
    } else {
      current.nodes.push(node);
    }
  });

  return segments;
}
