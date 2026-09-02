import * as editorApi from '../api/editorApi';
import * as organizationApi from '../api/organizationApi';
import * as routeApi from '../api/routeApi';
import * as searchApi from '../api/searchApi';
import {
  NODE_TYPE_LABELS,
  buildNodeIndex,
  getFloorsForBuilding,
  getGeometryCentroid,
  getGeometryPolygons,
} from '../domain/mapModel';

const NODE_TYPES = Object.keys(NODE_TYPE_LABELS);
const ENTRANCE_TYPES = new Set(['ENTRANCE', 'GATE', 'EXIT']);

function normalizeText(value) {
  return String(value ?? '').trim().toLowerCase();
}

function normalizeLoose(value) {
  return normalizeText(value).replace(/[^a-z0-9]+/g, ' ').trim().replace(/\s+/g, ' ');
}

function requireAdmin(context) {
  if (!context.isAdmin) {
    throw new Error('Only administrators can edit this map.');
  }
}

function asNumber(value, fallback = 0) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function canvasBounds(context) {
  return {
    width: asNumber(context.organization?.canvasWidth, 8000),
    height: asNumber(context.organization?.canvasHeight, 6000),
  };
}

function compactNode(node) {
  if (!node) return null;
  return {
    kind: 'node',
    id: node.id,
    externalIdentifier: node.externalIdentifier || node.identifier || null,
    name: node.name,
    type: node.type,
    typeLabel: NODE_TYPE_LABELS[node.type] || node.type,
    floorId: node.floorId,
    buildingId: node.buildingId,
    floorNumber: node.floorNumber,
    xCoord: asNumber(node.xCoord),
    yCoord: asNumber(node.yCoord),
  };
}

function compactBuilding(building) {
  if (!building) return null;
  const centroid = getGeometryCentroid(building.geometry);
  return {
    kind: 'building',
    id: building.id,
    name: building.name,
    status: building.status,
    description: building.description || null,
    color: building.color || null,
    centroid,
    area: getBuildingArea(building),
  };
}

function compactFloor(floor) {
  if (!floor) return null;
  return {
    id: floor.id,
    buildingId: floor.buildingId,
    buildingName: floor.buildingName,
    name: floor.name,
    floorNumber: floor.floorNumber,
    nodeCount: (floor.nodes || []).length,
    edgeCount: (floor.edges || []).length,
  };
}

function getAllNodes(context) {
  return context.floors.flatMap((floor) =>
    (floor.nodes || []).map((node) => ({
      ...node,
      floorId: floor.id,
      floorNumber: Number(floor.floorNumber),
      buildingId: floor.buildingId,
      buildingName: floor.buildingName,
      floorName: floor.name,
    }))
  );
}

function findByIdOrName(items, reference, getAliases) {
  if (reference === null || reference === undefined || reference === '') return null;
  const normalizedReference = normalizeText(reference);
  const looseReference = normalizeLoose(reference);
  const aliasesFor = (item) => getAliases(item).filter((alias) => alias !== null && alias !== undefined && alias !== '');
  const byExactAlias = items.find((item) => aliasesFor(item).some((alias) => normalizeText(alias) === normalizedReference));
  if (byExactAlias) return byExactAlias;

  const byLooseExactAlias = items.find((item) => aliasesFor(item).some((alias) => normalizeLoose(alias) === looseReference));
  if (byLooseExactAlias) return byLooseExactAlias;

  const byPartialAlias = items.find((item) => aliasesFor(item).some((alias) => {
    const looseAlias = normalizeLoose(alias);
    return looseReference && (looseAlias.includes(looseReference) || looseReference.includes(looseAlias));
  }));
  if (byPartialAlias) return byPartialAlias;

  const numericId = Number(reference);
  if (Number.isFinite(numericId)) {
    return items.find((item) => Number(item.id) === numericId) || null;
  }

  return null;
}

function resolveBuilding(context, reference) {
  const building = findByIdOrName(context.buildings, reference, (item) => [item.name, item.description]);
  if (!building) throw new Error(`Building "${reference}" was not found on this map.`);
  return building;
}

function resolveFloor(context, reference, buildingReference = null) {
  const floors = buildingReference
    ? getFloorsForBuilding(context.floors, resolveBuilding(context, buildingReference).id)
    : context.floors;
  const floor = findByIdOrName(floors, reference, (item) => [item.name, item.floorNumber, `${item.buildingName} ${item.name}`]);
  if (!floor) throw new Error(`Floor "${reference}" was not found on this map.`);
  return floor;
}

