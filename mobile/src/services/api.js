import axios from 'axios';
import * as SecureStore from 'expo-secure-store';

import { API_BASE_URL } from '../config/env';

const api = axios.create({
  baseURL: API_BASE_URL,
  timeout: 20000,
  withCredentials: true,
  headers: { 'X-Client-Platform': 'mobile' },
});

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
  if (accessToken) {
    await SecureStore.setItemAsync(TOKEN_KEYS.access, accessToken);
  }
  if (refreshToken) {
    await SecureStore.setItemAsync(TOKEN_KEYS.refresh, refreshToken);
  }
};

export const clearTokens = async () => {
  await SecureStore.deleteItemAsync(TOKEN_KEYS.access);
  await SecureStore.deleteItemAsync(TOKEN_KEYS.refresh);
};

export const getStoredAccessToken = async () =>
  SecureStore.getItemAsync(TOKEN_KEYS.access);

export const getStoredRefreshToken = async () =>
  SecureStore.getItemAsync(TOKEN_KEYS.refresh);

api.interceptors.request.use(
  async (config) => {
    config.headers = config.headers || {};
    config.headers['X-Client-Platform'] = 'mobile';
    const token = await getStoredAccessToken();
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }
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
    return response;
  },
  async (error) => {
    const originalRequest = error.config;
    logAuthenticationFailure(error);
    const isAuthenticationEndpoint = AUTH_ENDPOINT_PATTERN.test(originalRequest?.url || '');

    if (
      error.response?.status === 401 &&
      originalRequest &&
      !isAuthenticationEndpoint &&
      !originalRequest._retry
    ) {
      originalRequest._retry = true;

      const refreshToken = await getStoredRefreshToken();

      try {
        const refreshResponse = await axios.post(
          `${API_BASE_URL}/auth/refresh-token`,
          refreshToken ? { refreshToken } : {},
          {
            withCredentials: true,
            headers: { 'X-Client-Platform': 'mobile' },
          }
        );

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
        await clearTokens();
      }
    }

    return Promise.reject(error);
  }
);

export default api;
