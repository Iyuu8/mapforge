import apiClient from './client';

export async function listRequests(status = 'ALL') {
  const params = status && status !== 'ALL' ? { status } : {};
  const response = await apiClient.get('/api/super-admin/requests', { params });
  return response.data;
}

export async function approveRequest(id) {
  const response = await apiClient.post(`/api/super-admin/requests/${id}/approve`);
  return response.data;
}

export async function rejectRequest(id, reason = '') {
  const response = await apiClient.post(`/api/super-admin/requests/${id}/reject`, { reason });
  return response.data;
}

export async function getStats() {
  const response = await apiClient.get('/api/super-admin/stats');
  return response.data;
}

export async function listAllOrganizations() {
  const response = await apiClient.get('/api/super-admin/organizations');
  return response.data;
}