function resolveNode(context, reference) {
  const nodes = getAllNodes(context);
  const nodeAliases = (item) => [
    item.externalIdentifier,
    item.identifier,
    item.name,
    `${item.externalIdentifier || item.identifier || ''} ${item.name || ''}`,
    `${item.buildingName || ''} ${item.floorName || ''} ${item.name || ''}`,
  ];

  if (reference !== null && reference !== undefined && reference !== '') {
    const normalizedReference = normalizeText(reference);
    const looseReference = normalizeLoose(reference);
    const aliasesFor = (item) => nodeAliases(item).filter((alias) => alias !== null && alias !== undefined && alias !== '');
    const exactMatch = nodes.find((item) => aliasesFor(item).some((alias) =>
      normalizeText(alias) === normalizedReference || normalizeLoose(alias) === looseReference
    ));
    if (exactMatch) return exactMatch;

    const partialMatches = nodes.filter((item) => nodeAliases(item).some((alias) => {
      const looseAlias = normalizeLoose(alias);
      return looseAlias && looseReference && looseAlias.includes(looseReference);
    }));
    if (partialMatches.length === 1) return partialMatches[0];
    if (partialMatches.length > 1) {
      const choices = partialMatches.slice(0, 6).map((item) => item.externalIdentifier || item.identifier || item.name || item.id).join(', ');
      throw new Error(`More than one node matches "${reference}". Use a clearer node name or identifier. Matches include: ${choices}.`);
    }
  }

  const node = findByIdOrName(nodes, reference, (item) => nodeAliases(item));
  if (!node) throw new Error(`Node "${reference}" was not found on this map.`);
  return node;
}

function getUniqueEdges(context) {
  const edgesById = new Map();
  context.floors.forEach((floor) => {
    (floor.edges || []).forEach((edge) => edgesById.set(Number(edge.id), edge));
  });
  return [...edgesById.values()];
}

function resolveEdge(context, input) {
  const edges = getUniqueEdges(context);
  if (input.edgeId) {
    const edge = edges.find((item) => Number(item.id) === Number(input.edgeId));
    if (!edge) throw new Error(`Connection "${input.edgeId}" was not found on this map.`);
    return edge;
  }

  const from = resolveNode(context, input.fromNode);
  const to = resolveNode(context, input.toNode);
  const edge = edges.find((item) => {
    const fromId = Number(item.fromNodeId);
    const toId = Number(item.toNodeId);
    return (fromId === Number(from.id) && toId === Number(to.id)) ||
      (fromId === Number(to.id) && toId === Number(from.id));
  });
  if (!edge) throw new Error(`No connection exists between "${input.fromNode}" and "${input.toNode}".`);
  return edge;
}

function getBuildingArea(building) {
  return getGeometryPolygons(building.geometry).reduce((sum, polygon) => {
    if (polygon.length < 3) return sum;
    const area = polygon.reduce((total, point, index) => {
      const next = polygon[(index + 1) % polygon.length];
      return total + point.x * next.y - next.x * point.y;
    }, 0);
    return sum + Math.abs(area) / 2;
  }, 0);
}

function getBuildingBounds(building) {
  const points = getGeometryPolygons(building.geometry).flat();
  if (points.length === 0) return null;
  return {
    minX: Math.min(...points.map((point) => point.x)),
    maxX: Math.max(...points.map((point) => point.x)),
    minY: Math.min(...points.map((point) => point.y)),
    maxY: Math.max(...points.map((point) => point.y)),
  };
}

function directionFromDelta(dx, dy) {
  if (Math.abs(dx) < 1 && Math.abs(dy) < 1) return 'overlapping';
  if (Math.abs(dx) > Math.abs(dy) * 1.5) return dx > 0 ? 'east' : 'west';
  if (Math.abs(dy) > Math.abs(dx) * 1.5) return dy > 0 ? 'south' : 'north';
  if (dx > 0 && dy > 0) return 'southeast';
  if (dx > 0 && dy < 0) return 'northeast';
  if (dx < 0 && dy > 0) return 'southwest';
  return 'northwest';
}

function findBuildingEntrances(context, buildingReference) {
  const building = resolveBuilding(context, buildingReference);
  const entrances = getAllNodes(context).filter((node) =>
    Number(node.buildingId) === Number(building.id) && ENTRANCE_TYPES.has(node.type)
  );
  if (entrances.length === 0) throw new Error(`Building "${building.name}" has no entrance, gate, or exit nodes.`);
  return { building, entrances };
}

async function routeBetweenNodeCandidates(sourceNodes, destinationNodes, accessibleOnly) {
  const attempts = [];
  for (const source of sourceNodes) {
    for (const destination of destinationNodes) {
      try {
        const route = await routeApi.findRoute({
          sourceId: source.id,
          destinationId: destination.id,
          accessibleOnly,
        });
        attempts.push({ source: compactNode(source), destination: compactNode(destination), route });
      } catch {
        // Continue trying deterministic entrance pairs; report a single clean failure if none route.
      }
    }
  }

  attempts.sort((a, b) => asNumber(a.route?.totalDistance, Infinity) - asNumber(b.route?.totalDistance, Infinity));
  if (!attempts[0]) throw new Error('No route was found between those locations.');
  return attempts[0];
}

