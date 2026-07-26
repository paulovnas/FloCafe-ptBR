import axios from 'axios';

// Derived from the page's own origin (not a build-time env var) so LAN
// clients that load the app via the server's IP — e.g. http://192.168.1.5:3001 —
// talk back to that same host instead of a hardcoded "localhost", which would
// resolve to the client's own machine and fail. Matches the pattern already
// used by the standalone KDS client (kds-standalone/page.tsx), which works
// correctly over LAN today for the same reason.
const api = axios.create({
  baseURL: typeof window !== 'undefined' ? `${window.location.origin}/api` : '/api',
  headers: {
    'Content-Type': 'application/json',
    'Accept': 'application/json',
  },
});

// Attach JWT token to every request
api.interceptors.request.use((config) => {
  if (typeof window !== 'undefined') {
    const token = localStorage.getItem('token');
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }
  }
  return config;
});

// Handle 401 responses
api.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401 && typeof window !== 'undefined') {
      // KDS routes render their own inline login. The waiter order pad also
      // owns its login screen; reload it after clearing stale tenant state
      // instead of stranding the device on the desktop POS login route.
      const pathname = window.location.pathname;
      const isKdsPath = pathname.startsWith('/kds');
      const isWaiterPath = pathname.startsWith('/waiter');
      localStorage.removeItem('token');
      if (isWaiterPath) {
        localStorage.removeItem('tenant');
        window.location.reload();
        return Promise.reject(error);
      }
      if (isKdsPath) return Promise.reject(error);
      // Don't redirect when already on the login page — let the login handler show the error
      if (!window.location.pathname.includes('/auth/login')) {
        localStorage.removeItem('tenant');
        window.location.href = '/auth/login';
      }
    }
    return Promise.reject(error);
  }
);

export default api;
