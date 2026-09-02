const ID_OR_NAME = {
  type: 'string',
  description: 'Visible MapForge name, partial name, or external identifier. Database IDs are a fallback only when no visible match exists.',
};

const COORDINATE = {
  type: 'number',
  description: 'Canvas coordinate in MapForge map units.',
};

const GEOMETRY = {
  type: 'object',
  description: 'GeoJSON-like geometry object already used by MapForge.',
};

export const readSchemas = {
  get_current_map: {
    type: 'object',
    properties: {},
  },
  search_locations: {
    type: 'object',
    properties: {
      query: { type: 'string', description: 'Text to search for in node names, node identifiers, building names, and building descriptions.' },
      includeBuildings: { type: 'boolean', default: true },
      buildingId: { type: 'number', description: 'Optional building scope.' },
    },
    required: ['query'],
  },
  list_buildings: {
    type: 'object',
    properties: {
      query: { type: 'string', description: 'Optional building name or description filter.' },
    },
  },
  list_nodes: {
    type: 'object',
    properties: {
      query: { type: 'string', description: 'Optional node name or identifier filter.' },
      building: ID_OR_NAME,
      floor: ID_OR_NAME,
      type: { type: 'string', description: 'Optional MapForge node type such as ROOM, ENTRANCE, STAIR, or CAFETERIA.' },
    },
  },
  get_node: {
    type: 'object',
    properties: {
      node: ID_OR_NAME,
    },
    required: ['node'],
  },
  get_floor: {
    type: 'object',
    properties: {
      building: ID_OR_NAME,
      floor: ID_OR_NAME,
    },
    required: ['floor'],
  },
  list_connections: {
    type: 'object',
    properties: {
      node: ID_OR_NAME,
    },
  },
  get_spatial_summary: {
    type: 'object',
    properties: {
      referenceBuilding: ID_OR_NAME,
    },
  },
  find_route: {
    type: 'object',
    properties: {
      source: ID_OR_NAME,
      destination: ID_OR_NAME,
      accessibleOnly: { type: 'boolean', default: false },
    },
    required: ['source', 'destination'],
  },
  find_route_between_buildings: {
    type: 'object',
    properties: {
      sourceBuilding: ID_OR_NAME,
      destinationBuilding: ID_OR_NAME,
      accessibleOnly: { type: 'boolean', default: false },
    },
    required: ['sourceBuilding', 'destinationBuilding'],
  },
};

export const editSchemas = {
  create_building: {
    type: 'object',
    properties: {
      name: { type: 'string' },
      description: { type: 'string' },
      color: { type: 'string', pattern: '^#[0-9a-fA-F]{6}$' },
      x: COORDINATE,
      y: COORDINATE,
      width: { type: 'number' },
      height: { type: 'number' },
      geometry: GEOMETRY,
    },
    required: ['name'],
  },
  update_building: {
    type: 'object',
    properties: {
      building: ID_OR_NAME,
      fields: { type: 'object', description: 'Subset of editable building fields: name, description, color, geometry, or status.' },
    },
    required: ['building', 'fields'],
  },
  delete_building: {
    type: 'object',
    properties: {
      building: ID_OR_NAME,
    },
    required: ['building'],
  },
  publish_building: {
    type: 'object',
    properties: {
      building: ID_OR_NAME,
    },
    required: ['building'],
  },
  create_floor: {
    type: 'object',
    properties: {
      building: ID_OR_NAME,
      name: { type: 'string' },
      floorNumber: { type: 'number' },
      geometry: GEOMETRY,
    },
    required: ['building', 'name', 'floorNumber'],
  },
  update_floor: {
    type: 'object',
    properties: {
      building: ID_OR_NAME,
      floor: ID_OR_NAME,
      fields: { type: 'object', description: 'Subset of editable floor fields: name, floorNumber, geometry.' },
    },
    required: ['floor', 'fields'],
  },
  delete_floor: {
    type: 'object',
    properties: {
      building: ID_OR_NAME,
      floor: ID_OR_NAME,
    },
    required: ['floor'],
  },
  create_node: {
    type: 'object',
    properties: {
      building: ID_OR_NAME,
      floor: ID_OR_NAME,
      name: { type: 'string' },
      identifier: { type: 'string' },
      externalIdentifier: { type: 'string' },
      type: { type: 'string' },
      xCoord: COORDINATE,
      yCoord: COORDINATE,
      metadata: { type: 'object' },
      geometry: GEOMETRY,
    },
    required: ['floor', 'type', 'xCoord', 'yCoord'],
  },
  update_node: {
    type: 'object',
    properties: {
      node: ID_OR_NAME,
      fields: { type: 'object', description: 'Subset of editable node fields: name, externalIdentifier, type, floorId, xCoord, yCoord, metadata, geometry.' },
    },
    required: ['node', 'fields'],
  },
  delete_node: {
    type: 'object',
    properties: {
      node: ID_OR_NAME,
    },
    required: ['node'],
  },
  connect_nodes: {
    type: 'object',
    properties: {
      fromNode: ID_OR_NAME,
      toNode: ID_OR_NAME,
      distance: { type: 'number', description: 'Positive route distance. If omitted, geometric distance is used.' },
      bidirectional: { type: 'boolean', default: true },
      accessible: { type: 'boolean', default: true },
    },
    required: ['fromNode', 'toNode'],
  },
  update_connection: {
    type: 'object',
    properties: {
      edgeId: { type: 'number' },
      fromNode: ID_OR_NAME,
      toNode: ID_OR_NAME,
      fields: { type: 'object', description: 'Subset of editable edge fields: distance, bidirectional.' },
    },
    required: ['fields'],
  },
  disconnect_nodes: {
    type: 'object',
    properties: {
      edgeId: { type: 'number' },
      fromNode: ID_OR_NAME,
      toNode: ID_OR_NAME,
    },
  },
  publish_map: {
    type: 'object',
    properties: {
      organizationId: { type: 'number' },
    },
  },
  list_reference_images: {
    type: 'object',
    properties: {},
  },
  update_reference_image: {
    type: 'object',
    properties: {
      imageId: { type: 'string' },
      fields: {
        type: 'object',
        description: 'Subset of editable blueprint fields: x, y, width, height, rotation, opacity, zIndex, visible, locked, name.',
      },
    },
    required: ['imageId', 'fields'],
  },
  delete_reference_image: {
    type: 'object',
    properties: {
      imageId: { type: 'string' },
    },
    required: ['imageId'],
  },
  save_map: {
    type: 'object',
    properties: {},
  },
};