function nodePayload(input, context) {
  const bounds = canvasBounds(context);
  const type = String(input.type || 'ROOM').toUpperCase();
  if (!NODE_TYPES.includes(type)) {
    throw new Error(`Node type must be one of: ${NODE_TYPES.join(', ')}.`);
  }

  const floor = resolveFloor(context, input.floor, input.building);

  return {
    floorId: floor.id,
    floorNumber: floor.floorNumber,
    floorName: floor.name,
    buildingId: floor.buildingId,
    buildingName: floor.buildingName,
    name: input.name || '',
    externalIdentifier: input.externalIdentifier || input.identifier || '',
    type,
    xCoord: clamp(asNumber(input.xCoord), 0, bounds.width),
    yCoord: clamp(asNumber(input.yCoord), 0, bounds.height),
    metadata: input.metadata || null,
    geometry: input.geometry || null,
  };
}

function withNodeFloorContext(node, context) {
  const floor = context.floors.find((item) => Number(item.id) === Number(node.floorId));
  return {
    ...node,
    floorNumber: floor?.floorNumber ?? node.floorNumber,
    floorName: floor?.name ?? node.floorName,
    buildingId: floor?.buildingId ?? node.buildingId,
    buildingName: floor?.buildingName ?? node.buildingName,
  };
}

function emitMapChanged(context, detail = {}) {
  window.dispatchEvent(new CustomEvent('mapforge:webmcp:map-changed', {
    detail: { organizationId: context.organizationId, ...detail },
  }));
}

function tempId() {
  return -Math.floor(Date.now() + Math.random() * 100000);
}

function setLocalBuilding(context, building) {
  context.setBuildings?.((current) => {
    const exists = current.some((item) => Number(item.id) === Number(building.id));
    return exists
      ? current.map((item) => Number(item.id) === Number(building.id) ? { ...item, ...building } : item)
      : [...current, building];
  });
}

function removeLocalBuilding(context, buildingId) {
  const removedNodeIds = new Set(context.floors
    .filter((floor) => Number(floor.buildingId) === Number(buildingId))
    .flatMap((floor) => (floor.nodes || []).map((node) => Number(node.id))));
  context.setBuildings?.((current) => current.filter((building) => Number(building.id) !== Number(buildingId)));
  context.setFloors?.((current) => current
    .filter((floor) => Number(floor.buildingId) !== Number(buildingId))
    .map((floor) => ({
      ...floor,
      edges: (floor.edges || []).filter((edge) => !removedNodeIds.has(Number(edge.fromNodeId)) && !removedNodeIds.has(Number(edge.toNodeId))),
    })));
}

function setLocalFloor(context, floor) {
  context.setFloors?.((current) => {
    const exists = current.some((item) => Number(item.id) === Number(floor.id));
    const nextFloor = {
      ...floor,
      nodes: floor.nodes || current.find((item) => Number(item.id) === Number(floor.id))?.nodes || [],
      edges: floor.edges || current.find((item) => Number(item.id) === Number(floor.id))?.edges || [],
    };
    return exists
      ? current.map((item) => Number(item.id) === Number(floor.id) ? { ...item, ...nextFloor } : item)
      : [...current, nextFloor];
  });
}

function removeLocalFloor(context, floorId) {
  const removedFloor = context.floors.find((floor) => Number(floor.id) === Number(floorId));
  const removedNodeIds = new Set((removedFloor?.nodes || []).map((node) => Number(node.id)));
  context.setFloors?.((current) => current
    .filter((floor) => Number(floor.id) !== Number(floorId))
    .map((floor) => ({
      ...floor,
      edges: (floor.edges || []).filter((edge) => !removedNodeIds.has(Number(edge.fromNodeId)) && !removedNodeIds.has(Number(edge.toNodeId))),
    })));
}

function setLocalNode(context, node) {
  context.setFloors?.((current) => {
    const targetFloorId = Number(node.floorId);
    return current.map((floor) => {
      const nodesWithoutTarget = (floor.nodes || []).filter((item) => Number(item.id) !== Number(node.id));
      if (Number(floor.id) !== targetFloorId) {
        return nodesWithoutTarget.length === (floor.nodes || []).length ? floor : { ...floor, nodes: nodesWithoutTarget };
      }

      const existing = (floor.nodes || []).find((item) => Number(item.id) === Number(node.id));
      const nextNode = { ...(existing || {}), ...node };
      return { ...floor, nodes: [...nodesWithoutTarget, nextNode] };
    }).map((floor) => floor);
  });
}

function replaceLocalNode(context, tempNodeId, node) {
  context.setFloors?.((current) => current.map((floor) => {
    const nodes = floor.nodes || [];
    const hasTempNode = nodes.some((item) => Number(item.id) === Number(tempNodeId));
    if (!hasTempNode && Number(floor.id) !== Number(node.floorId)) return floor;

    return {
      ...floor,
      nodes: nodes
        .filter((item) => Number(item.id) !== Number(tempNodeId) && Number(item.id) !== Number(node.id))
        .concat(Number(floor.id) === Number(node.floorId) ? [node] : []),
    };
  }));
}

function removeLocalNode(context, nodeId) {
  context.setFloors?.((current) => current.map((floor) => ({
    ...floor,
    nodes: (floor.nodes || []).filter((node) => Number(node.id) !== Number(nodeId)),
    edges: (floor.edges || []).filter((edge) => Number(edge.fromNodeId) !== Number(nodeId) && Number(edge.toNodeId) !== Number(nodeId)),
  })));
}

