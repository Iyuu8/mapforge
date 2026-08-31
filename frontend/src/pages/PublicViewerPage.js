import { useEffect, useMemo, useState } from 'react';
import { useParams } from 'react-router-dom';
import { LocateFixed, MousePointer2, Route } from 'lucide-react';
import * as routeApi from '../api/routeApi';
import AppTopbar from '../components/common/AppTopbar';
import StatusMessage from '../components/common/StatusMessage';
import { LocationSearchBox } from '../components/viewer/RoutePlanner';
import ViewerCanvas from '../components/viewer/ViewerCanvas';
import ViewerSidebar from '../components/viewer/ViewerSidebar';
import { MapProvider } from '../context/MapContext';
import { NODE_TYPE_LABELS, formatRoutePath, getFloorForNode } from '../domain/mapModel';
import useMap from '../hooks/useMap';

function ViewerDetailsPanel({ selectedNode, activeBuilding, activeFloor, floors }) {
  const nodeFloor = selectedNode ? getFloorForNode(floors, selectedNode.id) : null;

  return (
    <aside className="viewerDetailsPanel">
      <div className="panelHeader">
        <MousePointer2 size={18} />
        <h2>Properties</h2>
      </div>
      {selectedNode ? (
        <div className="propertyList">
          <span>Name</span>
          <strong>{selectedNode.name || 'Unnamed node'}</strong>
          <span>Identifier</span>
          <strong>{selectedNode.externalIdentifier || selectedNode.identifier || selectedNode.id}</strong>
          <span>Type</span>
          <strong>{NODE_TYPE_LABELS[selectedNode.type] || selectedNode.type || 'Node'}</strong>
          <span>Building</span>
          <strong>{activeBuilding?.name || 'Outdoor'}</strong>
          <span>Floor</span>
          <strong>{nodeFloor?.name || activeFloor?.name || 'No floor'}</strong>
        </div>
      ) : activeBuilding ? (
        <div className="propertyList">
          <span>Building</span>
          <strong>{activeBuilding.name}</strong>
          <span>Status</span>
          <strong>{activeBuilding.status || 'Published'}</strong>
          <span>Current floor</span>
          <strong>{activeFloor?.name || 'No floor selected'}</strong>
        </div>
      ) : (
        <p className="emptyHint">Select a building or node on the map to inspect it.</p>
      )}
    </aside>
  );
}

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
  const [searchSelection, setSearchSelection] = useState(null);
  const [tool, setTool] = useState('pan');
  const [routePickStep, setRoutePickStep] = useState('source');
  const [routeLoading, setRouteLoading] = useState(false);
  const [routeError, setRouteError] = useState(null);
  const routePathText = useMemo(() => formatRoutePath(currentRoute, floors), [currentRoute, floors]);

  useEffect(() => {
    loadOrganizationMap(organizationId);
  }, [loadOrganizationMap, organizationId]);

  function handleSelectBuilding(buildingId) {
    setActiveBuildingId(buildingId);
    setSelectedNodeId(null);
    setSearchSelection(null);
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
    setSearchSelection(location);
    setFocusedNodeId(location.id);
  }

  function setViewerTool(nextTool) {
    setTool(nextTool);
    if (nextTool !== 'route') {
      setSource(null);
      setDestination(null);
      setCurrentRoute(null);
      setRouteError(null);
      setRoutePickStep('source');
    }
  }

  useEffect(() => {
    let active = true;

    async function findRoute() {
      if (!source || !destination) return;
      setRouteLoading(true);
      setRouteError(null);
      try {
        const route = await routeApi.findRoute({
          sourceId: source.id,
          destinationId: destination.id,
          accessibleOnly: false,
        });
        if (active) setCurrentRoute(route);
      } catch (apiError) {
        if (active) {
          setCurrentRoute(null);
          setRouteError(apiError);
        }
      } finally {
        if (active) setRouteLoading(false);
      }
    }

    findRoute();
    return () => {
      active = false;
    };
  }, [destination, setCurrentRoute, source]);

  function handleRoutePickNode(node) {
    setSelectedNodeId(node.id);
    if (routePickStep === 'source') {
      setSource(node);
      setDestination(null);
      setCurrentRoute(null);
      setRoutePickStep('destination');
      return;
    }
    setDestination(node);
    setRoutePickStep('source');
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
            <div className="viewerCanvasStage">
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
                tool={tool}
                routePickStep={routePickStep}
                onSelectNode={(nodeId, node) => {
                  if (tool === 'route' && node) {
                    handleRoutePickNode(node);
                    return;
                  }
                  setSelectedNodeId(nodeId);
                  setSearchSelection(node || null);
                  if (tool === 'pan') setTool('select');
                }}
                onSelectBuilding={(buildingId) => {
                  handleSelectBuilding(buildingId);
                  if (tool === 'pan') setTool('select');
                }}
                onFocusHandled={() => setFocusedNodeId(null)}
              />
              <div className="viewerCanvasOverlay">
                <div className="viewerToolCluster" aria-label="Map tools">
                  <button className={`toolButton ${tool === 'select' ? 'isActive' : ''}`} type="button" onClick={() => setViewerTool('select')} title="Select"><MousePointer2 size={17} /></button>
                  <button className={`toolButton ${tool === 'pan' ? 'isActive' : ''}`} type="button" onClick={() => setViewerTool('pan')} title="Pan"><LocateFixed size={17} /></button>
                  <button className={`toolButton ${tool === 'route' ? 'isActive' : ''}`} type="button" onClick={() => setViewerTool('route')} title="Pick route on canvas"><Route size={17} /></button>
                </div>
                <div className="viewerSearchFloat">
                  <LocationSearchBox
                    label="Search this map"
                    organizationId={organizationId}
                    selected={searchSelection}
                    onSelect={(node) => {
                      if (node) {
                        focusLocation(node);
                      } else {
                        setSearchSelection(null);
                        setSelectedNodeId(null);
                      }
                    }}
                    onLocationSelected={focusLocation}
                    displaySelectedInInput
                    hideSelectedLocation
                  />
                </div>
                <div className="viewerRouteFields">
                  <LocationSearchBox
                    label="Origin"
                    organizationId={organizationId}
                    selected={source}
                    onSelect={setSource}
                    onLocationSelected={focusLocation}
                    displaySelectedInInput
                    hideSelectedLocation
                  />
                  <LocationSearchBox
                    label="Destination"
                    organizationId={organizationId}
                    selected={destination}
                    onSelect={setDestination}
                    onLocationSelected={focusLocation}
                    displaySelectedInInput
                    hideSelectedLocation
                  />
                </div>
                {tool === 'route' ? (
                  <div className="viewerRouteHint">{routePickStep === 'source' ? 'Click the route source node' : 'Click the route destination node'}</div>
                ) : null}
                {routeError ? <div className="viewerRouteHint viewerRouteError">{routeError.message || 'No route found.'}</div> : null}
                {routeLoading ? <div className="viewerRouteHint viewerRouteLoading">Finding route...</div> : null}
              {currentRoute ? (
                <div className="routeSegmentDock viewerRouteDock">
                  <strong>{currentRoute.totalDistance}m total</strong>
                  <span>{routePathText}</span>
                </div>
              ) : null}
              </div>
            </div>
            <ViewerDetailsPanel selectedNode={selectedNode} activeBuilding={activeBuilding} activeFloor={activeFloor} floors={floors} />
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
