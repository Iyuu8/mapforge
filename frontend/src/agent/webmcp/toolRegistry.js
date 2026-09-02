import { editSchemas, readSchemas } from './schemas';

function ok(data) {
  return { ok: true, data };
}

function fail(error) {
  return {
    ok: false,
    error: error?.message || 'The WebMCP tool failed.',
  };
}

function emitToolActivity(type, detail) {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(new CustomEvent(`mapforge:webmcp:${type}`, { detail }));
}

function getModelContext() {
  if (typeof document !== 'undefined' && document.modelContext?.registerTool) return document.modelContext;
  if (typeof navigator !== 'undefined' && navigator.modelContext?.registerTool) return navigator.modelContext;
  return null;
}

function rememberDebug(entry) {
  if (typeof window === 'undefined') return;
  window.__mapforgeWebMcpDebug = {
    ...(window.__mapforgeWebMcpDebug || {}),
    lastUpdatedAt: new Date().toISOString(),
    ...entry,
  };
}

function throwIfAborted(signal) {
  if (!signal?.aborted) return;
  throw signal.reason || new DOMException('WebMCP registration was cancelled.', 'AbortError');
}

async function waitForModelContext(signal) {
  const startedAt = Date.now();
  while (Date.now() - startedAt < 500) {
    throwIfAborted(signal);
    const modelContext = getModelContext();
    if (modelContext) return modelContext;
    await new Promise((resolve) => window.setTimeout(resolve, 100));
  }
  return getModelContext();
}

function replaceActiveRegistration(controller, toolNames) {
  if (typeof window === 'undefined') return;
  window.__mapforgeWebMcpRegistration?.controller?.abort();
  window.__mapforgeWebMcpRegistration = { controller, toolNames };
}

function clearActiveRegistration(controller) {
  if (typeof window === 'undefined') return;
  if (window.__mapforgeWebMcpRegistration?.controller === controller) {
    delete window.__mapforgeWebMcpRegistration;
  }
}

function createTool(name, title, description, inputSchema, execute, readOnlyHint) {
  return {
    name,
    title,
    description,
    inputSchema,
    annotations: { readOnlyHint },
    execute: async (input, options) => {
      const operationId = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
      emitToolActivity('tool-start', { operationId, name, title });
      try {
        options?.signal?.throwIfAborted?.();
        const data = await execute(input || {}, options || {});
        emitToolActivity('tool-finish', { operationId, name, title });
        return ok(data);
      } catch (error) {
        emitToolActivity('tool-error', {
          operationId,
          name,
          title,
          message: error?.message || 'The WebMCP tool failed.',
        });
        return fail(error);
      }
    },
  };
}

function readTools(service) {
  return [
    createTool(
      'mapforge.get_current_map',
      'Get Current Map',
      'Return a compact summary of the currently open MapForge organization, including active building, active floor, totals, buildings, and floors.',
      readSchemas.get_current_map,
      () => service.getCurrentMap(),
      true
    ),
    createTool(
      'mapforge.search_locations',
      'Search Locations',
      'Search the current map for buildings and navigable nodes. Use this before editing or routing when a user gives a name instead of an ID.',
      readSchemas.search_locations,
      (input) => service.searchLocations(input),
      true
    ),
    createTool(
      'mapforge.list_buildings',
      'List Buildings',
      'List buildings on the current map, optionally filtered by text. Returns deterministic geometry summaries such as centroid and area.',
      readSchemas.list_buildings,
      (input) => service.listBuildings(input),
      true
    ),
    createTool(
      'mapforge.list_nodes',
      'List Nodes',
      'List navigable nodes on the current map, optionally filtered by building, floor, type, or search text.',
      readSchemas.list_nodes,
      (input) => service.listNodes(input),
      true
    ),
    createTool(
      'mapforge.get_node',
      'Get Node',
      'Return one navigable node by ID, identifier, or name, including its floor/building context and canvas coordinates. Use this to find a reference point (e.g. an existing node or a building entrance) before placing or connecting a new node relative to it.',
      readSchemas.get_node,
      (input) => service.getNode(input),
      true
    ),
    createTool(
      'mapforge.get_floor',
      'Get Floor',
      'Return one floor by ID, name, or floor number, including its nodes and connections.',
      readSchemas.get_floor,
      (input) => service.getFloor(input),
      true
    ),
    createTool(
      'mapforge.list_connections',
      'List Connections',
      'List map graph connections, optionally limited to a specific node.',
      readSchemas.list_connections,
      (input) => service.listConnections(input),
      true
    ),
    createTool(
      'mapforge.get_spatial_summary',
      'Get Spatial Summary',
      'Analyze building geometry on the current canvas. Use this for questions such as biggest building, nearby buildings, or which buildings are north/south/east/west of another building.',
      readSchemas.get_spatial_summary,
      (input) => service.getSpatialSummary(input),
      true
    ),
    createTool(
      'mapforge.find_route',
      'Find Route',
      'Find the deterministic shortest route between two navigable nodes by ID, identifier, or name, and update the visible route highlight in the page.',
      readSchemas.find_route,
      (input) => service.findRoute(input),
      true
    ),
    createTool(
      'mapforge.find_route_between_buildings',
      'Find Route Between Buildings',
      'Find the shortest route between two buildings by trying their entrance, gate, and exit nodes. Updates the visible route highlight in the page.',
      readSchemas.find_route_between_buildings,
      (input) => service.findRouteBetweenBuildings(input),
      true
    ),
  ];
}

