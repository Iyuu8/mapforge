import apiClient from './client';

export async function getCurrentUser() {
  const response = await apiClient.get('/api/user');
  return response.data;
}

export async function login(email, password) {
  const response = await apiClient.post('/api/login_check', { email, password });
  return response.data;
}

export async function logout() {
  const response = await apiClient.post('/api/logout', {});
  return response.data;
}
