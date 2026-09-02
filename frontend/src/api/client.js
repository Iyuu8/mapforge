import axios from 'axios';
import { normalizeApiError } from '../utils/apiErrors';

const API_URL = process.env.REACT_APP_API_URL;

const apiClient = axios.create({
  baseURL: API_URL,
  withCredentials: true,
  headers: {
    'Content-Type': 'application/json',
    'X-Client-Type': 'web',
  },
});

let refreshPromise = null;

apiClient.interceptors.response.use(
  (response) => response,
  async (error) => {
    const originalRequest = error.config || {};
    const status = error.response?.status;
    const isRefreshRequest = originalRequest.url?.includes('/api/token/refresh');
    const isLoginRequest = originalRequest.url?.includes('/api/login_check');
    const isUserBootRequest = originalRequest.url?.includes('/api/user');

    if (
      status === 401 &&
      !originalRequest._retry &&
      !isRefreshRequest &&
      !isLoginRequest &&
      !isUserBootRequest
    ) {
      originalRequest._retry = true;
      refreshPromise ||= apiClient
        .post('/api/token/refresh', {})
        .finally(() => {
          refreshPromise = null;
        });

      await refreshPromise;
      return apiClient(originalRequest);
    }

    return Promise.reject(normalizeApiError(error));
  }
);

export default apiClient;
