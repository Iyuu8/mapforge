export function normalizeApiError(error) {
  if (error?.status || error?.message) {
    return error;
  }

  const status = error.response?.status || 0;
  const payload = error.response?.data;

  if (!error.response) {
    return {
      status,
      code: 'NETWORK_ERROR',
      message: 'Unable to reach the MapForge API.',
      fieldErrors: null,
      errors: [],
      raw: error,
    };
  }

  return {
    status,
    code: payload?.type || payload?.code || `HTTP_${status}`,
    title: payload?.title || null,
    message: payload?.detail || payload?.message || 'The server could not complete the request.',
    fieldErrors: payload?.fieldErrors || payload?.violations || null,
    errors: payload?.errors || [],
    raw: payload,
  };
}
