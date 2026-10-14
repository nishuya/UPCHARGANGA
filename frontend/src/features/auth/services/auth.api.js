import apiClient, { refreshSession } from '../../../services/apiClient';

/**
 * Thin wrappers around the auth endpoints — no state, no side effects
 * beyond the HTTP call itself.
 */

export const loginRequest = (credentials) => apiClient.post('/auth/login', credentials);

export const registerRequest = (payload) => apiClient.post('/auth/register', payload);

export const logoutRequest = (accessToken) =>
  apiClient.post(
    '/auth/logout',
    {},
    accessToken
      ? {
          headers: {
            Authorization: `Bearer ${accessToken}`,
          },
        }
      : undefined
  );

export const refreshTokenRequest = () => refreshSession();

export const getCurrentUserRequest = () => apiClient.get('/auth/me');

export const updateProfileRequest = (payload) =>
  apiClient.patch('/auth/profile', payload);
