import apiClient from './client';

export async function findRoute({ sourceId, destinationId, accessibleOnly = false }) {
  const response = await apiClient.get('/api/routes/find', {
    params: {
      sourceId,
      destinationId,
      accessibleOnly,
    },
  });
  return response.data;
}
