import axios from 'axios';
import * as SecureStore from 'expo-secure-store';

import { API_BASE_URL } from '../config/env';

const api = axios.create({
  baseURL: API_BASE_URL,
  timeout: 20000,
  withCredentials: true,
  headers: { 'X-Client-Platform': 'mobile' },
});

const SLOW_REQUEST_THRESHOLD_MS = 1200;

const AUTH_ENDPOINT_PATTERN = /\/auth\/(login|register)(?:\?|$)/;

const sanitizeDiagnosticMessage = (message) =>
  String(message || '')
    .replace(/[\w.+-]+@[\w.-]+\.[A-Za-z]{2,}/g, '[email]')
    .replace(/\+?\d[\d\s()-]{8,}\d/g, '[phone]')
    .replace(/\b[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\b/g, '[token]')
    .replace(/\b(password|token)\s*[:=]\s*[^,\s;]+/gi, '$1=[redacted]')
    .replace(/[\r\n\t]/g, ' ')
    .slice(0, 200);

const logAuthenticationFailure = (error) => {
  if (typeof __DEV__ === 'undefined' || !__DEV__) return;
  const config = error?.config;
  if (!AUTH_ENDPOINT_PATTERN.test(config?.url || '')) return;

  const baseUrl = String(config.baseURL || API_BASE_URL).replace(/\/+$/, '');
  const path = String(config.url || '').replace(/^\/+/, '').split('?')[0];
  const status = error.response?.status ?? null;
  const serverMessage =
    status >= 500
      ? 'Server error'
      : sanitizeDiagnosticMessage(error.response?.data?.message);

  console.warn('[mobile-auth] request failed', {
    method: String(config.method || 'get').toUpperCase(),
    url: `${baseUrl}/${path}`,
    status,
    code: error.code || null,
    serverMessage: serverMessage || null,
  });
};

const TOKEN_KEYS = {
  access: 'upcharganga_access_token',
  refresh: 'upcharganga_refresh_token',
  user: 'upcharganga_cached_user',
};

let accessTokenCache = null;
let refreshTokenCache = null;
let tokensLoaded = false;
let tokensLoading = null;

const loadStoredTokens = async () => {
  if (tokensLoaded) return;
  if (!tokensLoading) {
    tokensLoading = Promise.all([
      SecureStore.getItemAsync(TOKEN_KEYS.access),
      SecureStore.getItemAsync(TOKEN_KEYS.refresh),
    ])
      .then(([accessToken, refreshToken]) => {
        accessTokenCache = accessToken;
        refreshTokenCache = refreshToken;
        tokensLoaded = true;
      })
      .finally(() => {
        tokensLoading = null;
      });
  }
  await tokensLoading;
};

export const extractRefreshTokenFromHeaders = (headers) => {
  const candidates = [headers?.['set-cookie'], headers?.['Set-Cookie']]
    .flat()
    .filter((candidate) => typeof candidate === 'string');

  for (const candidate of candidates) {
    const match = candidate.match(/(?:^|,\s*)refreshToken=([^;,\s]+)/);
    if (match?.[1]) {
      try {
        return decodeURIComponent(match[1]);
      } catch (error) {
        return match[1];
      }
    }
  }

  return null;
};

export const saveTokens = async ({ accessToken, refreshToken }) => {
  await loadStoredTokens();
  const writes = [];
  if (accessToken) {
    writes.push(SecureStore.setItemAsync(TOKEN_KEYS.access, accessToken));
  }
  if (refreshToken) {
    writes.push(SecureStore.setItemAsync(TOKEN_KEYS.refresh, refreshToken));
  }
  await Promise.all(writes);
  if (accessToken) accessTokenCache = accessToken;
  if (refreshToken) refreshTokenCache = refreshToken;
};

export const getCachedUser = async () => {
  const cachedUser = await SecureStore.getItemAsync(TOKEN_KEYS.user);
  return cachedUser ? JSON.parse(cachedUser) : null;
};

export const saveCachedUser = async (user) => {
  if (!user?._id) return;
  const cachedProfile = {
    _id: user._id,
    fullName: user.fullName,
    email: user.email,
    phone: user.phone,
    role: user.role,
    gender: user.gender,
    dateOfBirth: user.dateOfBirth,
  };
  await SecureStore.setItemAsync(TOKEN_KEYS.user, JSON.stringify(cachedProfile));
};

export const clearTokens = async () => {
  accessTokenCache = null;
  refreshTokenCache = null;
  tokensLoaded = true;
  await Promise.all([
    SecureStore.deleteItemAsync(TOKEN_KEYS.access),
    SecureStore.deleteItemAsync(TOKEN_KEYS.refresh),
    SecureStore.deleteItemAsync(TOKEN_KEYS.user),
  ]);
};

export const getStoredAccessToken = async () => {
  await loadStoredTokens();
  return accessTokenCache;
};

export const getStoredRefreshToken = async () => {
  await loadStoredTokens();
  return refreshTokenCache;
};

let refreshPromise = null;

const refreshAccessToken = (refreshToken) => {
  if (!refreshPromise) {
    refreshPromise = axios
      .post(
        `${API_BASE_URL}/auth/refresh-token`,
        refreshToken ? { refreshToken } : {},
        {
          timeout: 10000,
          withCredentials: true,
          headers: { 'X-Client-Platform': 'mobile' },
        }
      )
      .finally(() => {
        refreshPromise = null;
      });
  }
  return refreshPromise;
};

api.interceptors.request.use(
  async (config) => {
    config.headers = config.headers || {};
    config.headers['X-Client-Platform'] = 'mobile';
    const token = await getStoredAccessToken();
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }
    config._requestStartedAt = Date.now();
    return config;
  },
  (error) => Promise.reject(error)
);

