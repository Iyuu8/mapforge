import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  AlertTriangle,
  Building,
  CheckCircle2,
  Clock,
  Compass,
  ExternalLink,
  Eye,
  Mail,
  MapPin,
  Phone,
  RefreshCw,
  Search,
  ShieldCheck,
  XCircle,
} from 'lucide-react';
import * as superAdminApi from '../api/superAdminApi';
import AppTopbar from '../components/common/AppTopbar';
import StatusMessage from '../components/common/StatusMessage';

export default function SuperAdminDashboardPage() {
  const [requests, setRequests] = useState([]);
  const [organizations, setOrganizations] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  // Active view tab: 'PENDING' | 'APPROVED' | 'REJECTED' | 'ALL' | 'ORGS'
  const [activeTab, setActiveTab] = useState('PENDING');
  const [searchQuery, setSearchQuery] = useState('');

  // Modals
  const [approveTarget, setApproveTarget] = useState(null);
  const [rejectTarget, setRejectTarget] = useState(null);
  const [rejectReason, setRejectReason] = useState('');
  const [actionProcessing, setActionProcessing] = useState(false);
  const [toastMessage, setToastMessage] = useState(null);

  async function loadData() {
    setLoading(true);
    setError(null);
    try {
      const [reqsData, orgsData] = await Promise.all([
        superAdminApi.listRequests('ALL').catch(() => []),
        superAdminApi.listAllOrganizations().catch(() => []),
      ]);

      setRequests(Array.isArray(reqsData) ? reqsData : []);
      setOrganizations(Array.isArray(orgsData) ? orgsData : []);
    } catch (err) {
      setError(err);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadData();
  }, []);

  async function handleApproveConfirm() {
    if (!approveTarget) return;
    setActionProcessing(true);
    setError(null);

    try {
      await superAdminApi.approveRequest(approveTarget.id);
      setToastMessage({
        tone: 'success',
        text: `Organization "${approveTarget.organizationName}" approved! Account activated for ${approveTarget.email}.`,
      });
      setApproveTarget(null);
      await loadData();
    } catch (err) {
      setError(err);
    } finally {
      setActionProcessing(false);
    }
  }

  async function handleRejectConfirm() {
    if (!rejectTarget) return;
    setActionProcessing(true);
    setError(null);

    try {
      await superAdminApi.rejectRequest(rejectTarget.id, rejectReason);
      setToastMessage({
        tone: 'warning',
        text: `Organization request from ${rejectTarget.email} was rejected.`,
      });
      setRejectTarget(null);
      setRejectReason('');
      await loadData();
    } catch (err) {
      setError(err);
    } finally {
      setActionProcessing(false);
    }
  }

  // Filter requests based on active tab and search query
  const filteredRequests = useMemo(() => {
    let list = [...requests];
    if (activeTab !== 'ALL') {
      list = list.filter((r) => r.status === activeTab);
    }

    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      list = list.filter(
        (r) =>
          r.organizationName?.toLowerCase().includes(q) ||
          r.email?.toLowerCase().includes(q) ||
          r.address?.toLowerCase().includes(q) ||
          r.phone?.toLowerCase().includes(q)
      );
    }

    return list;
  }, [requests, activeTab, searchQuery]);

  // Filter organizations for the organizations tab
  const filteredOrgs = useMemo(() => {
    let list = [...organizations];
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      list = list.filter(
        (o) =>
          o.name?.toLowerCase().includes(q) ||
          o.owner?.email?.toLowerCase().includes(q) ||
          o.address?.toLowerCase().includes(q)
      );
    }
    return list;
  }, [organizations, searchQuery]);

  const pendingCount = useMemo(() => {
    return requests.filter((r) => r.status === 'PENDING').length;
  }, [requests]);

  const approvedCount = useMemo(() => {
    return requests.filter((r) => r.status === 'APPROVED').length;
  }, [requests]);

  const rejectedCount = useMemo(() => {
    return requests.filter((r) => r.status === 'REJECTED').length;
  }, [requests]);

  return (
    <div className="superAdminLayout">
      <AppTopbar />

      <main className="superAdminMain">
        {/* Header Hero Banner */}
        <section className="superAdminHeader">
          <div className="superAdminHeaderLeft">
            <div className="superAdminRoleBadge">
              <ShieldCheck size={16} />
              <span>Super Admin Authority</span>
            </div>
            <h1>Organization Verification & Access Control</h1>
            <p>
              Review, validate, and approve organization account requests. Manage platform-wide
              multi-tenant security and horizontal authorization boundaries.
            </p>
          </div>

          <div className="superAdminHeaderRight">
            <button
              className="button buttonSecondary superAdminRefreshBtn"
              onClick={loadData}
              disabled={loading}
              title="Refresh requests and stats"
            >
              <RefreshCw size={16} className={loading ? 'spinIcon' : ''} />
              <span>Refresh Data</span>
            </button>
          </div>
        </section>

        {/* Global Toast / Feedback */}
        {toastMessage && (
          <div className={`superAdminToast ${toastMessage.tone}`}>
            {toastMessage.tone === 'success' ? (
              <CheckCircle2 size={18} />
            ) : (
              <AlertTriangle size={18} />
            )}
            <span>{toastMessage.text}</span>
            <button
              className="toastCloseBtn"
              onClick={() => setToastMessage(null)}
              aria-label="Dismiss"
            >
              &times;
            </button>
          </div>
        )}

        {/* Error Alert */}
        {error && (
          <StatusMessage title={error.code || 'Operation error'} tone="error">
            {error.message || 'An error occurred while processing the request.'}
          </StatusMessage>
        )}

        {/* KPI Stats Cards */}
        <section className="superAdminStatsGrid">
          <div
            className={`superAdminStatCard ${pendingCount > 0 ? 'hasPending' : ''}`}
            onClick={() => setActiveTab('PENDING')}
            role="button"
            tabIndex={0}
          >
            <div className="statIconWrapper pendingIcon">
              <Clock size={24} />
            </div>
            <div className="statContent">
              <span className="statLabel">Pending Approvals</span>
              <div className="statValueRow">
                <span className="statValue">{pendingCount}</span>
                {pendingCount > 0 && <span className="statPillPulse">Action required</span>}
              </div>
            </div>
          </div>

          <div
            className="superAdminStatCard"
            onClick={() => setActiveTab('APPROVED')}
            role="button"
            tabIndex={0}
          >
            <div className="statIconWrapper approvedIcon">
              <CheckCircle2 size={24} />
            </div>
            <div className="statContent">
              <span className="statLabel">Approved Requests</span>
              <span className="statValue">{approvedCount}</span>
            </div>
          </div>

          <div
            className="superAdminStatCard"
            onClick={() => setActiveTab('REJECTED')}
            role="button"
            tabIndex={0}
          >
            <div className="statIconWrapper rejectedIcon">
              <XCircle size={24} />
            </div>
            <div className="statContent">
              <span className="statLabel">Rejected Requests</span>
              <span className="statValue">{rejectedCount}</span>
            </div>
          </div>

          <div
            className="superAdminStatCard"
            onClick={() => setActiveTab('ORGS')}
            role="button"
            tabIndex={0}
          >
            <div className="statIconWrapper orgIcon">
              <Building size={24} />
            </div>
            <div className="statContent">
              <span className="statLabel">Total Active Maps</span>
              <span className="statValue">{organizations.length}</span>
            </div>
          </div>
        </section>

        {/* Control Toolbar & Filter Tabs */}
        <section className="superAdminControlsBar">
          <div className="superAdminTabs">
            <button
              className={`saTabBtn ${activeTab === 'PENDING' ? 'active' : ''}`}
              onClick={() => setActiveTab('PENDING')}
            >
              <span>Pending Requests</span>
              {pendingCount > 0 && <span className="saTabBadge">{pendingCount}</span>}
            </button>
            <button
              className={`saTabBtn ${activeTab === 'APPROVED' ? 'active' : ''}`}
              onClick={() => setActiveTab('APPROVED')}
            >
              <span>Approved</span>
            </button>
            <button
              className={`saTabBtn ${activeTab === 'REJECTED' ? 'active' : ''}`}
              onClick={() => setActiveTab('REJECTED')}
            >
              <span>Rejected</span>
            </button>
            <button
              className={`saTabBtn ${activeTab === 'ALL' ? 'active' : ''}`}
              onClick={() => setActiveTab('ALL')}
            >
              <span>All Requests</span>
            </button>
            <button
              className={`saTabBtn ${activeTab === 'ORGS' ? 'active' : ''}`}
              onClick={() => setActiveTab('ORGS')}
            >
              <span>All Organizations ({organizations.length})</span>
            </button>
          </div>

          <div className="saSearchWrapper">
            <Search size={16} className="saSearchIcon" />
            <input
              type="text"
              placeholder="Search by org name, email, phone..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="saSearchInput"
            />
            {searchQuery && (
              <button className="saSearchClear" onClick={() => setSearchQuery('')}>
                &times;
              </button>
            )}
          </div>
        </section>

        {/* Main Content Area */}
        <section className="superAdminContentPanel">
          {activeTab !== 'ORGS' ? (
            /* Requests Table / Cards View */
            <div className="saRequestsContainer">
              {filteredRequests.length === 0 ? (
                <div className="saEmptyState">
                  <ShieldCheck size={48} color="#94a3b8" />
                  <h3>No requests found</h3>
                  <p>
                    {activeTab === 'PENDING'
                      ? 'There are no pending organization requests awaiting review at this time.'
                      : `No ${activeTab.toLowerCase()} requests match your current filters.`}
                  </p>
                </div>
              ) : (
                <div className="saRequestsList">
                  {filteredRequests.map((req) => (
                    <article key={req.id} className={`saRequestCard ${req.status.toLowerCase()}`}>
                      <div className="saRequestCardHeader">
                        <div className="saReqTitleBlock">
                          <div className="saOrgAvatar">
                            {req.organizationName?.[0]?.toUpperCase() || 'O'}
                          </div>
                          <div>
                            <h3 className="saOrgName">{req.organizationName}</h3>
                            <span className="saReqDate">
                              Submitted: {new Date(req.createdAt).toLocaleDateString()} at{' '}
                              {new Date(req.createdAt).toLocaleTimeString([], {
                                hour: '2-digit',
                                minute: '2-digit',
                              })}
                            </span>
                          </div>
                        </div>

                        <div className="saStatusBadgeRow">
                          <span className={`saStatusBadge ${req.status.toLowerCase()}`}>
                            {req.status === 'PENDING' && <Clock size={13} />}
                            {req.status === 'APPROVED' && <CheckCircle2 size={13} />}
                            {req.status === 'REJECTED' && <XCircle size={13} />}
                            <span>{req.status}</span>
                          </span>
                        </div>
                      </div>

                      {/* Request Details Grid */}
                      <div className="saRequestDetailsGrid">
                        <div className="saDetailItem">
                          <Mail size={15} />
                          <div>
                            <span className="saDetailLabel">Account Email</span>
                            <span className="saDetailValue">{req.email}</span>
                          </div>
                        </div>

                        <div className="saDetailItem">
                          <Phone size={15} />
                          <div>
                            <span className="saDetailLabel">Phone Number</span>
                            <span className="saDetailValue">{req.phone}</span>
                          </div>
                        </div>

                        <div className="saDetailItem saSpanTwo">
                          <MapPin size={15} />
                          <div>
                            <span className="saDetailLabel">Organization Address</span>
                            <span className="saDetailValue">{req.address}</span>
                          </div>
                        </div>
                      </div>

                      {req.description && (
                        <div className="saDescriptionBlock">
                          <span className="saDetailLabel">Description / Notes</span>
                          <p>{req.description}</p>
                        </div>
                      )}

                      {/* Rejection reason if rejected */}
                      {req.status === 'REJECTED' && req.rejectionReason && (
                        <div className="saRejectionNotice">
                          <AlertTriangle size={15} />
                          <span>Rejection Reason: {req.rejectionReason}</span>
                        </div>
                      )}

                      {/* Created Organization Link if approved */}
                      {req.status === 'APPROVED' && req.createdOrganization && (
                        <div className="saApprovedMetaBar">
                          <span>
                            Created Organization ID: #{req.createdOrganization.id} (
                            {req.createdOrganization.name})
                          </span>
                          <Link
                            to={`/admin/maps/${req.createdOrganization.id}`}
                            className="saViewMapLink"
                          >
                            <span>Open Map Studio</span>
                            <ExternalLink size={14} />
                          </Link>
                        </div>
                      )}

                      {/* Actions for PENDING */}
                      {req.status === 'PENDING' && (
                        <div className="saCardActions">
                          <button
                            className="button buttonPrimary saApproveBtn"
                            onClick={() => setApproveTarget(req)}
                          >
                            <CheckCircle2 size={16} />
                            <span>Approve & Create Organization</span>
                          </button>

                          <button
                            className="button buttonSecondary saRejectBtn"
                            onClick={() => {
                              setRejectTarget(req);
                              setRejectReason('');
                            }}
                          >
                            <XCircle size={16} />
                            <span>Reject Request</span>
                          </button>
                        </div>
                      )}
                    </article>
                  ))}
                </div>
              )}
            </div>
          ) : (
            /* Organizations Directory View */
            <div className="saOrgsContainer">
              <div className="saOrgsHeader">
                <h2>All Platform Organizations</h2>
                <p>
                  Every organization account has full horizontal isolation over their respective
                  maps. Super Admins hold global oversight.
                </p>
              </div>

              {filteredOrgs.length === 0 ? (
                <div className="saEmptyState">
                  <Building size={48} color="#94a3b8" />
                  <h3>No organizations found</h3>
                </div>
              ) : (
                <div className="saOrgsTableWrapper">
                  <table className="saTable">
                    <thead>
                      <tr>
                        <th>ID</th>
                        <th>Organization Name</th>
                        <th>Owner Account</th>
                        <th>Address</th>
                        <th>Phone</th>
                        <th>Buildings</th>
                        <th>Canvas Size</th>
                        <th>Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filteredOrgs.map((org) => (
                        <tr key={org.id}>
                          <td>#{org.id}</td>
                          <td className="saFontBold">{org.name}</td>
                          <td>
                            {org.owner ? (
                              <span className="saOwnerTag">{org.owner.email}</span>
                            ) : (
                              <span className="saUnassignedTag">Unassigned / Legacy</span>
                            )}
                          </td>
                          <td className="saTextTruncate">{org.address || '—'}</td>
                          <td>{org.phone || '—'}</td>
                          <td>{org.buildingCount || 0}</td>
                          <td>
                            {org.canvasWidth} &times; {org.canvasHeight}
                          </td>
                          <td>
                            <div className="saTableActions">
                              <Link
                                to={`/maps/${org.id}`}
                                className="button buttonSecondary saTableBtn"
                                title="Public View"
                              >
                                <Eye size={14} />
                              </Link>
                              <Link
                                to={`/admin/maps/${org.id}`}
                                className="button buttonPrimary saTableBtn"
                                title="Edit in Studio"
                              >
                                <Compass size={14} />
                                <span>Studio</span>
                              </Link>
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}
        </section>
      </main>

      {/* APPROVE MODAL */}
      {approveTarget && (
        <div className="saModalOverlay" onClick={() => setApproveTarget(null)}>
          <div className="saModalCard" onClick={(e) => e.stopPropagation()}>
            <div className="saModalHeader">
              <div className="saModalIcon approve">
                <CheckCircle2 size={24} />
              </div>
              <div>
                <h3>Approve Organization Request</h3>
                <p>Activate organization account and initialize map workspace</p>
              </div>
            </div>

            <div className="saModalBody">
              <p>
                You are about to approve <strong>{approveTarget.organizationName}</strong>. This
                will perform the following actions:
              </p>
              <ul className="saModalList">
                <li>
                  Activate or create user account for <strong>{approveTarget.email}</strong> with{' '}
                  <code>ROLE_ORGANIZATION</code>.
                </li>
                <li>
                  Create Organization <strong>{approveTarget.organizationName}</strong> with address{' '}
                  <em>{approveTarget.address}</em>.
                </li>
                <li>
                  Generate the <strong>Default Campus</strong> workspace container for their indoor
                  maps.
                </li>
                <li>Enforce horizontal authorization so they only access their own maps.</li>
              </ul>
            </div>

            <div className="saModalFooter">
              <button
                className="button buttonSecondary"
                onClick={() => setApproveTarget(null)}
                disabled={actionProcessing}
              >
                Cancel
              </button>
              <button
                className="button buttonPrimary saApproveBtn"
                onClick={handleApproveConfirm}
                disabled={actionProcessing}
              >
                {actionProcessing ? 'Processing...' : 'Confirm & Validate Organization'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* REJECT MODAL */}
      {rejectTarget && (
        <div className="saModalOverlay" onClick={() => setRejectTarget(null)}>
          <div className="saModalCard" onClick={(e) => e.stopPropagation()}>
            <div className="saModalHeader">
              <div className="saModalIcon reject">
                <XCircle size={24} />
              </div>
              <div>
                <h3>Reject Organization Request</h3>
                <p>Decline application for {rejectTarget.organizationName}</p>
              </div>
            </div>

            <div className="saModalBody">
              <p>
                Provide an optional reason for rejecting the request from{' '}
                <strong>{rejectTarget.email}</strong>:
              </p>
              <textarea
                rows={3}
                className="saModalTextarea"
                placeholder="e.g. Incomplete address verification, duplicate entity..."
                value={rejectReason}
                onChange={(e) => setRejectReason(e.target.value)}
              />
            </div>

            <div className="saModalFooter">
              <button
                className="button buttonSecondary"
                onClick={() => setRejectTarget(null)}
                disabled={actionProcessing}
              >
                Cancel
              </button>
              <button
                className="button saRejectBtn saDangerSolid"
                onClick={handleRejectConfirm}
                disabled={actionProcessing}
              >
                {actionProcessing ? 'Rejecting...' : 'Reject Request'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
