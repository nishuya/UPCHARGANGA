const developmentApiUrl =
  typeof __DEV__ !== 'undefined' && __DEV__ ? 'http://10.0.2.2:5000/api/v1' : null;
const configuredApiUrl = process.env.EXPO_PUBLIC_API_URL || developmentApiUrl;

if (!configuredApiUrl) {
  throw new Error('EXPO_PUBLIC_API_URL must be configured for release builds.');
}

export const API_BASE_URL = configuredApiUrl.replace(/\/+$/, '');
export const SOCKET_BASE_URL = (
  process.env.EXPO_PUBLIC_SOCKET_URL ||
  API_BASE_URL.replace(/\/api\/v1$/, '')
).replace(/\/+$/, '');

export const APP_CONFIG = {
  appName: 'UpcharGanga',
  apiBaseUrl: API_BASE_URL,
  socketBaseUrl: SOCKET_BASE_URL,
};
