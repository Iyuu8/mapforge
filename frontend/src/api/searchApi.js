import apiClient from './client';

export async function searchLocations({ query, organizationId, buildingId, includeBuildings = false }) {
  const response = await apiClient.get('/api/locations/search', {
    params: {
      q: query,
      organizationId,
      buildingId,
      includeBuildings,
    },
  });
  return response.data;
}
