import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { Eye, Plus, Rocket, Trash2, Wrench } from 'lucide-react';
import * as organizationApi from '../api/organizationApi';
import AppTopbar from '../components/common/AppTopbar';
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
  const { isAdmin } = useAuth();
  const [organizations, setOrganizations] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [newOrg, setNewOrg] = useState(emptyNewOrg);
  const [creating, setCreating] = useState(false);
  const [deletingId, setDeletingId] = useState(null);
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [publishResult, setPublishResult] = useState(null);

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

  const sortedOrganizations = useMemo(
    () => [...organizations].sort((a, b) => a.name.localeCompare(b.name)),
    [organizations]
  );

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

  return (
    <div className="appFrame">
      <AppTopbar />
      <main className="pickerPage">
        <section className="pageHeader">
          <p className="eyebrow">{isAdminMode ? 'Admin workspace' : 'Public viewer'}</p>
          <h1>{isAdminMode ? 'Choose an organization to edit' : 'Choose an organization to browse'}</h1>
          <p>
            {isAdminMode
              ? 'Open the Figma-style editor, publish individual maps, or publish an entire organization.'
              : 'Open published maps without signing in. Admins can also jump directly into the editor.'}
          </p>
        </section>

        {error ? (
          <StatusMessage title={error.code || 'Request failed'} tone="error">
            {error.message}
          </StatusMessage>
        ) : null}

        {publishResult ? (
          <StatusMessage title={publishResult.success ? 'Publish complete' : 'Publish needs attention'} tone={publishResult.success ? 'success' : 'warning'}>
            {(publishResult.results || [])
              .map((result) => `${result.name}: ${result.success ? 'published' : result.errors.join(', ')}`)
              .join(' | ')}
          </StatusMessage>
        ) : null}

        {isAdminMode && isAdmin ? (
          <section className="createOrgPanel" aria-label="Create organization">
            <div>
              <h2>New organization</h2>
              <p>Create the map container accepted by the backend. A Default Campus is created server-side.</p>
            </div>
            <form className="createOrgForm" onSubmit={handleCreate}>
              <input
                aria-label="Organization name"
                placeholder="Organization name"
                value={newOrg.name}
                onChange={(event) => setNewOrg({ ...newOrg, name: event.target.value })}
                required
              />
              <input
                aria-label="Description"
                placeholder="Description"
                value={newOrg.description}
                onChange={(event) => setNewOrg({ ...newOrg, description: event.target.value })}
              />
              <input
                aria-label="Canvas width"
                type="number"
                min="1000"
                value={newOrg.canvasWidth}
                onChange={(event) => setNewOrg({ ...newOrg, canvasWidth: event.target.value })}
              />
              <input
                aria-label="Canvas height"
                type="number"
                min="1000"
                value={newOrg.canvasHeight}
                onChange={(event) => setNewOrg({ ...newOrg, canvasHeight: event.target.value })}
              />
              <button className="button buttonPrimary" type="submit" disabled={creating}>
                <Plus size={18} />
                {creating ? 'Creating...' : 'Create'}
              </button>
            </form>
          </section>
        ) : null}

        {loading ? (
          <StatusMessage title="Loading organizations">Fetching maps from the backend.</StatusMessage>
        ) : null}

        {!loading && sortedOrganizations.length === 0 ? (
          <StatusMessage title="No organizations yet" tone="warning">
            {isAdminMode ? 'Create one to start the map hierarchy.' : 'Nothing is available to browse yet.'}
          </StatusMessage>
        ) : null}

        <section className="organizationGrid" aria-label="Organizations">
          {sortedOrganizations.map((organization) => (
            <article className="organizationCard" key={organization.id}>
              <div
                className="organizationPreview"
                style={{
                  '--canvas-ratio': `${Math.max(organization.canvasWidth || 1, 1)} / ${Math.max(organization.canvasHeight || 1, 1)}`,
                }}
              >
                <span>{organization.canvasWidth || 8000} x {organization.canvasHeight || 6000}</span>
              </div>
              <div className="organizationBody">
                <h2>{organization.name}</h2>
                <p>{organization.description || 'No description yet.'}</p>
              </div>
              <div className="organizationActions">
                <Link className="button buttonGhost" to={`/maps/${organization.id}`}>
                  <Eye size={16} />
                  View
                </Link>
                {isAdmin ? (
                  <>
                    <Link className="button buttonPrimary" to={`/admin/maps/${organization.id}`}>
                      <Wrench size={16} />
                      Editor
                    </Link>
                    <button className="button buttonSubtle" type="button" onClick={() => handlePublish(organization.id)}>
                      <Rocket size={16} />
                      Publish
                    </button>
                    {isAdminMode ? (
                      <button className="button buttonDanger" type="button" disabled={deletingId === organization.id} onClick={() => setDeleteTarget(organization)}>
                        <Trash2 size={16} />
                        {deletingId === organization.id ? 'Deleting...' : 'Delete'}
                      </button>
                    ) : null}
                  </>
                ) : null}
              </div>
            </article>
          ))}
        </section>
      </main>
      {deleteTarget ? (
        <ConfirmModal
          title={`Delete ${deleteTarget.name}`}
          confirmLabel={deletingId === deleteTarget.id ? 'Deleting...' : 'Delete organization'}
          disabled={deletingId === deleteTarget.id}
          onCancel={() => setDeleteTarget(null)}
          onConfirm={handleDelete}
        >
          <p>All buildings, floors, nodes, and connections in this organization will be removed.</p>
          <p>This action cannot be undone.</p>
        </ConfirmModal>
      ) : null}
    </div>
  );
}
