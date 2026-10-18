import axios from 'axios';
import * as SecureStore from 'expo-secure-store';

import { API_BASE_URL } from '../config/env';

const api = axios.create({
  baseURL: API_BASE_URL,
  timeout: 20000,
  withCredentials: true,
  headers: { 'X-Client-Platform': 'mobile' },
});

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

    if (error.response?.status === 401 && originalRequest && !originalRequest._retry) {
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