function editTools(service, confirm) {
  return [
    createTool(
      'mapforge.create_building',
      'Create Building',
      'Create a building in the current organization using the same backend endpoint as the admin editor. Requires an administrator session.',
      editSchemas.create_building,
      (input) => service.createBuilding(input),
      false
    ),
    createTool(
      'mapforge.update_building',
      'Update Building',
      'Update editable building fields using the same backend endpoint as the admin editor. Requires an administrator session.',
      editSchemas.update_building,
      (input) => service.updateBuilding(input),
      false
    ),
    createTool(
      'mapforge.delete_building',
      'Delete Building',
      'Request deletion of a building. This cascades automatically to all dependent floors, nodes, and connected edges; do not delete those children one by one. Requires administrator session and explicit human confirmation in the page.',
      editSchemas.delete_building,
      (input) => service.deleteBuilding(input, confirm),
      false
    ),
    createTool(
      'mapforge.publish_building',
      'Publish Building',
      'Publish one building after MapForge validation. Requires administrator session and explicit human confirmation in the page.',
      editSchemas.publish_building,
      (input) => service.publishBuilding(input, confirm),
      false
    ),
    createTool(
      'mapforge.create_floor',
      'Create Floor',
      'Create a floor in an existing building using the same backend endpoint as the admin editor. Requires an administrator session.',
      editSchemas.create_floor,
      (input) => service.createFloor(input),
      false
    ),
    createTool(
      'mapforge.update_floor',
      'Update Floor',
      'Update editable floor fields using the same backend endpoint as the admin editor. Requires an administrator session.',
      editSchemas.update_floor,
      (input) => service.updateFloor(input),
      false
    ),
    createTool(
      'mapforge.delete_floor',
      'Delete Floor',
      'Delete a floor. This cascades automatically to all dependent nodes and connected edges; do not delete those children one by one. Requires administrator session and explicit human confirmation in the page, matching the confirmation the admin editor UI requires for this same action.',
      editSchemas.delete_floor,
      (input) => service.deleteFloor(input, confirm),
      false
    ),
    createTool(
      'mapforge.create_node',
      'Create Node',
      'Create a navigable node on a floor using the same backend endpoint as the admin editor. Coordinates are clipped to the organization canvas. To place a node relative to another node or a building, first call get_node/get_spatial_summary/list_nodes to read the reference coordinates, then supply the computed xCoord/yCoord here. Requires an administrator session.',
      editSchemas.create_node,
      (input) => service.createNode(input),
      false
    ),
    createTool(
      'mapforge.update_node',
      'Update Node',
      'Update editable node fields using the same backend endpoint as the admin editor. Requires an administrator session.',
      editSchemas.update_node,
      (input) => service.updateNode(input),
      false
    ),
    createTool(
      'mapforge.delete_node',
      'Delete Node',
      'Delete a node and its connected edges using the same backend endpoint as the admin editor. Resolve nodes by visible name or external identifier first; database IDs are only a fallback. Requires an administrator session.',
      editSchemas.delete_node,
      (input) => service.deleteNode(input),
      false
    ),
    createTool(
      'mapforge.connect_nodes',
      'Connect Nodes',
      'Create a navigable edge between two nodes using the same backend endpoint as the admin editor. If distance is omitted, geometric distance is used. To connect a node to a building through its entrance, first use list_nodes filtered by that building and type ENTRANCE (or GATE/EXIT) to find the entrance node, then connect to it. Requires an administrator session.',
      editSchemas.connect_nodes,
      (input) => service.connectNodes(input),
      false
    ),
    createTool(
      'mapforge.update_connection',
      'Update Connection',
      'Update an existing map connection by edge ID or endpoint pair. Requires an administrator session.',
      editSchemas.update_connection,
      (input) => service.updateConnection(input),
      false
    ),
    createTool(
      'mapforge.disconnect_nodes',
      'Disconnect Nodes',
      'Delete a map connection by edge ID or endpoint pair. Requires an administrator session.',
      editSchemas.disconnect_nodes,
      (input) => service.disconnectNodes(input),
      false
    ),
    createTool(
      'mapforge.publish_map',
      'Publish Map',
      'Publish the current organization map using MapForge validation. Requires administrator session and explicit human confirmation in the page.',
      editSchemas.publish_map,
      (input) => service.publishMap(input, confirm),
      false
    ),
    createTool(
      'mapforge.list_reference_images',
      'List Reference Images',
      'List blueprint/reference images attached to the current organization. Requires an administrator session because draft blueprint metadata is editor-only.',
      editSchemas.list_reference_images,
      () => service.listReferenceImages(),
      true
    ),
    createTool(
      'mapforge.update_reference_image',
      'Update Reference Image',
      'Update an existing blueprint/reference image position, size, opacity, rotation, z-index, visibility, lock state, or name using the organization update endpoint. Requires an administrator session.',
      editSchemas.update_reference_image,
      (input) => service.updateReferenceImage(input),
      false
    ),
    createTool(
      'mapforge.delete_reference_image',
      'Delete Reference Image',
      'Remove an existing blueprint/reference image from the current organization using the organization update endpoint. Requires administrator session and explicit human confirmation in the page, matching the confirmation the admin editor UI requires for this same action.',
      editSchemas.delete_reference_image,
      (input) => service.deleteReferenceImage(input, confirm),
      false
    ),
    createTool(
      'mapforge.save_map',
      'Save Map',
      'Report save state for MapForge. MapForge persists editor changes through each operation, so this is a deterministic synchronization marker.',
      editSchemas.save_map,
      () => service.saveMap(),
      false
    ),
  ];
}

export async function registerMapForgeWebMcpTools({ service, canEdit, confirm, lifecycleSignal }) {
  const modelContext = await waitForModelContext(lifecycleSignal);
  if (!modelContext) {
    rememberDebug({ supported: false, registered: [], failures: [] });
    return {
      supported: false,
      unregister() {},
    };
  }
  throwIfAborted(lifecycleSignal);

  const controller = new AbortController();
  const tools = canEdit ? [...readTools(service), ...editTools(service, confirm)] : readTools(service);
  const registered = [];
  const failures = [];
  replaceActiveRegistration(controller, tools.map((tool) => tool.name));

  for (const tool of tools) {
    try {
      throwIfAborted(lifecycleSignal);
      await modelContext.registerTool(tool, { signal: controller.signal });
      registered.push(tool.name);
    } catch (error) {
      failures.push({ tool: tool.name, message: error?.message || String(error) });
    }
  }

  rememberDebug({ supported: true, registered, failures });

  return {
    supported: true,
    toolNames: registered,
    failures,
    unregister() {
      controller.abort();
      clearActiveRegistration(controller);
    },
  };
}