function setLocalEdge(context, edge) {
  const nodeIndex = buildNodeIndex(context.floors);
  const from = nodeIndex.get(Number(edge.fromNodeId));
  const to = nodeIndex.get(Number(edge.toNodeId));
  const touchedFloorIds = new Set([from?.floorId, to?.floorId].filter(Boolean).map(Number));

  context.setFloors?.((current) => current.map((floor) => {
    const edgesWithoutTarget = (floor.edges || []).filter((item) => Number(item.id) !== Number(edge.id));
    if (!touchedFloorIds.has(Number(floor.id))) return edgesWithoutTarget.length === (floor.edges || []).length ? floor : { ...floor, edges: edgesWithoutTarget };
    return { ...floor, edges: [...edgesWithoutTarget, edge] };
  }));
}

function replaceLocalEdge(context, tempEdgeId, edge) {
  const nodeIndex = buildNodeIndex(context.floors);
  const from = nodeIndex.get(Number(edge.fromNodeId));
  const to = nodeIndex.get(Number(edge.toNodeId));
  const touchedFloorIds = new Set([from?.floorId, to?.floorId].filter(Boolean).map(Number));

  context.setFloors?.((current) => current.map((floor) => {
    const edges = (floor.edges || []).filter((item) => Number(item.id) !== Number(tempEdgeId) && Number(item.id) !== Number(edge.id));
    return touchedFloorIds.has(Number(floor.id)) ? { ...floor, edges: [...edges, edge] } : { ...floor, edges };
  }));
}

function removeLocalEdge(context, edgeId) {
  context.setFloors?.((current) => current.map((floor) => ({
    ...floor,
    edges: (floor.edges || []).filter((edge) => Number(edge.id) !== Number(edgeId)),
  })));
}

function setLocalTracingImages(context, tracingImages) {
  context.setOrganization?.((current) => current ? { ...current, tracingImages } : current);
}

