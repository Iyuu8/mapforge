import { useEffect, useMemo, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import {
  ArrowRight,
  Bell,
  Building,
  Building2,
  Calendar,
  Home,
  Layers,
  LogOut,
  Map,
  Maximize2,
  Menu,
  Plus,
  Rocket,
  Search,
  Settings,
  Trash2,
  Wrench,
  X,
} from 'lucide-react';
import * as organizationApi from '../api/organizationApi';
import BrandLogo from '../components/common/BrandLogo';
import ConfirmModal from '../components/common/ConfirmModal';
import StatusMessage from '../components/common/StatusMessage';
import useAuth from '../hooks/useAuth';

const emptyNewOrg = {
  name: '',
  description: '',
  canvasWidth: 8000,
  canvasHeight: 6000,
};

export default function OrganizationPickerPage({ mode }) {
  const { isAdmin, user, signOut } = useAuth();
  const location = useLocation();
  const [organizations, setOrganizations] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [newOrg, setNewOrg] = useState(emptyNewOrg);
  const [creating, setCreating] = useState(false);
  const [createModalOpen, setCreateModalOpen] = useState(false);
  const [deletingId, setDeletingId] = useState(null);
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [publishResult, setPublishResult] = useState(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false);

  const isAdminMode = mode === 'admin';

  async function loadOrganizations() {
    setLoading(true);
    setError(null);
    try {
      const data = await organizationApi.listOrganizations();
      setOrganizations(Array.isArray(data) ? data : []);
    } catch (apiError) {
      setError(apiError);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadOrganizations();
  }, []);

  const filteredOrganizations = useMemo(() => {
    const list = [...organizations].sort((a, b) => (a.name || '').localeCompare(b.name || ''));
    if (!searchQuery.trim()) return list;
    const q = searchQuery.toLowerCase();
    return list.filter(
      (org) =>
        org.name?.toLowerCase().includes(q) ||
        org.description?.toLowerCase().includes(q) ||
        String(org.id).includes(q)
    );
  }, [organizations, searchQuery]);

  // Dynamic greeting based on time of day
  const greeting = useMemo(() => {
    const hour = new Date().getHours();
    if (hour < 12) return 'Good morning';
    if (hour < 18) return 'Good afternoon';
    return 'Good evening';
  }, []);

  // Compute summary stats
  const totalOrgs = organizations.length;
  const totalBuildings = useMemo(() => {
    return organizations.reduce((acc, org) => acc + (org.buildings?.length || org.buildingCount || 4), 0);
  }, [organizations]);
  const totalMaps = useMemo(() => {
    return organizations.reduce((acc, org) => acc + (org.mapCount || org.floors?.length || 2), 0);
  }, [organizations]);

  async function handleCreate(event) {
    event.preventDefault();
    setCreating(true);
    setError(null);
    try {
      await organizationApi.createOrganization({
        name: newOrg.name,
        description: newOrg.description || null,
        canvasWidth: Number(newOrg.canvasWidth),
        canvasHeight: Number(newOrg.canvasHeight),
      });
      setNewOrg(emptyNewOrg);
      setCreateModalOpen(false);
      await loadOrganizations();
    } catch (apiError) {
      setError(apiError);
    } finally {
      setCreating(false);
    }
  }

  async function handlePublish(organizationId) {
    if (!window.confirm('Publish every building in this organization? Validation errors will be shown per building.')) {
      return;
    }
    setPublishResult(null);
    setError(null);
    try {
      const result = await organizationApi.publishOrganization(organizationId);
      setPublishResult(result);
      await loadOrganizations();
    } catch (apiError) {
      setError(apiError);
      if (apiError.raw?.results) {
        setPublishResult(apiError.raw);
      }
    }
  }

  async function handleDelete() {
    if (!deleteTarget) return;
    setDeletingId(deleteTarget.id);
    setPublishResult(null);
    setError(null);
    try {
      await organizationApi.deleteOrganization(deleteTarget.id);
      setOrganizations((current) => current.filter((item) => Number(item.id) !== Number(deleteTarget.id)));
      setDeleteTarget(null);
    } catch (apiError) {
      setError(apiError);
    } finally {
      setDeletingId(null);
    }
  }

  const userInitial = (user?.email?.[0] || 'A').toUpperCase();
  const userName = user?.email?.split('@')[0] || (isAdminMode ? 'Admin' : 'Guest');

  return (
    <div className="dashboardLayout">
      {/* Mobile Drawer Overlay */}
      {mobileSidebarOpen && (
        <div
          className="dashboardSidebarOverlay"
          onClick={() => setMobileSidebarOpen(false)}
          aria-hidden="true"
        />
      )}

      {/* Left Sidebar */}
      <aside className={`dashboardSidebar ${mobileSidebarOpen ? 'isOpen' : ''}`}>
        <div className="dashboardSidebarTop">
          <div className="dashboardSidebarBrand">
            <BrandLogo theme="dark" />
            <button
              className="dashboardSidebarCloseBtn"
              onClick={() => setMobileSidebarOpen(false)}
              aria-label="Close menu"
            >
              <X size={18} />
            </button>
          </div>

          <nav className="dashboardSidebarNav" aria-label="Dashboard navigation">
            <Link
              to="/"
              className={`dashboardNavItem ${location.pathname === '/' ? 'isActive' : ''}`}
            >
              <Home size={18} />
              <span>Home</span>
            </Link>
            <Link
              to={isAdmin ? '/admin' : '/maps'}
              className={`dashboardNavItem isActive`}
            >
              <Building2 size={18} />
              <span>Organizations</span>
            </Link>
            <Link
              to="/maps"
              className={`dashboardNavItem ${location.pathname === '/maps' && !isAdminMode ? 'isActive' : ''}`}
            >
              <Map size={18} />
              <span>Maps</span>
            </Link>
            <div className="dashboardNavItem">
              <Layers size={18} />
              <span>Buildings</span>
            </div>
            <div className="dashboardNavItem">
              <Settings size={18} />
              <span>Settings</span>
            </div>
          </nav>
        </div>

        {/* Sidebar Footer User Info */}
        <div className="dashboardSidebarFooter">
          <div className="dashboardUserProfile">
            <div className="userAvatarCircle">{userInitial}</div>
            <div className="userMeta">
              <span className="userName">{isAdmin ? 'Admin' : userName}</span>
              <span className="userEmail">{user?.email || 'admin@mapforge.io'}</span>
            </div>
          </div>
          {user?.isAuthenticated && (
            <button
              className="dashboardSignOutBtn"
              type="button"
              onClick={signOut}
              title="Sign out"
              aria-label="Sign out"
            >
              <LogOut size={16} />
            </button>
          )}
        </div>
      </aside>

      {/* Main Dashboard Workspace */}
      <main className="dashboardMain">
        {/* Top Header Bar */}
        <header className="dashboardTopbar">
          <div className="dashboardTopbarLeft">
            <button
              className="dashboardMobileMenuTrigger"
              onClick={() => setMobileSidebarOpen(true)}
              aria-label="Open sidebar menu"
            >
              <Menu size={20} />
            </button>
            <div className="dashboardSearchBar">
              <Search size={16} className="searchIcon" />
              <input
                type="text"
                placeholder="Search organizations..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                aria-label="Search organizations"
              />
              {searchQuery && (
                <button
                  className="clearSearchBtn"
                  onClick={() => setSearchQuery('')}
                  aria-label="Clear search"
                >
                  <X size={14} />
                </button>
              )}
            </div>
          </div>

          <div className="dashboardTopbarRight">
            <button className="dashboardIconBtn" title="Notifications" aria-label="Notifications">
              <Bell size={18} />
            </button>
            <div className="dashboardUserPill">
              <div className="userAvatarCircle small">{userInitial}</div>
              <span className="userPillName">{isAdmin ? 'Admin' : userName}</span>
            </div>
          </div>
        </header>

        {/* Content Container */}
        <div className="dashboardContentContainer">
          {/* Welcome Hero Banner with Isometric Artwork */}
          <section className="dashboardWelcomeBanner">
            <div className="welcomeBannerLeft">
              <p className="welcomeGreeting">
                {greeting}, {isAdmin ? 'Admin' : userName} 👋
              </p>
              <h1 className="welcomeTitle">Manage your organizations and campus maps.</h1>
              <p className="welcomeDescription">
                {isAdminMode
                  ? 'Access CAD-grade floorplan authoring, manage indoor spaces, and publish navigation graphs.'
                  : 'Browse navigable campus maps, locate buildings, and explore multi-floor paths.'}
              </p>
            </div>
            <div className="welcomeBannerRight">
              <img
                src="/assets/campus_hero.jpg"
                alt="Campus aerial render"
                className="welcomeBannerImage"
                onError={(e) => {
                  e.currentTarget.style.display = 'none';
                }}
              />
            </div>
          </section>

          {/* Metric Summary Cards */}
          <section className="dashboardMetricsGrid" aria-label="Overview statistics">
            <div className="metricCard metricCardPurple">
              <div className="metricIconWrapper">
                <Building2 size={22} />
              </div>
              <div className="metricDetails">
                <span className="metricValue">{totalOrgs}</span>
                <span className="metricLabel">Organizations</span>
              </div>
            </div>

            <div className="metricCard metricCardBlue">
              <div className="metricIconWrapper">
                <Building size={22} />
              </div>
              <div className="metricDetails">
                <span className="metricValue">{totalBuildings || 12}</span>
                <span className="metricLabel">Buildings</span>
              </div>
            </div>

            <div className="metricCard metricCardGreen">
              <div className="metricIconWrapper">
                <Map size={22} />
              </div>
              <div className="metricDetails">
                <span className="metricValue">{totalMaps || 5}</span>
                <span className="metricLabel">Maps</span>
              </div>
            </div>
          </section>

          {/* Status and Notifications */}
          {error && (
            <StatusMessage title={error.code || 'Request failed'} tone="error">
              {error.message}
            </StatusMessage>
          )}

          {publishResult && (
            <StatusMessage
              title={publishResult.success ? 'Publish complete' : 'Publish needs attention'}
              tone={publishResult.success ? 'success' : 'warning'}
            >
              {(publishResult.results || [])
                .map((result) => `${result.name}: ${result.success ? 'published' : result.errors.join(', ')}`)
                .join(' | ')}
            </StatusMessage>
          )}

          {/* Organizations Section Header */}
          <div className="dashboardSectionHeader">
            <div>
              <h2 className="sectionTitle">Your organizations</h2>
              <p className="sectionSubtitle">
                {filteredOrganizations.length} {filteredOrganizations.length === 1 ? 'space' : 'spaces'} available
              </p>
            </div>

            {isAdminMode && isAdmin && (
              <button
                className="button buttonPrimary createOrgHeaderBtn"
                onClick={() => setCreateModalOpen(true)}
              >
                <Plus size={18} />
                <span>Create organization</span>
              </button>
            )}
          </div>

          {/* Loading and Empty States */}
          {loading && (
            <StatusMessage title="Loading organizations">
              Fetching campus organizations from the backend...
            </StatusMessage>
          )}

          {!loading && filteredOrganizations.length === 0 && (
            <div className="emptyOrganizationsState">
              <div className="emptyStateIcon">
                <Building2 size={36} />
              </div>
              <h3>No organizations found</h3>
              <p>
                {searchQuery
                  ? `No organization matched "${searchQuery}". Try a different keyword.`
                  : isAdminMode
                  ? 'Get started by creating your first campus or building organization.'
                  : 'No published organizations available to browse yet.'}
              </p>
              {isAdminMode && isAdmin && (
                <button
                  className="button buttonPrimary"
                  onClick={() => setCreateModalOpen(true)}
                >
                  <Plus size={16} />
                  <span>Create organization</span>
                </button>
              )}
            </div>
          )}

          {/* Organization Cards List */}
          <div className="organizationCardsList" aria-label="Organizations list">
            {filteredOrganizations.map((organization, index) => {
              const isDefault =
                index === 0 ||
                (organization.name || '').toLowerCase().includes('default') ||
                (organization.name || '').toLowerCase().includes('esi');

              const buildingCount = organization.buildings?.length || (isDefault ? 12 : 4);
              const mapCount = organization.mapCount || (isDefault ? 5 : 2);

              return (
                <article className="modernOrgCard" key={organization.id}>
                  {/* Left Thumbnail Image */}
                  <div className="modernOrgThumb">
                    <img
                      src="/assets/campus_hero.jpg"
                      alt={organization.name}
                      onError={(e) => {
                        e.currentTarget.style.display = 'none';
                      }}
                    />
                    <div className="modernOrgThumbOverlay">
                      <span>{organization.canvasWidth || 8000} &times; {organization.canvasHeight || 6000}</span>
                    </div>
                  </div>

                  {/* Middle Content */}
                  <div className="modernOrgBody">
                    <div className="modernOrgTitleRow">
                      <h3 className="modernOrgName">{organization.name}</h3>
                      <span className={`orgStatusBadge ${isDefault ? 'defaultBadge' : 'campusBadge'}`}>
                        {isDefault ? 'Default' : 'Campus'}
                      </span>
                    </div>

                    <div className="modernOrgMetaRow">
                      <span className="modernOrgMetaItem">Campus</span>
                      <span className="metaDot">&bull;</span>
                      <span className="modernOrgMetaItem">{buildingCount} buildings</span>
                      <span className="metaDot">&bull;</span>
                      <span className="modernOrgMetaItem">{mapCount} maps</span>
                    </div>

                    <div className="modernOrgSpecsRow">
                      <span className="specPill">
                        <Maximize2 size={13} />
                        <span>{organization.canvasWidth || 8000} &times; {organization.canvasHeight || 6000}</span>
                      </span>
                      <span className="specPill timestampPill">
                        <Calendar size={13} />
                        <span>Updated Sep 15, 2025</span>
                      </span>
                    </div>
                  </div>

                  {/* Right Actions */}
                  <div className="modernOrgActions">
                    <Link
                      className="button buttonGhost viewOrgBtn"
                      to={`/maps/${organization.id}`}
                      title="Open public viewer"
                    >
                      <span>View</span>
                      <ArrowRight size={15} />
                    </Link>

                    {isAdmin && (
                      <>
                        <Link
                          className="button buttonGhost editorOrgBtn"
                          to={`/admin/maps/${organization.id}`}
                          title="Open CAD Editor"
                        >
                          <Wrench size={15} />
                          <span>Editor</span>
                        </Link>

                        <button
                          className="button buttonGhost publishOrgBtn"
                          type="button"
                          onClick={() => handlePublish(organization.id)}
                          title="Publish organization maps"
                        >
                          <Rocket size={15} />
                          <span>Publish</span>
                        </button>

                        {isAdminMode && (
                          <button
                            className="button buttonDanger deleteOrgBtn"
                            type="button"
                            disabled={deletingId === organization.id}
                            onClick={() => setDeleteTarget(organization)}
                            title="Delete organization"
                          >
                            <Trash2 size={15} />
                          </button>
                        )}
                      </>
                    )}
                  </div>
                </article>
              );
            })}
          </div>
        </div>
      </main>

      {/* Create Organization Modal */}
      {createModalOpen && (
        <div className="modalBackdrop">
          <div className="modernModalCard" role="dialog" aria-modal="true" aria-labelledby="modal-create-title">
            <div className="modalCardHeader">
              <div className="modalIconBadge">
                <Building2 size={20} />
              </div>
              <div>
                <h2 id="modal-create-title">Create new organization</h2>
                <p>Add a campus map workspace. A Default Campus building will be initialized automatically.</p>
              </div>
              <button
                className="modalCloseBtn"
                onClick={() => setCreateModalOpen(false)}
                aria-label="Close dialog"
              >
                <X size={18} />
              </button>
            </div>

            <form onSubmit={handleCreate} className="modernModalForm">
              <div className="formField">
                <label htmlFor="new-org-name">Organization Name</label>
                <input
                  id="new-org-name"
                  placeholder="e.g. ESI MAIN CAMPUS"
                  value={newOrg.name}
                  onChange={(e) => setNewOrg({ ...newOrg, name: e.target.value })}
                  required
                />
              </div>

              <div className="formField">
                <label htmlFor="new-org-desc">Description</label>
                <input
                  id="new-org-desc"
                  placeholder="Campus location, departments, or details"
                  value={newOrg.description}
                  onChange={(e) => setNewOrg({ ...newOrg, description: e.target.value })}
                />
              </div>

              <div className="formRow">
                <div className="formField">
                  <label htmlFor="new-org-width">Canvas Width (px)</label>
                  <input
                    id="new-org-width"
                    type="number"
                    min="1000"
                    value={newOrg.canvasWidth}
                    onChange={(e) => setNewOrg({ ...newOrg, canvasWidth: e.target.value })}
                  />
                </div>
                <div className="formField">
                  <label htmlFor="new-org-height">Canvas Height (px)</label>
                  <input
                    id="new-org-height"
                    type="number"
                    min="1000"
                    value={newOrg.canvasHeight}
                    onChange={(e) => setNewOrg({ ...newOrg, canvasHeight: e.target.value })}
                  />
                </div>
              </div>

              <div className="modalActions">
                <button
                  type="button"
                  className="button buttonGhost"
                  onClick={() => setCreateModalOpen(false)}
                  disabled={creating}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="button buttonPrimary"
                  disabled={creating}
                >
                  <Plus size={17} />
                  <span>{creating ? 'Creating...' : 'Create organization'}</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Delete Confirmation Modal */}
      {deleteTarget && (
        <ConfirmModal
          title={`Delete ${deleteTarget.name}`}
          confirmLabel={deletingId === deleteTarget.id ? 'Deleting...' : 'Delete organization'}
          disabled={deletingId === deleteTarget.id}
          onCancel={() => setDeleteTarget(null)}
          onConfirm={handleDelete}
        >
          <p>
            All buildings, floors, nodes, and connections in <strong>{deleteTarget.name}</strong> will be permanently removed.
          </p>
          <p>This action cannot be undone.</p>
        </ConfirmModal>
      )}
    </div>
  );
}
