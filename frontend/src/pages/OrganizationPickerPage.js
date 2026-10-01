import { useEffect, useMemo, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import {
  ArrowRight,
  Building,
  Building2,
  Calendar,
  Compass,
  Eye,
  Home,
  LogOut,
  Map,
  Maximize2,
  Menu,
  Plus,
  Rocket,
  Search,
  ShieldCheck,
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
  address: '',
  phone: '',
  canvasWidth: 8000,
  canvasHeight: 6000,
};

export default function OrganizationPickerPage({ mode }) {
  const { isAdmin, isSuperAdmin, isOrganization, isAuthenticated, user, signOut } = useAuth();
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
    return organizations.reduce(
      (acc, org) => acc + (org.buildingCount !== undefined ? org.buildingCount : (org.buildings?.length || 0)),
      0
    );
  }, [organizations]);
  const totalMaps = totalOrgs;

  async function handleCreate(event) {
    event.preventDefault();
    setCreating(true);
    setError(null);
    try {
      await organizationApi.createOrganization({
        name: newOrg.name,
        description: newOrg.description || null,
        address: newOrg.address || null,
        phone: newOrg.phone || null,
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
              onClick={() => setMobileSidebarOpen(false)}
            >
              <Home size={18} />
              <span>Home</span>
            </Link>
            <Link
              to="/maps"
              className={`dashboardNavItem ${!isAdminMode && location.pathname === '/maps' ? 'isActive' : ''}`}
              onClick={() => setMobileSidebarOpen(false)}
            >
              <Map size={18} />
              <span>Browse Maps</span>
            </Link>
            {isSuperAdmin && (
              <Link
                to="/super-admin"
                className="dashboardNavItem superAdminSidebarItem"
                onClick={() => setMobileSidebarOpen(false)}
              >
                <ShieldCheck size={18} />
                <span>Super Admin</span>
              </Link>
            )}
            {isAdmin && (
              <Link
                to="/admin"
                className={`dashboardNavItem ${isAdminMode ? 'isActive' : ''}`}
                onClick={() => setMobileSidebarOpen(false)}
              >
                <Wrench size={18} />
                <span>{isOrganization && !isSuperAdmin ? 'My Studio' : 'Admin Workspace'}</span>
              </Link>
            )}
          </nav>
        </div>

        {/* Sidebar Footer User Info */}
        <div className="dashboardSidebarFooter">
          <div className="dashboardUserProfile">
            <div className="userAvatarCircle">{userInitial}</div>
            <div className="userMeta">
              <span className="userName">{isAdmin ? 'Admin' : userName}</span>
              <span className="userEmail">{user?.email || (isAuthenticated ? 'Signed in' : 'Guest viewer')}</span>
            </div>
          </div>
          {isAuthenticated ? (
            <button
              className="dashboardSignOutBtn"
              type="button"
              onClick={signOut}
              title="Sign out"
              aria-label="Sign out"
            >
              <LogOut size={16} />
            </button>
          ) : (
            <Link
              to="/login"
              className="dashboardSignOutBtn"
              title="Sign in"
              aria-label="Sign in"
            >
              <ArrowRight size={16} />
            </Link>
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
            {isAdminMode && isAdmin && (
              <button
                className="button buttonPrimary createOrgTopBtn"
                onClick={() => setCreateModalOpen(true)}
              >
                <Plus size={16} />
                <span>New Organization</span>
              </button>
            )}
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
              <h1 className="welcomeTitle">
                {isAdminMode
                  ? 'Manage your organizations and campus maps.'
                  : 'Explore interactive campus maps.'}
              </h1>
              <p className="welcomeDescription">
                {isAdminMode
                  ? 'Access CAD-grade floorplan authoring, manage indoor spaces, and publish navigation graphs.'
                  : 'Browse navigable campus maps, locate buildings, and explore multi-floor paths without signing in.'}
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

          {isSuperAdmin && (
            <div className="superAdminPortalBanner">
              <div className="saPortalBannerLeft">
                <div className="saPortalIcon">
                  <ShieldCheck size={22} color="#6366f1" />
                </div>
                <div>
                  <h4>Super Admin Access Control Active</h4>
                  <p>Validate pending organization creation requests and manage platform accounts.</p>
                </div>
              </div>
              <Link to="/super-admin" className="button buttonPrimary saPortalBannerBtn">
                <span>Manage Organization Requests</span>
                <ArrowRight size={16} />
              </Link>
            </div>
          )}

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
                <span className="metricValue">{totalBuildings}</span>
                <span className="metricLabel">Buildings</span>
              </div>
            </div>

            <div className="metricCard metricCardGreen">
              <div className="metricIconWrapper">
                <Map size={22} />
              </div>
              <div className="metricDetails">
                <span className="metricValue">{totalMaps}</span>
                <span className="metricLabel">Campus Maps</span>
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
            {filteredOrganizations.map((organization) => {
              const buildingCount = organization.buildingCount !== undefined
                ? organization.buildingCount
                : (organization.buildings?.length || 0);

              const createdDate = organization.createdAt
                ? new Date(organization.createdAt).toLocaleDateString(undefined, {
                    month: 'short',
                    day: 'numeric',
                    year: 'numeric',
                  })
                : 'Active';

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
                      {organization.isOwner ? (
                        <span className="orgStatusBadge ownerBadge">Your Organization</span>
                      ) : organization.canEdit === false && isAdminMode ? (
                        <span className="orgStatusBadge otherOrgBadge">Other Organization</span>
                      ) : (
                        <span className="orgStatusBadge campusBadge">Campus</span>
                      )}
                    </div>

                    <div className="modernOrgMetaRow">
                      <span className="modernOrgMetaItem">
                        {buildingCount} {buildingCount === 1 ? 'building' : 'buildings'}
                      </span>
                      <span className="metaDot">&bull;</span>
                      <span className="modernOrgMetaItem">1 campus map</span>
                      {organization.address && (
                        <>
                          <span className="metaDot">&bull;</span>
                          <span className="modernOrgMetaItem orgAddressMeta">
                            {organization.address}
                          </span>
                        </>
                      )}
                      {organization.description && (
                        <>
                          <span className="metaDot">&bull;</span>
                          <span
                            className="modernOrgMetaItem"
                            style={{
                              maxWidth: 240,
                              overflow: 'hidden',
                              textOverflow: 'ellipsis',
                              whiteSpace: 'nowrap',
                            }}
                          >
                            {organization.description}
                          </span>
                        </>
                      )}
                    </div>

                    <div className="modernOrgSpecsRow">
                      <span className="specPill">
                        <Maximize2 size={13} />
                        <span>{organization.canvasWidth || 8000} &times; {organization.canvasHeight || 6000}</span>
                      </span>
                      <span className="specPill timestampPill">
                        <Calendar size={13} />
                        <span>Created {createdDate}</span>
                      </span>
                    </div>
                  </div>

                  {/* Right Actions */}
                  <div className="modernOrgActions">
                    {!isAdminMode ? (
                      <>
                        <Link
                          className="button buttonPrimary exploreOrgBtn"
                          to={`/maps/${organization.id}`}
                          title="Explore campus map"
                        >
                          <Compass size={16} />
                          <span>Explore Map</span>
                        </Link>
                        {isAdmin && organization.canEdit !== false && (
                          <Link
                            className="button buttonGhost editorOrgBtn"
                            to={`/admin/maps/${organization.id}`}
                            title="Open CAD Editor"
                          >
                            <Wrench size={15} />
                            <span>Editor</span>
                          </Link>
                        )}
                      </>
                    ) : organization.canEdit === false ? (
                      <div className="readOnlyOrgActionRow">
                        <Link
                          className="button buttonSecondary exploreOrgBtn"
                          to={`/maps/${organization.id}`}
                          title="Explore campus map (view-only)"
                        >
                          <Eye size={15} />
                          <span>View Map</span>
                        </Link>
                        <span className="readOnlyActionHint">No edit access</span>
                      </div>
                    ) : (
                      <>
                        <Link
                          className="button buttonPrimary editorOrgBtn"
                          to={`/admin/maps/${organization.id}`}
                          title="Open CAD Editor"
                        >
                          <Wrench size={15} />
                          <span>CAD Editor</span>
                        </Link>
                        <Link
                          className="button buttonGhost viewOrgBtn"
                          to={`/maps/${organization.id}`}
                          title="Preview public viewer"
                        >
                          <Eye size={15} />
                          <span>Preview</span>
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
                        <button
                          className="button buttonDanger deleteOrgBtn"
                          type="button"
                          disabled={deletingId === organization.id}
                          onClick={() => setDeleteTarget(organization)}
                          title="Delete organization"
                        >
                          <Trash2 size={15} />
                        </button>
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
                  <label htmlFor="new-org-address">Address</label>
                  <input
                    id="new-org-address"
                    placeholder="e.g. 123 Campus Way"
                    value={newOrg.address}
                    onChange={(e) => setNewOrg({ ...newOrg, address: e.target.value })}
                  />
                </div>
                <div className="formField">
                  <label htmlFor="new-org-phone">Phone Number</label>
                  <input
                    id="new-org-phone"
                    placeholder="e.g. +1 (555) 019-2831"
                    value={newOrg.phone}
                    onChange={(e) => setNewOrg({ ...newOrg, phone: e.target.value })}
                  />
                </div>
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
