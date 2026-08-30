import apiClient from './client';

export async function createBuilding(payload) {
  const response = await apiClient.post('/api/buildings', payload);
  return response.data;
}

export async function updateBuilding(buildingId, payload, { signal } = {}) {
  const response = await apiClient.put(`/api/buildings/${buildingId}`, payload, { signal });
  return response.data;
}

export async function deleteBuilding(buildingId) {
  const response = await apiClient.delete(`/api/buildings/${buildingId}`);
  return response.data;
}

export async function publishBuilding(buildingId) {
  const response = await apiClient.post(`/api/buildings/${buildingId}/publish`);
  return response.data;
}

export async function createFloor(payload) {
  const response = await apiClient.post('/api/floors', payload);
  return response.data;
}

export async function updateFloor(floorId, payload, { signal } = {}) {
  const response = await apiClient.put(`/api/floors/${floorId}`, payload, { signal });
  return response.data;
}

export async function deleteFloor(floorId) {
  const response = await apiClient.delete(`/api/floors/${floorId}`);
  return response.data;
}

export async function createNode(payload) {
  const response = await apiClient.post('/api/nodes', payload);
  return response.data;
}

export async function updateNode(nodeId, payload, { signal } = {}) {
  const response = await apiClient.put(`/api/nodes/${nodeId}`, payload, { signal });
  return response.data;
}

export async function deleteNode(nodeId) {
  const response = await apiClient.delete(`/api/nodes/${nodeId}`);
  return response.data;
}

export async function createEdge(payload) {
  const response = await apiClient.post('/api/edges', payload);
  return response.data;
}

export async function updateEdge(edgeId, payload, { signal } = {}) {
  const response = await apiClient.put(`/api/edges/${edgeId}`, payload, { signal });
  return response.data;
}

export async function deleteEdge(edgeId) {
  const response = await apiClient.delete(`/api/edges/${edgeId}`);
  return response.data;
}

export async function updateOrganization(organizationId, payload, { signal } = {}) {
  const response = await apiClient.put(`/api/organizations/${organizationId}`, payload, { signal });
  return response.data;
}

export async function deleteOrganization(organizationId) {
  const response = await apiClient.delete(`/api/organizations/${organizationId}`);
  return response.data;
}

export async function uploadMedia(file) {
  const formData = new FormData();
  formData.append('file', file);
  const response = await apiClient.post('/api/media/upload', formData, {
    headers: { 'Content-Type': 'multipart/form-data' },
  });
  return response.data;
}