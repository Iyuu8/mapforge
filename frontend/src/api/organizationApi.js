import apiClient from './client';

export async function listOrganizations() {
  const response = await apiClient.get('/api/organizations');
  return response.data;
}

export async function getOrganization(organizationId) {
  const response = await apiClient.get(`/api/organizations/${organizationId}`);
  return response.data;
}

export async function listOrganizationBuildings(organizationId) {
  const response = await apiClient.get(`/api/organizations/${organizationId}/buildings`);
  return response.data;
}

export async function createOrganization(payload) {
  const response = await apiClient.post('/api/organizations', payload);
  return response.data;
}

export async function publishOrganization(organizationId) {
  const response = await apiClient.post(`/api/organizations/${organizationId}/publish`);
  return response.data;
}

export async function deleteOrganization(organizationId) {
  const response = await apiClient.delete(`/api/organizations/${organizationId}`);
  return response.data;
}
