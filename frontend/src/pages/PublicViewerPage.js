import { useEffect, useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import {
  ArrowLeft,
  Building2,
  ChevronRight,
  Edit,
  LocateFixed,
  Map,
  Maximize2,
  MousePointer2,
  Route,
  Search,
} from 'lucide-react';
import * as routeApi from '../api/routeApi';
import { useMapForgeWebMcp } from '../agent/webmcp/useMapForgeWebMcp';
import AppTopbar from '../components/common/AppTopbar';
import StatusMessage from '../components/common/StatusMessage';
import { LocationSearchBox } from '../components/viewer/RoutePlanner';
import ViewerCanvas from '../components/viewer/ViewerCanvas';
import { MapProvider } from '../context/MapContext';
import { NODE_TYPE_LABELS, formatRoutePath, getFloorForNode, getFloorsForBuilding } from '../domain/mapModel';
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
  const [activeMainTab, setActiveMainTab] = useState('buildings'); // 'buildings' | 'maps' | 'details'
  const [activeBuildingTab, setActiveBuildingTab] = useState('overview'); // 'overview' | 'floors' | 'map'

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

  // Filter buildings by search text
  const filteredBuildings = useMemo(() => {
    if (!buildingSearch.trim()) return buildings;
    const q = buildingSearch.toLowerCase();
    return buildings.filter(
      (b) => b.name?.toLowerCase().includes(q) || b.description?.toLowerCase().includes(q)
    );
  }, [buildings, buildingSearch]);

  const activeBuildingFloors = useMemo(
    () => getFloorsForBuilding(floors, activeBuildingId),
    [floors, activeBuildingId]
  );

  // Nodes / POIs on active floor
  const currentFloorNodes = useMemo(() => {
    if (!activeFloor?.nodes) return [];
    return activeFloor.nodes.slice(0, 8);
  }, [activeFloor]);

  return (
    <div className="appFrame viewerLayoutFrame">
      <AppTopbar />

      <main className="viewerDetailsPage">
        {/* Breadcrumb Bar */}
        <section className="viewerBreadcrumbBar">
          <div className="breadcrumbTrail">
            <Link to="/maps" className="breadcrumbLink">
              <ArrowLeft size={16} />
              <span>Organizations</span>
            </Link>
            <ChevronRight size={14} className="breadcrumbSeparator" />
            <span className="breadcrumbCurrent">{organization?.name || 'Campus'}</span>
          </div>

          {isAdmin && (
            <Link
              to={`/admin/maps/${organizationId}`}
              className="button buttonGhost editCampusBtn"
              title="Open map editor"
            >
              <Edit size={15} />
              <span>Edit map</span>
            </Link>
          )}
        </section>

        {/* Campus Overview Header Card */}
        <section className="campusHeroCard">
          <div className="campusHeroThumb">
            <img
              src="/assets/campus_hero.jpg"
              alt={organization?.name || 'Campus'}
              onError={(e) => {
                e.currentTarget.style.display = 'none';
              }}
            />
          </div>

          <div className="campusHeroBody">
            <div className="campusHeroTitleRow">
              <h1 className="campusHeroTitle">{organization?.name || 'ESI MAIN CAMPUS'}</h1>
              <span className="campusHeroBadge">Campus</span>
            </div>

            <p className="campusHeroDesc">
              {organization?.description ||
                'Main campus of ESI, including classrooms, labs and administration.'}
            </p>

            <div className="campusHeroStats">
              <div className="campusStatPill">
                <Building2 size={16} className="statIconBlue" />
                <span>
                  <strong>{buildings.length || 12}</strong> Buildings
                </span>
              </div>
              <div className="campusStatPill">
                <Map size={16} className="statIconGreen" />
                <span>
                  <strong>{floors.length || 5}</strong> Maps
                </span>
              </div>
              <div className="campusStatPill">
                <Maximize2 size={16} className="statIconPurple" />
                <span>
                  <strong>{organization?.canvasWidth || 8000} &times; {organization?.canvasHeight || 6000}</strong> Canvas size
                </span>
              </div>
            </div>
          </div>
        </section>

        {/* Navigation Tabs Bar */}
        <div className="viewerTabsStrip">
          <button
            className={`viewerTabBtn ${activeMainTab === 'buildings' ? 'isActive' : ''}`}
            onClick={() => setActiveMainTab('buildings')}
          >
            Buildings
          </button>
          <button
            className={`viewerTabBtn ${activeMainTab === 'maps' ? 'isActive' : ''}`}
            onClick={() => setActiveMainTab('maps')}
          >
            Maps
          </button>
          <button
            className={`viewerTabBtn ${activeMainTab === 'details' ? 'isActive' : ''}`}
            onClick={() => setActiveMainTab('details')}
          >
            Details
          </button>
        </div>

        {error && (
          <StatusMessage title={error.code || 'Map failed to load'} tone="error">
            {error.message}
          </StatusMessage>
        )}

        {loading ? (
          <StatusMessage title="Loading campus map">
            Fetching the published building and floor graph...
          </StatusMessage>
        ) : (
          /* Master-Detail Layout */
          <div className="viewerMasterDetailLayout">
            {/* Left: Buildings Directory */}
            <aside className="buildingsDirectoryCol">
              <div className="buildingsSearchBox">
                <Search size={15} className="searchIcon" />
                <input
                  type="text"
                  placeholder="Search buildings..."
                  value={buildingSearch}
                  onChange={(e) => setBuildingSearch(e.target.value)}
                />
              </div>

              <div className="buildingsList">
                {filteredBuildings.map((building) => {
                  const isSelected = Number(building.id) === Number(activeBuildingId);
                  const buildingFloors = getFloorsForBuilding(floors, building.id);
                  const firstFloor = buildingFloors[0];

                  return (
                    <div
                      key={building.id}
                      className={`buildingListItem ${isSelected ? 'isActive' : ''}`}
                      onClick={() => handleSelectBuilding(building.id)}
                    >
                      <div className="buildingThumbMini">
                        <img
                          src="/assets/building_thumb.jpg"
                          alt={building.name}
                          onError={(e) => {
                            e.currentTarget.style.display = 'none';
                          }}
                        />
                      </div>
                      <div className="buildingListItemMeta">
                        <h4 className="buildingListItemName">{building.name}</h4>
                        <span className="buildingListItemSub">
                          Level {firstFloor?.floorNumber ?? 0} &bull; {buildingFloors.length} {buildingFloors.length === 1 ? 'floor' : 'floors'}
                        </span>
                      </div>
                      {isSelected && <div className="activeBuildingIndicator" />}
                    </div>
                  );
                })}
              </div>
            </aside>

            {/* Right: Building Detail & Interactive Floorplan Preview */}
            <section className="buildingDetailCol">
              <div className="buildingDetailCard">
                {/* Building Header */}
                <div className="buildingDetailHeader">
                  <div>
                    <h2 className="buildingDetailTitle">
                      {activeBuilding?.name || 'A1 - Administration'}
                    </h2>
                    <span className="buildingLevelBadge">
                      Level {activeFloorNumber ?? 0} &bull; {activeBuildingFloors.length} Floors
                    </span>
                  </div>

                  {/* Level Switcher */}
                  {activeBuildingFloors.length > 0 && (
                    <div className="floorLevelSelector">
                      {activeBuildingFloors.map((fl) => (
                        <button
                          key={fl.id}
                          className={`floorPillBtn ${Number(activeFloorId) === Number(fl.id) ? 'isActive' : ''}`}
                          onClick={() => {
                            setActiveFloorId(fl.id);
                            setSelectedNodeId(null);
                          }}
                        >
                          Level {fl.floorNumber ?? fl.name}
                        </button>
                      ))}
                    </div>
                  )}
                </div>

                {/* Sub-Tabs: Overview | Floors | Map view */}
                <div className="buildingSubTabs">
                  <button
                    className={`subTabBtn ${activeBuildingTab === 'overview' ? 'isActive' : ''}`}
                    onClick={() => setActiveBuildingTab('overview')}
                  >
                    Overview
                  </button>
                  <button
                    className={`subTabBtn ${activeBuildingTab === 'floors' ? 'isActive' : ''}`}
                    onClick={() => setActiveBuildingTab('floors')}
                  >
                    Floors
                  </button>
                  <button
                    className={`subTabBtn ${activeBuildingTab === 'map' ? 'isActive' : ''}`}
                    onClick={() => setActiveBuildingTab('map')}
                  >
                    Map view
                  </button>
                </div>

                {/* Building Description & POIs */}
                <div className="buildingOverviewSection">
                  <h4 className="overviewSubheading">Description</h4>
                  <p className="buildingOverviewText">
                    {activeBuilding?.description ||
                      'Main administration and academic building with offices, reception, classrooms and conference rooms.'}
                  </p>

                  <h4 className="overviewSubheading">Points of interest</h4>
                  <div className="poiList">
                    {currentFloorNodes.length > 0 ? (
                      currentFloorNodes.map((node) => (
                        <div
                          key={node.id}
                          className={`poiItem ${selectedNodeId === node.id ? 'isSelected' : ''}`}
                          onClick={() => {
                            setSelectedNodeId(node.id);
                            setFocusedNodeId(node.id);
                          }}
                        >
                          <span className="poiRadioDot" />
                          <span className="poiName">
                            {node.name || node.externalIdentifier || NODE_TYPE_LABELS[node.type] || 'Location'}
                          </span>
                        </div>
                      ))
                    ) : (
                      <>
                        <div className="poiItem">
                          <span className="poiRadioDot" />
                          <span className="poiName">Reception & Information Desk</span>
                        </div>
                        <div className="poiItem">
                          <span className="poiRadioDot" />
                          <span className="poiName">Faculty Offices</span>
                        </div>
                        <div className="poiItem">
                          <span className="poiRadioDot" />
                          <span className="poiName">Main Meeting Room</span>
                        </div>
                      </>
                    )}
                  </div>
                </div>

                {/* Floorplan 2D Canvas Stage */}
                <div className="interactiveFloorplanStage">
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

                  {/* Canvas Floating Overlay Controls */}
                  <div className="viewerCanvasOverlay">
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
                        title="Pan canvas"
                      >
                        <LocateFixed size={16} />
                      </button>
                      <button
                        className={`toolButton ${tool === 'route' ? 'isActive' : ''}`}
                        type="button"
                        onClick={() => setViewerTool('route')}
                        title="Find route"
                      >
                        <Route size={16} />
                      </button>
                    </div>

                    <div className="viewerSearchFloat">
                      <LocationSearchBox
                        label="Search this map"
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

                    {tool === 'route' && (
                      <div className="viewerRouteHint">
                        {routePickStep === 'source'
                          ? 'Click the starting node on the canvas'
                          : 'Click the destination node on the canvas'}
                      </div>
                    )}
                    {routeError && (
                      <div className="viewerRouteHint viewerRouteError">
                        {routeError.message || 'No route found between selected points.'}
                      </div>
                    )}
                    {routeLoading && (
                      <div className="viewerRouteHint viewerRouteLoading">
                        Calculating optimal path...
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
              </div>
            </section>
          </div>
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
