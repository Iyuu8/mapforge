import {
  buildNodesById,
  geometryToKonvaPolygons,
  getGeometryCentroid,
  getGeometryPoints,
  getMapContentBounds,
  getVisibleEdges,
  nodeGeometryToLocalPoints,
} from './mapModel';

test('parses GeoJSON polygon geometry into map coordinate points', () => {
  const geometry = {
    type: 'Polygon',
    coordinates: [[[200, 0], [300, 0], [300, 100], [200, 80], [200, 0]]],
  };

  expect(getGeometryPoints(geometry)).toEqual([
    { x: 200, y: 0 },
    { x: 300, y: 0 },
    { x: 300, y: 100 },
    { x: 200, y: 80 },
    { x: 200, y: 0 },
  ]);
});

test('converts backend building geometry into literal Konva polygon points', () => {
  const geometry = {
    type: 'Polygon',
    coordinates: [[[200, 0], [300, 0], [300, 100], [200, 80], [200, 0]]],
  };

  expect(geometryToKonvaPolygons(geometry)).toEqual([
    [200, 0, 300, 0, 300, 100, 200, 80, 200, 0],
  ]);
  expect(getGeometryCentroid(geometry)).toEqual({ x: 250, y: 45 });
});

test('accepts stringified geometry payloads without losing polygon shape', () => {
  const geometry = '{"type":"Polygon","coordinates":[[[200,0],[300,0],[300,100],[200,80],[200,0]]]}';

  expect(geometryToKonvaPolygons(geometry)).toEqual([
    [200, 0, 300, 0, 300, 100, 200, 80, 200, 0],
  ]);
});

test('keeps node dot coordinates separate from optional node geometry border', () => {
  const node = {
    xCoord: 250,
    yCoord: 50,
    geometry: {
      type: 'Polygon',
      coordinates: [[[230, 30], [270, 30], [270, 70], [230, 70], [230, 30]]],
    },
  };

  expect(nodeGeometryToLocalPoints(node)).toEqual([
    -20, -20,
    20, -20,
    20, 20,
    -20, 20,
    -20, -20,
  ]);
});

test('visible floor level can include nodes and edges from several buildings', () => {
  const floors = [
    {
      id: 10,
      buildingId: 2,
      floorNumber: 0,
      nodes: [{ id: 1, xCoord: 0, yCoord: 0 }, { id: 2, xCoord: 50, yCoord: 0 }],
      edges: [{ id: 100, fromNodeId: 1, toNodeId: 2 }],
    },
    {
      id: 11,
      buildingId: 3,
      floorNumber: 0,
      nodes: [{ id: 3, xCoord: 200, yCoord: 0 }, { id: 4, xCoord: 250, yCoord: 0 }],
      edges: [{ id: 101, fromNodeId: 3, toNodeId: 4 }],
    },
  ];

  expect([...buildNodesById(floors).keys()]).toEqual([1, 2, 3, 4]);
  expect(getVisibleEdges(floors).map((edge) => edge.id)).toEqual([100, 101]);
});

test('content bounds are based on real map objects, not only full canvas size', () => {
  const bounds = getMapContentBounds({
    organization: { canvasWidth: 8000, canvasHeight: 6000 },
    buildings: [{
      geometry: {
        type: 'Polygon',
        coordinates: [[[200, 0], [300, 0], [300, 100], [200, 80], [200, 0]]],
      },
    }],
    floors: [],
  });

  expect(bounds.minX).toBeLessThan(200);
  expect(bounds.maxX).toBeGreaterThan(300);
  expect(bounds.maxX).toBeLessThan(8000);
});
