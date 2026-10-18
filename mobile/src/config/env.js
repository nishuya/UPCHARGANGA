export const API_BASE_URL = process.env.EXPO_PUBLIC_API_URL || 'http://10.0.2.2:5000/api/v1';
export const SOCKET_BASE_URL =
  process.env.EXPO_PUBLIC_SOCKET_URL ||
  API_BASE_URL.replace(/\/api\/v1$/, '').replace(/\/api\/v1\/$/, '');

export const APP_CONFIG = {
  appName: 'UpcharGanga',
  apiBaseUrl: API_BASE_URL,
  socketBaseUrl: SOCKET_BASE_URL,
};
