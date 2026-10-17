import axios from 'axios';
import {
  getAccessToken,
  setAccessToken,
  clearAccessToken,
  getSessionEpoch,
} from './tokenStore';

const baseURL = import.meta.env.VITE_API_BASE_URL || 'http://localhost:5000/api/v1';

export const apiClient = axios.create({
  baseURL,
  withCredentials: true, // sends the httpOnly refresh-token cookie
  timeout: 15000,
});

// A separate, interceptor-free instance for the refresh call itself.
// Using `apiClient` here would let a 401 FROM /auth/refresh-token
// re-trigger apiClient's own response interceptor below.
const refreshClient = axios.create({
  baseURL,
  withCredentials: true,
  timeout: 15000,
});

apiClient.interceptors.request.use((config) => {
  const token = getAccessToken();
  if (token && !config.headers?.Authorization) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

/**
 * Single-flight refresh coordinator shared by BOTH:
 * 1. AuthContext's initial bootstrap (`refreshTokenRequest`)
 * 2. apiClient's 401 response interceptor
 *
 * This guarantees that React 18 StrictMode double-mounts or concurrent 401
 * responses never fire parallel POST /auth/refresh-token requests with the
 * same single-use refresh token cookie.
 */
let refreshPromise = null;

export const refreshSession = () => {
  if (!refreshPromise) {
    const startEpoch = getSessionEpoch();

    refreshPromise = refreshClient
      .post('/auth/refresh-token')
      .then((response) => {
        // If logout/clearAccessToken happened while this request was in flight,
        // discard the refreshed token so a logged-out session is never restored.
        if (getSessionEpoch() !== startEpoch) {
          const abortErr = new Error('Session was cleared during token refresh.');
          abortErr.isCancelledByLogout = true;
          throw abortErr;
        }

        const token = response?.data?.data?.accessToken ?? null;
        if (token) {
          setAccessToken(token);
        }
        return response;
      })
      .finally(() => {
        refreshPromise = null;
      });
  }

  return refreshPromise;
};

const performRefresh = async () => {
  const response = await refreshSession();
  return response?.data?.data?.accessToken ?? null;
};

apiClient.interceptors.response.use(
  (response) => response,
  async (error) => {
    const { config, response } = error;
    const isAuthEndpoint = [
      '/auth/login',
      '/auth/register',
      '/auth/refresh-token',
      '/auth/logout',
    ].some((path) => config?.url?.includes(path));

    if (response?.status === 401 && config && !config._retried && !isAuthEndpoint) {
      config._retried = true; // exactly one retry attempt per request — never a retry loop

      try {
        const token = await performRefresh();
        if (token) {
          config.headers = config.headers || {};
          config.headers.Authorization = `Bearer ${token}`;
          return apiClient(config);
        }
      } catch (refreshError) {
        const refreshStatus = refreshError?.response?.status;
        if (refreshStatus === 401 || refreshStatus === 403) {
          clearAccessToken();
          if (typeof window !== 'undefined') {
            window.dispatchEvent(new Event('auth:logout'));
          }
        }
      }
    }

    return Promise.reject(error);
  }
);

export default apiClient;
