import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import AppTopbar from '../components/common/AppTopbar';
import StatusMessage from '../components/common/StatusMessage';
import RoutePlanner, { LocationSearchBox } from '../components/viewer/RoutePlanner';
import ViewerCanvas from '../components/viewer/ViewerCanvas';
import ViewerSidebar from '../components/viewer/ViewerSidebar';
import { MapProvider } from '../context/MapContext';
import { getFloorForNode } from '../domain/mapModel';
import useMap from '../hooks/useMap';

function PublicViewerContent() {
  const { organizationId } = useParams();
  const {
    organization,
    buildings,
    floors,
    activeBuilding,
    activeBuildingId,
    activeFloor,
    activeFloorNumber,
    activeFloorId,
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
  } = useMap();
  const [source, setSource] = useState(null);
  const [destination, setDestination] = useState(null);

  useEffect(() => {
    loadOrganizationMap(organizationId);
  }, [loadOrganizationMap, organizationId]);

  function handleSelectBuilding(buildingId) {
    setActiveBuildingId(buildingId);
    setSelectedNodeId(null);
  }

  function focusLocation(location) {
    if (!location?.id) return;
    const floor = getFloorForNode(floors, location.id);
    if (floor) {
      setActiveBuildingId(floor.buildingId);
      setActiveFloorId(floor.id);
    } else if (location.floorId) {
      setActiveFloorId(location.floorId);
      if (location.buildingId) setActiveBuildingId(location.buildingId);
    }
    setSelectedNodeId(location.id);
    setFocusedNodeId(location.id);
  }

  function handleSegmentSelected(segment) {
    const firstNode = segment.nodes[0];
    if (!firstNode) return;
    focusLocation(firstNode);
  }

  return (
    <div className="appFrame viewerFrame">
      <AppTopbar />
      <main className="viewerPage">
        <section className="viewerHeader">
          <div>
            <p className="eyebrow">Public viewer</p>
            <h1>{organization?.name || 'Loading map'}</h1>
            <p>
              {activeBuilding
                ? `${activeBuilding.name} highlighted / Level ${activeFloorNumber ?? '-'}`
                : 'Published map browser'}
            </p>
          </div>
          <div className="viewerHeaderSearch">
            <LocationSearchBox
              label="Search this map"
              organizationId={organizationId}
              selected={selectedNode}
              onSelect={(node) => {
                if (node) {
                  focusLocation(node);
                } else {
                  setSelectedNodeId(null);
                }
              }}
              onLocationSelected={focusLocation}
            />
          </div>
          {selectedNode ? (
            <div className="selectedSummary">
              <small>Selected location</small>
              <strong>{selectedNode.externalIdentifier || selectedNode.id}</strong>
              <span>{selectedNode.name}</span>
              <div className="selectedActions">
                <button className="button buttonGhost" type="button" onClick={() => setSource(selectedNode)}>
                  Set as origin
                </button>
                <button className="button buttonGhost" type="button" onClick={() => setDestination(selectedNode)}>
                  Set as destination
                </button>
              </div>
            </div>
          ) : null}
        </section>

        {error ? (
          <StatusMessage title={error.code || 'Map failed to load'} tone="error">
            {error.message}
          </StatusMessage>
        ) : null}

        {loading ? (
          <StatusMessage title="Loading map">Fetching the published building and floor graph.</StatusMessage>
        ) : (
          <section className="viewerWorkspace">
            <ViewerSidebar
              buildings={buildings}
              floors={floors}
              activeBuildingId={activeBuildingId}
              activeFloorId={activeFloorId}
              onSelectBuilding={handleSelectBuilding}
              onSelectFloor={(floorId) => {
                setActiveFloorId(floorId);
                setSelectedNodeId(null);
              }}
            />
            <ViewerCanvas
              organization={organization}
              buildings={buildings}
              floors={floors}
              activeFloor={activeFloor}
              visibleFloors={visibleFloors}
              activeFloorNumber={activeFloorNumber}
              activeBuildingId={activeBuildingId}
              selectedNodeId={selectedNodeId}
              focusedNodeId={focusedNodeId}
              route={currentRoute}
              onSelectNode={setSelectedNodeId}
              onSelectBuilding={(buildingId) => {
                handleSelectBuilding(buildingId);
              }}
              onFocusHandled={() => setFocusedNodeId(null)}
            />
            <RoutePlanner
              organizationId={organizationId}
              floors={floors}
              currentRoute={currentRoute}
              setCurrentRoute={setCurrentRoute}
              onLocationSelected={focusLocation}
              onRouteSegmentSelected={handleSegmentSelected}
              source={source}
              setSource={setSource}
              destination={destination}
              setDestination={setDestination}
            />
          </section>
        )}
      </main>
    </div>
  );
}

export default function PublicViewerPage() {
  return (
    <MapProvider>
      <PublicViewerContent />
    </MapProvider>
  );
}