api.interceptors.response.use(
  async (response) => {
    const refreshToken = extractRefreshTokenFromHeaders(response.headers);
    if (refreshToken) {
      await saveTokens({ refreshToken });
    }
    const elapsedMs = Date.now() - (response.config?._requestStartedAt || Date.now());
    if (
      typeof __DEV__ !== 'undefined' &&
      __DEV__ &&
      elapsedMs >= SLOW_REQUEST_THRESHOLD_MS
    ) {
      console.info('[mobile-api] slow response', {
        method: String(response.config?.method || 'get').toUpperCase(),
        path: String(response.config?.url || '').split('?')[0],
        status: response.status,
        elapsedMs,
      });
    }
    return response;
  },
  async (error) => {
    const originalRequest = error.config;
    logAuthenticationFailure(error);
    const isAuthenticationEndpoint = AUTH_ENDPOINT_PATTERN.test(originalRequest?.url || '');
    if (
      typeof __DEV__ !== 'undefined' &&
      __DEV__ &&
      originalRequest?._requestStartedAt &&
      Date.now() - originalRequest._requestStartedAt >= SLOW_REQUEST_THRESHOLD_MS
    ) {
      console.info('[mobile-api] slow failure', {
        method: String(originalRequest.method || 'get').toUpperCase(),
        path: String(originalRequest.url || '').split('?')[0],
        status: error.response?.status || null,
        elapsedMs: Date.now() - originalRequest._requestStartedAt,
      });
    }

    if (
      error.response?.status === 401 &&
      originalRequest &&
      !isAuthenticationEndpoint &&
      !originalRequest._retry
    ) {
      originalRequest._retry = true;

      const latestAccessToken = await getStoredAccessToken();
      const sentAccessToken = String(originalRequest.headers?.Authorization || '')
        .replace(/^Bearer\s+/i, '');
      if (latestAccessToken && sentAccessToken !== latestAccessToken) {
        originalRequest.headers.Authorization = `Bearer ${latestAccessToken}`;
        return api(originalRequest);
      }

      const refreshToken = await getStoredRefreshToken();

      try {
        const refreshResponse = await refreshAccessToken(refreshToken);

        const nextAccessToken = refreshResponse?.data?.data?.accessToken;
        if (nextAccessToken) {
          const nextRefreshToken =
            refreshResponse?.data?.data?.refreshToken ||
            extractRefreshTokenFromHeaders(refreshResponse.headers) ||
            refreshToken;
          await saveTokens({
            accessToken: nextAccessToken,
            refreshToken: nextRefreshToken,
          });
          originalRequest.headers.Authorization = `Bearer ${nextAccessToken}`;
          return api(originalRequest);
        }
      } catch (refreshError) {
        if ([401, 403].includes(refreshError?.response?.status)) {
          await clearTokens();
        }
        return Promise.reject(refreshError);
      }
    }

    return Promise.reject(error);
  }
);

export default api;
