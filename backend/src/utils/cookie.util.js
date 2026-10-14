const config = require('../config/env');

/**
 * Helper to extract the domain from a URL, e.g.:
 * - http://localhost:5000 -> undefined (let browser use default, usually localhost)
 * - https://api.upcharganga.com -> .upcharganga.com (subdomain-aware, will match api and www)
 * - https://upcharganga.com -> .upcharganga.com
 */
const extractDomainFromUrl = (url) => {
  if (!url) return undefined;

  try {
    const parsed = new URL(url);
    const host = parsed.hostname;

    if (host === 'localhost' || host.startsWith('127.') || host === '::1') {
      return undefined;
    }

    const parts = host.split('.');
    if (parts.length > 1) {
      return '.' + parts.slice(-2).join('.');
    }

    return undefined;
  } catch {
    return undefined;
  }
};

const getCookieDomain = () => {
  if (process.env.COOKIE_DOMAIN) {
    return process.env.COOKIE_DOMAIN.trim() || undefined;
  }
  return config.cookie?.domain || undefined;
};

const getSameSiteAndSecure = () => {
  const isProd = config.env === 'production';
  const configuredSameSite = process.env.COOKIE_SAME_SITE
    ? process.env.COOKIE_SAME_SITE.trim().toLowerCase()
    : config.cookie?.sameSite || (isProd ? 'none' : 'lax');

  const secure =
    process.env.COOKIE_SECURE !== undefined
      ? process.env.COOKIE_SECURE === 'true'
      : configuredSameSite === 'none'
        ? true
        : isProd;

  return {
    sameSite: configuredSameSite,
    secure,
  };
};

const getCookiePath = () => process.env.COOKIE_PATH || config.cookie?.path || '/api/v1/auth';

/**
 * Builds the options used when setting the persistent httpOnly refresh-token cookie.
 * - httpOnly: true (inaccessible to JavaScript, mitigating XSS token theft)
 * - secure: true in production / HTTPS (required when sameSite === 'none')
 * - sameSite: 'none' in production (allows cross-domain frontend->backend XHR with credentials),
 *   'lax' in local HTTP development so cookies work across localhost ports and browser restarts
 * - path: '/api/v1/auth' so the cookie is sent to BOTH /api/v1/auth/refresh-token AND /api/v1/auth/logout,
 *   without being sent on unrelated resource endpoints
 * - maxAge: matches REFRESH_TOKEN_EXPIRY so the browser persists the cookie on disk across browser restarts
 */
const getRefreshTokenCookieOptions = () => {
  const { sameSite, secure } = getSameSiteAndSecure();
  const domain = getCookieDomain();
  const maxAge = config.jwt.refreshExpiryMs;

  const options = {
    httpOnly: true,
    secure,
    sameSite,
    path: getCookiePath(),
    maxAge,
  };

  if (domain) {
    options.domain = domain;
  }

  return options;
};

/**
 * Builds the matching options used to clear the refresh-token cookie on logout or invalid refresh.
 * Must use the exact same path, domain, sameSite, secure, and httpOnly flags as creation.
 */
const getClearRefreshTokenCookieOptions = (overridePath) => {
  const { sameSite, secure } = getSameSiteAndSecure();
  const domain = getCookieDomain();

  const options = {
    httpOnly: true,
    secure,
    sameSite,
    path: overridePath || getCookiePath(),
  };

  if (domain) {
    options.domain = domain;
  }

  return options;
};

/**
 * Clears the refreshToken cookie on both the canonical '/api/v1/auth' path and
 * the legacy '/api/v1/auth/refresh-token' path (in case a user's browser still holds
 * a cookie issued before the path was widened to '/api/v1/auth').
 */
const clearRefreshTokenCookie = (res) => {
  const canonicalOptions = getClearRefreshTokenCookieOptions();
  res.clearCookie('refreshToken', canonicalOptions);

  if (canonicalOptions.path !== '/api/v1/auth/refresh-token') {
    res.clearCookie(
      'refreshToken',
      getClearRefreshTokenCookieOptions('/api/v1/auth/refresh-token')
    );
  }
  return res;
};

const refreshTokenCookieOptions = getRefreshTokenCookieOptions();
const clearRefreshTokenCookieOptions = getClearRefreshTokenCookieOptions();

module.exports = {
  refreshTokenCookieOptions,
  clearRefreshTokenCookieOptions,
  getRefreshTokenCookieOptions,
  getClearRefreshTokenCookieOptions,
  clearRefreshTokenCookie,
  extractDomainFromUrl,
};