export function createMapForgeAgentService(contextSource) {
  const readContext = () => typeof contextSource === 'function' ? contextSource() : contextSource;
  const context = new Proxy({}, {
    get(_target, property) {
      return readContext()?.[property];
    },
  });

  return {
    getCurrentMap() {
      return {
        organization: context.organization,
        activeBuilding: compactBuilding(context.activeBuilding),
        activeFloor: compactFloor(context.activeFloor),
        buildings: context.buildings.map(compactBuilding),
        floors: context.floors.map(compactFloor),
        totals: {
          buildings: context.buildings.length,
          floors: context.floors.length,
          nodes: getAllNodes(context).length,
          edges: getUniqueEdges(context).length,
        },
      };
    },

    async searchLocations(input) {
      return searchApi.searchLocations({
        query: input.query,
        organizationId: context.organizationId,
        buildingId: input.buildingId || undefined,
        includeBuildings: input.includeBuildings !== false,
      });
    },

    listBuildings(input = {}) {
      const query = normalizeText(input.query);
      return context.buildings
        .filter((building) => !query || normalizeText(`${building.name} ${building.description}`).includes(query))
        .map(compactBuilding);
    },

    listNodes(input = {}) {
      const query = normalizeText(input.query);
      const buildingId = input.building ? resolveBuilding(context, input.building).id : null;
      const floorId = input.floor ? resolveFloor(context, input.floor, input.building).id : null;
      const type = input.type ? String(input.type).toUpperCase() : null;

      return getAllNodes(context)
        .filter((node) => !buildingId || Number(node.buildingId) === Number(buildingId))
        .filter((node) => !floorId || Number(node.floorId) === Number(floorId))
        .filter((node) => !type || node.type === type)
        .filter((node) => !query || normalizeText(`${node.name} ${node.externalIdentifier} ${node.type}`).includes(query))
        .map(compactNode);
    },

    getNode(input) {
      return compactNode(resolveNode(context, input.node));
    },

    getFloor(input) {
      const floor = resolveFloor(context, input.floor, input.building);
      return {
        ...compactFloor(floor),
        nodes: (floor.nodes || []).map((node) => compactNode({
          ...node,
          floorId: floor.id,
          floorNumber: floor.floorNumber,
          buildingId: floor.buildingId,
          buildingName: floor.buildingName,
          floorName: floor.name,
        })),
        edges: floor.edges || [],
      };
    },

    listConnections(input = {}) {
      const node = input.node ? resolveNode(context, input.node) : null;
      const nodeIndex = buildNodeIndex(context.floors);
      return getUniqueEdges(context)
        .filter((edge) => !node || Number(edge.fromNodeId) === Number(node.id) || Number(edge.toNodeId) === Number(node.id))
        .map((edge) => ({
          ...edge,
          from: compactNode(nodeIndex.get(Number(edge.fromNodeId))),
          to: compactNode(nodeIndex.get(Number(edge.toNodeId))),
        }));
    },

    getSpatialSummary(input = {}) {
      const buildings = context.buildings.map((building) => ({
        ...compactBuilding(building),
        bounds: getBuildingBounds(building),
      }));
      const largest = [...buildings].sort((a, b) => b.area - a.area)[0] || null;

      if (!input.referenceBuilding) {
        return { largestBuilding: largest, buildings };
      }

      const reference = resolveBuilding(context, input.referenceBuilding);
      const referenceCenter = getGeometryCentroid(reference.geometry);
      if (!referenceCenter) return { largestBuilding: largest, reference: compactBuilding(reference), relations: [] };

      const relations = context.buildings
        .filter((building) => Number(building.id) !== Number(reference.id))
        .map((building) => {
          const centroid = getGeometryCentroid(building.geometry);
          if (!centroid) return null;
          const dx = centroid.x - referenceCenter.x;
          const dy = centroid.y - referenceCenter.y;
          return {
            building: compactBuilding(building),
            direction: directionFromDelta(dx, dy),
            delta: { x: dx, y: dy },
            distance: Math.hypot(dx, dy),
          };
        })
        .filter(Boolean)
        .sort((a, b) => a.distance - b.distance);

      return { largestBuilding: largest, reference: compactBuilding(reference), relations };
    },

    async findRoute(input) {
      const source = resolveNode(context, input.source);
      const destination = resolveNode(context, input.destination);
      const route = await routeApi.findRoute({
        sourceId: source.id,
        destinationId: destination.id,
        accessibleOnly: Boolean(input.accessibleOnly),
      });
      context.setCurrentRoute?.(route);
      return { source: compactNode(source), destination: compactNode(destination), route };
    },

    async findRouteBetweenBuildings(input) {
      const source = findBuildingEntrances(context, input.sourceBuilding);
      const destination = findBuildingEntrances(context, input.destinationBuilding);
      const result = await routeBetweenNodeCandidates(source.entrances, destination.entrances, Boolean(input.accessibleOnly));
      context.setCurrentRoute?.(result.route);
      return {
        sourceBuilding: compactBuilding(source.building),
        destinationBuilding: compactBuilding(destination.building),
        ...result,
      };
    },

    async createBuilding(input) {
      requireAdmin(context);
      const bounds = canvasBounds(context);
      const width = asNumber(input.width, 800);
      const height = asNumber(input.height, 500);
      const x = clamp(asNumber(input.x, bounds.width / 2 - width / 2), 0, bounds.width - width);
      const y = clamp(asNumber(input.y, bounds.height / 2 - height / 2), 0, bounds.height - height);
      const payload = {
        organizationId: context.organizationId,
        name: input.name,
        description: input.description || '',
        color: input.color || '#25826f',
        geometry: input.geometry || {
          type: 'Polygon',
          coordinates: [[
            [x, y],
            [x + width, y],
            [x + width, y + height],
            [x, y + height],
            [x, y],
          ]],
        },
      };
      const localId = tempId();
      const optimisticBuilding = { ...payload, id: localId, status: 'DRAFT' };
      setLocalBuilding(context, optimisticBuilding);
      context.setActiveBuildingId?.(localId);
      emitMapChanged(context, { action: 'create_building', optimistic: true });
      try {
        const result = await editorApi.createBuilding(payload);
        removeLocalBuilding(context, localId);
        setLocalBuilding(context, result);
        context.setActiveBuildingId?.(result.id);
        context.setSelected?.({ kind: 'building', id: result.id, label: 'Building', item: result });
        emitMapChanged(context, { action: 'create_building', optimistic: false });
        return result;
      } catch (error) {
        removeLocalBuilding(context, localId);
        emitMapChanged(context, { action: 'create_building', reverted: true });
        throw error;
      }
    },

    async updateBuilding(input) {
      requireAdmin(context);
      const building = resolveBuilding(context, input.building);
      const previous = { ...building };
      const optimisticBuilding = { ...building, ...(input.fields || {}) };
      setLocalBuilding(context, optimisticBuilding);
      context.setSelected?.({ kind: 'building', id: optimisticBuilding.id, label: 'Building', item: optimisticBuilding });
      emitMapChanged(context, { action: 'update_building', optimistic: true });
      try {
        const result = await editorApi.updateBuilding(building.id, input.fields || {});
        setLocalBuilding(context, result);
        context.setSelected?.({ kind: 'building', id: result.id, label: 'Building', item: result });
        emitMapChanged(context, { action: 'update_building', optimistic: false });
        return result;
      } catch (error) {
        setLocalBuilding(context, previous);
        context.setSelected?.({ kind: 'building', id: previous.id, label: 'Building', item: previous });
        emitMapChanged(context, { action: 'update_building', reverted: true });
        throw error;
      }
    },

    async deleteBuilding(input, confirm) {
      requireAdmin(context);
      const building = resolveBuilding(context, input.building);
      await confirm({
        title: 'Delete building',
        message: `Delete "${building.name}" and every floor, node, and connection inside it?`,
        confirmLabel: 'Delete building',
      });
      const previousBuilding = { ...building };
      const previousFloors = context.floors.filter((floor) => Number(floor.buildingId) === Number(building.id));
      const removedNodeIds = new Set(previousFloors.flatMap((floor) => (floor.nodes || []).map((node) => Number(node.id))));
      const previousEdges = getUniqueEdges(context).filter((edge) => removedNodeIds.has(Number(edge.fromNodeId)) || removedNodeIds.has(Number(edge.toNodeId)));
      removeLocalBuilding(context, building.id);
      context.setSelected?.(null);
      emitMapChanged(context, { action: 'delete_building', optimistic: true });
      try {
        const result = await editorApi.deleteBuilding(building.id);
        emitMapChanged(context, { action: 'delete_building', optimistic: false });
        return result || {
          deletedBuildingId: building.id,
          deletedFloorIds: previousFloors.map((floor) => floor.id),
          deletedNodeIds: [...removedNodeIds],
          deletedEdgeIds: previousEdges.map((edge) => edge.id),
        };
      } catch (error) {
        setLocalBuilding(context, previousBuilding);
        previousFloors.forEach((floor) => setLocalFloor(context, floor));
        previousEdges.forEach((edge) => setLocalEdge(context, edge));
        emitMapChanged(context, { action: 'delete_building', reverted: true });
        throw error;
      }
    },

    async publishBuilding(input, confirm) {
      requireAdmin(context);
      const building = resolveBuilding(context, input.building);
      await confirm({
        title: 'Publish building',
        message: `Publish "${building.name}" after MapForge validation?`,
        confirmLabel: 'Publish building',
      });
      const previous = { ...building };
      setLocalBuilding(context, { ...building, status: 'PUBLISHED' });
      emitMapChanged(context, { action: 'publish_building', optimistic: true });
      try {
        const result = await editorApi.publishBuilding(building.id);
        setLocalBuilding(context, { ...building, status: 'PUBLISHED' });
        emitMapChanged(context, { action: 'publish_building', optimistic: false });
        return result;
      } catch (error) {
        setLocalBuilding(context, previous);
        emitMapChanged(context, { action: 'publish_building', reverted: true });
        throw error;
      }
    },

    async createFloor(input) {
      requireAdmin(context);
      const building = resolveBuilding(context, input.building);
      const payload = {
        buildingId: building.id,
        name: input.name,
        floorNumber: Number(input.floorNumber),
        geometry: input.geometry || null,
      };
      const localId = tempId();
      const optimisticFloor = { ...payload, id: localId, buildingName: building.name, nodes: [], edges: [] };
      setLocalFloor(context, optimisticFloor);
      context.setActiveBuildingId?.(building.id);
      context.setActiveFloorId?.(localId);
      emitMapChanged(context, { action: 'create_floor', optimistic: true });
      try {
        const result = await editorApi.createFloor(payload);
        removeLocalFloor(context, localId);
        setLocalFloor(context, { ...result, buildingName: building.name, nodes: [], edges: [] });
        context.setActiveFloorId?.(result.id);
        emitMapChanged(context, { action: 'create_floor', optimistic: false });
        return result;
      } catch (error) {
        removeLocalFloor(context, localId);
        emitMapChanged(context, { action: 'create_floor', reverted: true });
        throw error;
      }
    },

    async updateFloor(input) {
      requireAdmin(context);
      const floor = resolveFloor(context, input.floor, input.building);
      const previous = { ...floor };
      const optimisticFloor = { ...floor, ...(input.fields || {}) };
      setLocalFloor(context, optimisticFloor);
      context.setSelected?.({ kind: 'floor', id: optimisticFloor.id, label: 'Floor', item: optimisticFloor });
      emitMapChanged(context, { action: 'update_floor', optimistic: true });
      try {
        const result = await editorApi.updateFloor(floor.id, input.fields || {});
        setLocalFloor(context, { ...floor, ...result });
        emitMapChanged(context, { action: 'update_floor', optimistic: false });
        return result;
      } catch (error) {
        setLocalFloor(context, previous);
        emitMapChanged(context, { action: 'update_floor', reverted: true });
        throw error;
      }
    },

    async deleteFloor(input, confirm) {
      requireAdmin(context);
      const floor = resolveFloor(context, input.floor, input.building);
      await confirm({
        title: 'Delete floor',
        message: `Delete "${floor.name}" and every node and connection on it? This matches the confirmation required in the admin editor.`,
        confirmLabel: 'Delete floor',
      });
      const previous = { ...floor };
      const removedNodeIds = new Set((floor.nodes || []).map((node) => Number(node.id)));
      const previousEdges = getUniqueEdges(context).filter((edge) => removedNodeIds.has(Number(edge.fromNodeId)) || removedNodeIds.has(Number(edge.toNodeId)));
      removeLocalFloor(context, floor.id);
      context.setSelected?.(null);
      emitMapChanged(context, { action: 'delete_floor', optimistic: true });
      try {
        const result = await editorApi.deleteFloor(floor.id);
        emitMapChanged(context, { action: 'delete_floor', optimistic: false });
        return result || {
          deletedFloorId: floor.id,
          deletedNodeIds: [...removedNodeIds],
          deletedEdgeIds: previousEdges.map((edge) => edge.id),
        };
      } catch (error) {
        setLocalFloor(context, previous);
        previousEdges.forEach((edge) => setLocalEdge(context, edge));
        emitMapChanged(context, { action: 'delete_floor', reverted: true });
        throw error;
      }
    },

    async createNode(input) {
      requireAdmin(context);
      const payload = nodePayload(input, context);
      const localId = tempId();
      const optimisticNode = { ...payload, id: localId };
      setLocalNode(context, optimisticNode);
      context.setSelected?.({ kind: 'node', id: localId, label: 'Node', item: optimisticNode, buildingId: payload.buildingId });
      emitMapChanged(context, { action: 'create_node', optimistic: true });
      try {
        const result = await editorApi.createNode(payload);
        const node = withNodeFloorContext(result, context);
        replaceLocalNode(context, localId, node);
        context.setSelected?.({ kind: 'node', id: node.id, label: 'Node', item: node, buildingId: node.buildingId });
        emitMapChanged(context, { action: 'create_node', optimistic: false });
        return result;
      } catch (error) {
        removeLocalNode(context, localId);
        context.setSelected?.(null);
        emitMapChanged(context, { action: 'create_node', reverted: true });
        throw error;
      }
    },

    async updateNode(input) {
      requireAdmin(context);
      const node = resolveNode(context, input.node);
      const bounds = canvasBounds(context);
      const fields = { ...(input.fields || {}) };
      if (Object.prototype.hasOwnProperty.call(fields, 'xCoord')) fields.xCoord = clamp(asNumber(fields.xCoord), 0, bounds.width);
      if (Object.prototype.hasOwnProperty.call(fields, 'yCoord')) fields.yCoord = clamp(asNumber(fields.yCoord), 0, bounds.height);
      const targetFloor = fields.floorId ? context.floors.find((floor) => Number(floor.id) === Number(fields.floorId)) : null;
      const previous = { ...node };
      const optimisticNode = {
        ...node,
        ...fields,
        floorId: fields.floorId || node.floorId,
        floorNumber: targetFloor?.floorNumber ?? node.floorNumber,
        floorName: targetFloor?.name ?? node.floorName,
        buildingId: targetFloor?.buildingId ?? node.buildingId,
        buildingName: targetFloor?.buildingName ?? node.buildingName,
      };
      setLocalNode(context, optimisticNode);
      context.setSelected?.({ kind: 'node', id: optimisticNode.id, label: 'Node', item: optimisticNode, buildingId: optimisticNode.buildingId });
      emitMapChanged(context, { action: 'update_node', optimistic: true });
      try {
        const result = await editorApi.updateNode(node.id, fields);
        const nextNode = withNodeFloorContext({ ...optimisticNode, ...result }, context);
        setLocalNode(context, nextNode);
        context.setSelected?.({ kind: 'node', id: nextNode.id, label: 'Node', item: nextNode, buildingId: nextNode.buildingId });
        emitMapChanged(context, { action: 'update_node', optimistic: false });
        return result;
      } catch (error) {
        setLocalNode(context, previous);
        emitMapChanged(context, { action: 'update_node', reverted: true });
        throw error;
      }
    },

    async deleteNode(input) {
      requireAdmin(context);
      const node = resolveNode(context, input.node);
      const previousNode = { ...node };
      const previousEdges = getUniqueEdges(context).filter((edge) => Number(edge.fromNodeId) === Number(node.id) || Number(edge.toNodeId) === Number(node.id));
      removeLocalNode(context, node.id);
      context.setSelected?.(null);
      emitMapChanged(context, { action: 'delete_node', optimistic: true });
      try {
        const result = await editorApi.deleteNode(node.id);
        emitMapChanged(context, { action: 'delete_node', optimistic: false });
        return result;
      } catch (error) {
        setLocalNode(context, previousNode);
        previousEdges.forEach((edge) => setLocalEdge(context, edge));
        emitMapChanged(context, { action: 'delete_node', reverted: true });
        throw error;
      }
    },

    async connectNodes(input) {
      requireAdmin(context);
      const fromNode = resolveNode(context, input.fromNode);
      const toNode = resolveNode(context, input.toNode);
      const distance = input.distance || Math.hypot(asNumber(fromNode.xCoord) - asNumber(toNode.xCoord), asNumber(fromNode.yCoord) - asNumber(toNode.yCoord));
      const localId = tempId();
      const payload = {
        fromNodeId: fromNode.id,
        toNodeId: toNode.id,
        distance,
        bidirectional: input.bidirectional !== false,
        accessible: input.accessible !== false,
      };
      const optimisticEdge = { ...payload, id: localId };
      setLocalEdge(context, optimisticEdge);
      emitMapChanged(context, { action: 'connect_nodes', optimistic: true });
      try {
        const result = await editorApi.createEdge(payload);
        replaceLocalEdge(context, localId, result);
        emitMapChanged(context, { action: 'connect_nodes', optimistic: false });
        return result;
      } catch (error) {
        removeLocalEdge(context, localId);
        emitMapChanged(context, { action: 'connect_nodes', reverted: true });
        throw error;
      }
    },

    async updateConnection(input) {
      requireAdmin(context);
      const edge = resolveEdge(context, input);
      const previous = { ...edge };
      const optimisticEdge = { ...edge, ...(input.fields || {}) };
      setLocalEdge(context, optimisticEdge);
      emitMapChanged(context, { action: 'update_connection', optimistic: true });
      try {
        const result = await editorApi.updateEdge(edge.id, input.fields || {});
        setLocalEdge(context, result);
        emitMapChanged(context, { action: 'update_connection', optimistic: false });
        return result;
      } catch (error) {
        setLocalEdge(context, previous);
        emitMapChanged(context, { action: 'update_connection', reverted: true });
        throw error;
      }
    },

    async disconnectNodes(input) {
      requireAdmin(context);
      const edge = resolveEdge(context, input);
      const previous = { ...edge };
      removeLocalEdge(context, edge.id);
      emitMapChanged(context, { action: 'disconnect_nodes', optimistic: true });
      try {
        const result = await editorApi.deleteEdge(edge.id);
        emitMapChanged(context, { action: 'disconnect_nodes', optimistic: false });
        return result || { deletedEdgeId: edge.id };
      } catch (error) {
        setLocalEdge(context, previous);
        emitMapChanged(context, { action: 'disconnect_nodes', reverted: true });
        throw error;
      }
    },

    async publishMap(input, confirm) {
      requireAdmin(context);
      const organizationId = input.organizationId || context.organizationId;
      await confirm({
        title: 'Publish map',
        message: 'Publish this organization map and make the current validated buildings visible to viewers?',
        confirmLabel: 'Publish map',
      });
      try {
        const result = await organizationApi.publishOrganization(organizationId);
        context.setBuildings?.((current) => current.map((building) => ({ ...building, status: 'PUBLISHED' })));
        emitMapChanged(context, { action: 'publish_map' });
        return result;
      } catch (error) {
        emitMapChanged(context, { action: 'publish_map', failed: true });
        throw error;
      }
    },

    listReferenceImages() {
      requireAdmin(context);
      return context.organization?.tracingImages || [];
    },

    async updateReferenceImage(input) {
      requireAdmin(context);
      const tracingImages = context.organization?.tracingImages || [];
      const index = tracingImages.findIndex((image) => String(image.id) === String(input.imageId));
      if (index === -1) throw new Error(`Reference image "${input.imageId}" was not found.`);

      const bounds = canvasBounds(context);
      const nextImages = tracingImages.map((image, imageIndex) => {
        if (imageIndex !== index) return image;
        const next = { ...image, ...(input.fields || {}) };
        if (Object.prototype.hasOwnProperty.call(next, 'x')) next.x = clamp(asNumber(next.x), 0, bounds.width);
        if (Object.prototype.hasOwnProperty.call(next, 'y')) next.y = clamp(asNumber(next.y), 0, bounds.height);
        if (Object.prototype.hasOwnProperty.call(next, 'width')) next.width = Math.max(1, asNumber(next.width, image.width || 1));
        if (Object.prototype.hasOwnProperty.call(next, 'height')) next.height = Math.max(1, asNumber(next.height, image.height || 1));
        if (Object.prototype.hasOwnProperty.call(next, 'opacity')) next.opacity = clamp(asNumber(next.opacity, image.opacity ?? 0.7), 0, 1);
        return next;
      });

      const previousImages = tracingImages;
      setLocalTracingImages(context, nextImages);
      emitMapChanged(context, { action: 'update_reference_image', optimistic: true });
      try {
        const result = await editorApi.updateOrganization(context.organizationId, { tracingImages: nextImages });
        setLocalTracingImages(context, result.tracingImages || nextImages);
        emitMapChanged(context, { action: 'update_reference_image', optimistic: false });
        return result;
      } catch (error) {
        setLocalTracingImages(context, previousImages);
        emitMapChanged(context, { action: 'update_reference_image', reverted: true });
        throw error;
      }
    },

    async deleteReferenceImage(input, confirm) {
      requireAdmin(context);
      const tracingImages = context.organization?.tracingImages || [];
      const target = tracingImages.find((image) => String(image.id) === String(input.imageId));
      if (!target) {
        throw new Error(`Reference image "${input.imageId}" was not found.`);
      }
      await confirm({
        title: 'Delete reference image',
        message: `Remove the blueprint "${target.name || target.imagePath || target.id}" from this organization?`,
        confirmLabel: 'Delete image',
      });
      const nextImages = tracingImages.filter((image) => String(image.id) !== String(input.imageId));
      setLocalTracingImages(context, nextImages);
      emitMapChanged(context, { action: 'delete_reference_image', optimistic: true });
      try {
        const result = await editorApi.updateOrganization(context.organizationId, { tracingImages: nextImages });
        setLocalTracingImages(context, result.tracingImages || nextImages);
        emitMapChanged(context, { action: 'delete_reference_image', optimistic: false });
        return result;
      } catch (error) {
        setLocalTracingImages(context, tracingImages);
        emitMapChanged(context, { action: 'delete_reference_image', reverted: true });
        throw error;
      }
    },

    async saveMap() {
      return {
        saved: true,
        message: 'Map changes are already persisted by the same application APIs used by the editor.',
      };
    },
  };
}
