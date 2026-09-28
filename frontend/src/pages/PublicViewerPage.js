import { useEffect, useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import {
  ArrowUpDown,
  Building2,
  ChevronLeft,
  Layers,
  LocateFixed,
  Milestone,
  MousePointer2,
  Route,
  Search,
  Wrench,
  X,
} from 'lucide-react';
import * as routeApi from '../api/routeApi';
import { useMapForgeWebMcp } from '../agent/webmcp/useMapForgeWebMcp';
import BrandLogo from '../components/common/BrandLogo';
import StatusMessage from '../components/common/StatusMessage';
import { LocationSearchBox } from '../components/viewer/RoutePlanner';
import ViewerCanvas from '../components/viewer/ViewerCanvas';
import { MapProvider } from '../context/MapContext';
import {
  NODE_TYPE_LABELS,
  formatRoutePath,
  getFloorForNode,
  getFloorsForBuilding,
} from '../domain/mapModel';
import useAuth from '../hooks/useAuth';
import useMap from '../hooks/useMap';

function PublicViewerContent() {
  const { organizationId } = useParams();
  const { isAdmin } = useAuth();
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
  const [buildingSearch, setBuildingSearch] = useState('');
  const [tool, setTool] = useState('select');
  const [routePickStep, setRoutePickStep] = useState('source');
  const [routeLoading, setRouteLoading] = useState(false);
  const [routeError, setRouteError] = useState(null);

  const routePathText = useMemo(() => formatRoutePath(currentRoute, floors), [currentRoute, floors]);

  const webMcpContext = useMemo(
    () => ({
      organizationId,
      organization,
      buildings,
      floors,
      activeBuilding,
      activeFloor,
      isAdmin: false,
      canEdit: false,
      setCurrentRoute,
    }),
    [activeBuilding, activeFloor, buildings, floors, organization, organizationId, setCurrentRoute]
  );

  const {
    confirmationModal: webMcpConfirmationModal,
    activityIndicator: webMcpActivityIndicator,
  } = useMapForgeWebMcp(webMcpContext);

  useEffect(() => {
    loadOrganizationMap(organizationId);
  }, [loadOrganizationMap, organizationId]);

  function handleSelectBuilding(buildingId) {
    setActiveBuildingId(buildingId);
    setSelectedNodeId(null);
    setSearchSelection(null);
    const buildingFloors = getFloorsForBuilding(floors, buildingId);
    if (buildingFloors.length > 0 && (!activeFloorId || !buildingFloors.some((f) => f.id === activeFloorId))) {
      setActiveFloorId(buildingFloors[0].id);
    }
  }

  function focusLocation(location) {
    if (!location?.id) return;
    if (location.kind === 'building') {
      const firstFloor = getFloorsForBuilding(floors, location.id)[0];
      setActiveBuildingId(location.id);
      if (firstFloor) setActiveFloorId(firstFloor.id);
      setSelectedNodeId(null);
      setSearchSelection(location);
      setFocusedNodeId(null);
      return;
    }

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

  const filteredBuildings = useMemo(() => {
    if (!buildingSearch.trim()) return buildings;
    const q = buildingSearch.toLowerCase();
    return buildings.filter(
      (b) => b.name?.toLowerCase().includes(q) || b.description?.toLowerCase().includes(q)
    );
  }, [buildings, buildingSearch]);

  const activeBuildingFloors = useMemo(() => {
    if (!activeBuildingId) return [];
    return getFloorsForBuilding(floors, activeBuildingId);
  }, [floors, activeBuildingId]);

  return (
    <div className="appFrame editorFrame publicViewerFrame">
      <main className="editorPage publicViewerPage">
        {/* CAD-Style Dark Topbar */}
        <header className="editorTopbar">
          <div className="editorBrandStrip">
            <BrandLogo theme="dark" size="small" />
            <span className="editorBrandSep">/</span>
            <Link to="/maps" className="editorBackLink" title="Back to maps directory">
              <ChevronLeft size={16} />
              <span>Maps</span>
            </Link>
            <span className="editorBrandSep">/</span>
            <span className="editorMapTitle">{organization?.name || 'Campus Map'}</span>
            <div className="editorSaveStatusBadge">
              <span className="savePulseDot isSaved" />
              <span>
                {activeBuilding
                  ? `${activeBuilding.name} • Level ${activeFloorNumber ?? 0}`
                  : 'Campus Overview'}
              </span>
            </div>
          </div>

          {/* Quick Floor Switcher in Header */}
          <div className="editorContextStrip">
            {activeBuildingFloors.map((floor) => (
              <button
                className={Number(activeFloorId) === Number(floor.id) ? 'isActive' : ''}
                type="button"
                key={floor.id}
                onClick={() => {
                  setActiveFloorId(floor.id);
                  setSelectedNodeId(null);
                }}
              >
                Level {floor.floorNumber ?? floor.name}
              </button>
            ))}
          </div>

          {/* Right Actions */}
          <div className="editorActions">
            {isAdmin && (
              <Link
                className="button buttonGhost editorPreviewBtn"
                to={`/admin/maps/${organizationId}`}
                title="Open CAD Editor"
              >
                <Wrench size={14} />
                <span>Open CAD Editor</span>
              </Link>
            )}
          </div>
        </header>

        {error && (
          <StatusMessage title={error.code || 'Map failed to load'} tone="error">
            {error.message}
          </StatusMessage>
        )}

        {loading ? (
          <main className="centeredPage" style={{ flex: 1, display: 'grid', placeItems: 'center' }}>
            <StatusMessage title="Loading campus map">
              Fetching published building and floor layout...
            </StatusMessage>
          </main>
        ) : (
          <section className="editorWorkspace viewerWorkspaceDark">
            {/* Left Sidebar: Buildings & Floors Browser */}
            <aside className="editorSidebar viewerDarkSidebar">
              <div className="panelHeader" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <Building2 size={16} />
                <h2 style={{ fontSize: '0.95rem', fontWeight: 800, margin: 0, color: 'white' }}>Buildings &amp; Floors</h2>
              </div>

              {/* Building Search Filter */}
              <div className="editorSearchBox" style={{ position: 'relative' }}>
                <Search size={14} style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: 'var(--dark-muted)' }} />
                <input
                  type="text"
                  placeholder="Filter buildings..."
                  value={buildingSearch}
                  onChange={(e) => setBuildingSearch(e.target.value)}
                  style={{
                    width: '100%',
                    paddingLeft: 30,
                    paddingRight: 24,
                    height: 34,
                    borderRadius: 'var(--radius-sm)',
                    background: '#0E1724',
                    border: '1px solid var(--dark-border)',
                    color: 'white',
                    fontSize: '0.82rem',
                  }}
                />
                {buildingSearch && (
                  <button
                    type="button"
                    onClick={() => setBuildingSearch('')}
                    style={{ position: 'absolute', right: 8, top: '50%', transform: 'translateY(-50%)', background: 'transparent', border: 'none', color: 'var(--dark-muted)', cursor: 'pointer', padding: 2 }}
                  >
                    <X size={12} />
                  </button>
                )}
              </div>

              {filteredBuildings.length === 0 ? (
                <p className="emptyHint" style={{ color: 'var(--dark-muted)', fontSize: '0.82rem' }}>No matching buildings found.</p>
              ) : null}

              <div className="buildingTree" style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {filteredBuildings.map((building) => {
                  const buildingFloors = getFloorsForBuilding(floors, building.id);
                  const isActiveBuilding = Number(activeBuildingId) === Number(building.id);

                  return (
                    <section className="treeBuilding" key={building.id} style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                      <button
                        className={`treeBuildingButton ${isActiveBuilding ? 'isActive' : ''}`}
                        type="button"
                        onClick={() => handleSelectBuilding(building.id)}
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          gap: 10,
                          width: '100%',
                          padding: '8px 10px',
                          borderRadius: 'var(--radius-sm)',
                          border: isActiveBuilding ? '1px solid var(--primary)' : '1px solid transparent',
                          background: isActiveBuilding ? 'rgba(13, 92, 70, 0.25)' : 'rgba(255, 255, 255, 0.04)',
                          color: isActiveBuilding ? '#FFFFFF' : '#94A3B8',
                          cursor: 'pointer',
                          textAlign: 'left',
                          fontWeight: 700,
                          fontSize: '0.86rem',
                          transition: 'all 0.15s ease',
                        }}
                      >
                        <span
                          className="buildingColor"
                          style={{
                            width: 10,
                            height: 10,
                            borderRadius: '50%',
                            backgroundColor: building.color || '#10B981',
                            flexShrink: 0,
                          }}
                          aria-hidden="true"
                        />
                        <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1 }}>
                          {building.name}
                        </span>
                        <span style={{ fontSize: '0.72rem', opacity: 0.7 }}>
                          {buildingFloors.length} {buildingFloors.length === 1 ? 'fl' : 'fls'}
                        </span>
                      </button>

                      {isActiveBuilding && (
                        <div className="floorList" style={{ paddingLeft: 18, display: 'flex', flexDirection: 'column', gap: 3 }}>
                          {buildingFloors.length === 0 ? (
                            <p className="emptyHint" style={{ fontSize: '0.78rem', color: 'var(--dark-muted)', margin: '4px 0' }}>No floors yet.</p>
                          ) : null}
                          {buildingFloors.map((floor) => (
                            <button
                              className={`floorButton ${Number(activeFloorId) === Number(floor.id) ? 'isActive' : ''}`}
                              type="button"
                              key={floor.id}
                              onClick={() => {
                                setActiveFloorId(floor.id);
                                setSelectedNodeId(null);
                              }}
                              style={{
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'space-between',
                                padding: '5px 10px',
                                borderRadius: 'var(--radius-sm)',
                                border: 'none',
                                background: Number(activeFloorId) === Number(floor.id) ? 'var(--primary)' : 'transparent',
                                color: Number(activeFloorId) === Number(floor.id) ? '#FFFFFF' : '#94A3B8',
                                fontSize: '0.8rem',
                                fontWeight: 600,
                                cursor: 'pointer',
                                textAlign: 'left',
                                transition: 'all 0.15s ease',
                              }}
                            >
                              <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                                <Layers size={13} />
                                <span>{floor.name}</span>
                              </span>
                              <small style={{ opacity: 0.8 }}>Level {floor.floorNumber ?? 0}</small>
                            </button>
                          ))}
                        </div>
                      )}
                    </section>
                  );
                })}
              </div>
            </aside>

            {/* Center: Canvas Stage */}
            <div className="canvasStage">
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

              {/* Floating Canvas Overlays */}
              <div className="viewerCanvasOverlay">
                {/* Floating CAD Tool Cluster */}
                <div className="viewerToolCluster" aria-label="Map tools">
                  <button
                    className={`toolButton ${tool === 'select' ? 'isActive' : ''}`}
                    type="button"
                    onClick={() => setViewerTool('select')}
                    title="Select mode"
                  >
                    <MousePointer2 size={16} />
                  </button>
                  <button
                    className={`toolButton ${tool === 'pan' ? 'isActive' : ''}`}
                    type="button"
                    onClick={() => setViewerTool('pan')}
                    title="Pan map"
                  >
                    <LocateFixed size={16} />
                  </button>
                  <button
                    className={`toolButton ${tool === 'route' ? 'isActive' : ''}`}
                    type="button"
                    onClick={() => setViewerTool('route')}
                    title="Find route / directions"
                  >
                    <Route size={16} />
                  </button>
                </div>

                {/* Floating Search Bar */}
                <div className="viewerSearchFloat">
                  <LocationSearchBox
                    label="Search map"
                    organizationId={organizationId}
                    selected={searchSelection}
                    onSelect={(location) => {
                      if (location) {
                        focusLocation(location);
                      } else {
                        setSearchSelection(null);
                        setSelectedNodeId(null);
                      }
                    }}
                    onLocationSelected={focusLocation}
                    displaySelectedInInput
                    hideSelectedLocation
                    includeBuildings
                  />
                </div>

                {/* Route Fields (when in route mode) */}
                {tool === 'route' && (
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
                    <button
                      type="button"
                      className="toolButton"
                      style={{ alignSelf: 'flex-end', marginBottom: 2 }}
                      onClick={() => {
                        const temp = source;
                        setSource(destination);
                        setDestination(temp);
                      }}
                      title="Swap start and destination"
                      disabled={!source && !destination}
                    >
                      <ArrowUpDown size={15} />
                    </button>
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
                )}

                {tool === 'route' && (
                  <div className="viewerRouteHint">
                    {routePickStep === 'source'
                      ? 'Click the route starting node on the canvas'
                      : 'Click the route destination node on the canvas'}
                  </div>
                )}

                {routeError && (
                  <div className="viewerRouteHint viewerRouteError">
                    {routeError.message || 'No pathway found between these points.'}
                  </div>
                )}

                {routeLoading && (
                  <div className="viewerRouteHint viewerRouteLoading">
                    Finding optimal pathway...
                  </div>
                )}

                {currentRoute && (
                  <div className="routeSegmentDock viewerRouteDock">
                    <strong>{currentRoute.totalDistance}m total distance</strong>
                    <span>{routePathText}</span>
                  </div>
                )}
              </div>
            </div>

            {/* Right Inspector Panel */}
            <aside className="inspectorPanel viewerInspectorPanel">
              <div className="panelHeader" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <MousePointer2 size={16} />
                <h2 style={{ fontSize: '0.95rem', fontWeight: 800, margin: 0, color: 'white' }}>Location Details</h2>
              </div>

              {selectedNode ? (
                <div className="propertyList" style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                  <div className="inspectorField">
                    <label>Name</label>
                    <strong style={{ color: 'white', fontSize: '0.92rem' }}>{selectedNode.name || 'Unnamed node'}</strong>
                  </div>
                  <div className="inspectorField">
                    <label>Identifier</label>
                    <span style={{ color: 'var(--dark-muted)', fontSize: '0.86rem' }}>
                      {selectedNode.externalIdentifier || selectedNode.identifier || selectedNode.id}
                    </span>
                  </div>
                  <div className="inspectorField">
                    <label>Category</label>
                    <span style={{ color: '#38BDF8', fontSize: '0.86rem', fontWeight: 600 }}>
                      {NODE_TYPE_LABELS[selectedNode.type] || selectedNode.type || 'Point of Interest'}
                    </span>
                  </div>
                  <div className="inspectorField">
                    <label>Building &amp; Floor</label>
                    <span style={{ color: 'white', fontSize: '0.86rem' }}>
                      {activeBuilding?.name || 'Campus'} • {activeFloor?.name || `Level ${activeFloorNumber ?? 0}`}
                    </span>
                  </div>

                  {/* Real Direction Actions */}
                  <div style={{ marginTop: 12, display: 'flex', flexDirection: 'column', gap: 8 }}>
                    <button
                      className="button buttonGhost"
                      type="button"
                      onClick={() => {
                        setSource(selectedNode);
                        setViewerTool('route');
                        setRoutePickStep('destination');
                      }}
                      style={{
                        width: '100%',
                        fontSize: '0.84rem',
                        justifyContent: 'flex-start',
                        background: 'rgba(255, 255, 255, 0.06)',
                        borderColor: 'rgba(255, 255, 255, 0.12)',
                        color: 'white',
                      }}
                    >
                      <Route size={14} />
                      <span>Directions from here</span>
                    </button>
                    <button
                      className="button buttonGhost"
                      type="button"
                      onClick={() => {
                        setDestination(selectedNode);
                        setViewerTool('route');
                        if (!source) setRoutePickStep('source');
                      }}
                      style={{
                        width: '100%',
                        fontSize: '0.84rem',
                        justifyContent: 'flex-start',
                        background: 'rgba(255, 255, 255, 0.06)',
                        borderColor: 'rgba(255, 255, 255, 0.12)',
                        color: 'white',
                      }}
                    >
                      <Milestone size={14} />
                      <span>Directions to here</span>
                    </button>
                    <button
                      className="button buttonSubtle"
                      type="button"
                      onClick={() => {
                        setSelectedNodeId(null);
                        setSearchSelection(null);
                      }}
                      style={{ width: '100%', fontSize: '0.82rem', marginTop: 4 }}
                    >
                      <span>Clear selection</span>
                    </button>
                  </div>
                </div>
              ) : activeBuilding ? (
                <div className="propertyList" style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                  <div className="inspectorField">
                    <label>Building Name</label>
                    <strong style={{ color: 'white', fontSize: '0.96rem' }}>{activeBuilding.name}</strong>
                  </div>
                  {activeBuilding.description && (
                    <div className="inspectorField">
                      <label>Description</label>
                      <p style={{ margin: 0, color: 'var(--dark-muted)', fontSize: '0.86rem', lineHeight: 1.5 }}>
                        {activeBuilding.description}
                      </p>
                    </div>
                  )}
                  <div className="inspectorField">
                    <label>Current Floor</label>
                    <span style={{ color: '#38BDF8', fontSize: '0.86rem', fontWeight: 600 }}>
                      {activeFloor?.name || `Level ${activeFloorNumber ?? 0}`}
                    </span>
                  </div>
                  <div className="inspectorField">
                    <label>Published Floors</label>
                    <span style={{ color: 'white', fontSize: '0.86rem' }}>
                      {activeBuildingFloors.length} {activeBuildingFloors.length === 1 ? 'floor' : 'floors'}
                    </span>
                  </div>
                </div>
              ) : (
                <p className="emptyHint" style={{ color: 'var(--dark-muted)', fontSize: '0.86rem', lineHeight: 1.5 }}>
                  Click any building, room, or entrance on the map to view details and get directions.
                </p>
              )}
            </aside>
          </section>
        )}

        {webMcpConfirmationModal}
        {webMcpActivityIndicator}
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
