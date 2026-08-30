import apiClient from './client';

export async function getOrganizationMap(organizationId) {
  const response = await apiClient.get(`/api/map/${organizationId}`, {
    params: { type: 'organization' },
  });
  return response.data;
}

export async function getBuildingMap(buildingId) {
  const response = await apiClient.get(`/api/map/${buildingId}`, {
    params: { type: 'building' },
  });
  return response.data;
}
