import { createContext, useCallback, useMemo, useState } from 'react';
import * as mapApi from '../api/mapApi';
import * as organizationApi from '../api/organizationApi';
import { getActiveFloorNumber, getFloorsForLevel, normalizeMapPayload } from '../domain/mapModel';

export const MapContext = createContext(null);

export function MapProvider({ children }) {
  const [organization, setOrganization] = useState(null);
  const [buildings, setBuildings] = useState([]);
  const [floors, setFloors] = useState([]);
  const [activeBuildingId, setActiveBuildingId] = useState(null);
  const [activeFloorId, setActiveFloorId] = useState(null);
  const [selectedNodeId, setSelectedNodeId] = useState(null);
  const [currentRoute, setCurrentRoute] = useState(null);
  const [focusedNodeId, setFocusedNodeId] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const loadOrganizationMap = useCallback(async (organizationId) => {
    setLoading(true);
    setError(null);
    setCurrentRoute(null);
    setSelectedNodeId(null);
    setFocusedNodeId(null);

    try {
      const [organizationPayload, organizationMap] = await Promise.all([
        organizationApi.getOrganization(organizationId),
        mapApi.getOrganizationMap(organizationId),
      ]);

      const normalized = normalizeMapPayload(organizationMap);
      const graphFloors = normalized.floors;
      const graphBuildings = normalized.buildings;
      const firstBuildingWithFloor = graphBuildings.find((building) =>
        graphFloors.some((floor) => Number(floor.buildingId) === Number(building.id))
      );
      const initialBuilding = firstBuildingWithFloor || graphBuildings[0] || null;
      const initialFloor = initialBuilding
        ? graphFloors.find((floor) => Number(floor.buildingId) === Number(initialBuilding.id))
        : null;

      setOrganization(organizationPayload);
      setBuildings(graphBuildings);
      setFloors(graphFloors);
      setActiveBuildingId((current) => {
        if (current && graphBuildings.some((building) => Number(building.id) === Number(current))) {
          return current;
        }
        return initialBuilding?.id || null;
      });
      setActiveFloorId((current) => {
        if (current && graphFloors.some((floor) => Number(floor.id) === Number(current))) {
          return current;
        }
        return initialFloor?.id || null;
      });
    } catch (apiError) {
      setError(apiError);
      setOrganization(null);
      setBuildings([]);
      setFloors([]);
      setActiveBuildingId(null);
      setActiveFloorId(null);
      setFocusedNodeId(null);
    } finally {
      setLoading(false);
    }
  }, []);

  const activeBuilding = useMemo(
    () => buildings.find((building) => Number(building.id) === Number(activeBuildingId)) || null,
    [activeBuildingId, buildings]
  );

  const activeFloor = useMemo(
    () => floors.find((floor) => Number(floor.id) === Number(activeFloorId)) || null,
    [activeFloorId, floors]
  );

  const activeFloorNumber = useMemo(
    () => getActiveFloorNumber(floors, activeFloorId),
    [activeFloorId, floors]
  );

  const visibleFloors = useMemo(
    () => getFloorsForLevel(floors, activeFloorNumber),
    [activeFloorNumber, floors]
  );

  const selectedNode = useMemo(() => {
    if (!selectedNodeId) return null;
    for (const floor of floors) {
      const node = (floor.nodes || []).find((candidate) => Number(candidate.id) === Number(selectedNodeId));
      if (node) return { ...node, floorId: floor.id };
    }
    return null;
  }, [floors, selectedNodeId]);

  const value = useMemo(
    () => ({
      organization,
      buildings,
      floors,
      activeBuilding,
      activeBuildingId,
      activeFloor,
      activeFloorId,
      activeFloorNumber,
      visibleFloors,
      selectedNode,
      selectedNodeId,
      currentRoute,
      focusedNodeId,
      loading,
      error,
      loadOrganizationMap,
      setActiveBuildingId,
      setActiveFloorId,
      setSelectedNodeId,
      setCurrentRoute,
      setFocusedNodeId,
    }),
    [
      activeBuilding,
      activeBuildingId,
      activeFloor,
      activeFloorId,
      activeFloorNumber,
      buildings,
      currentRoute,
      error,
      focusedNodeId,
      floors,
      loadOrganizationMap,
      loading,
      organization,
      selectedNode,
      selectedNodeId,
      visibleFloors,
    ]
  );

  return <MapContext.Provider value={value}>{children}</MapContext.Provider>;
}
