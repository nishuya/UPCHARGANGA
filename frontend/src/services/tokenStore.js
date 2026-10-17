/**
 * Holds the access token in memory ONLY — never localStorage/sessionStorage.
 * This mirrors the backend's own security posture: the refresh token lives
 * in an httpOnly cookie (inaccessible to JS, safe from XSS); the access
 * token here is equally deliberate — a memory-only value vanishes on tab
 * close/refresh, forcing a silent re-authentication via that httpOnly
 * cookie (see AuthContext's bootstrap effect) rather than sitting
 * somewhere an XSS payload could read it.
 */
let accessToken = null;
let sessionEpoch = 0;

const LEGACY_STORAGE_KEYS = [
  'accessToken',
  'refreshToken',
  'token',
  'authToken',
  'auth',
  'user',
  'upcharganga_auth',
  'upcharganga_user',
];

export const EXPLICIT_LOGOUT_KEY = 'upcharganga_explicit_logout';

export const hasExplicitLogout = () => {
  if (typeof window === 'undefined') return false;
  try {
    return window.localStorage.getItem(EXPLICIT_LOGOUT_KEY) === '1';
  } catch {
    return false;
  }
};

export const markExplicitLogout = () => {
  if (typeof window === 'undefined') return false;
  try {
    window.localStorage.setItem(EXPLICIT_LOGOUT_KEY, '1');
    return true;
  } catch {
    return false;
  }
};

export const clearExplicitLogout = () => {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.removeItem(EXPLICIT_LOGOUT_KEY);
  } catch {
    // Authentication still works when persistent storage is unavailable.
  }
};

export const clearLegacyAuthStorage = () => {
  if (typeof window === 'undefined') return;
  for (const key of LEGACY_STORAGE_KEYS) {
    try {
      window.localStorage?.removeItem(key);
      window.sessionStorage?.removeItem(key);
    } catch {
      // Ignore storage access errors in restricted browsing modes
    }
  }
};

export const getAccessToken = () => accessToken;

export const getSessionEpoch = () => sessionEpoch;

export const setAccessToken = (token) => {
  accessToken = token || null;
};

export const clearAccessToken = () => {
  accessToken = null;
  sessionEpoch += 1;
  clearLegacyAuthStorage();
};
