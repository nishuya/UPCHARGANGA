const config = require('../config/env');

/**
 * Helper to extract the domain from a URL, e.g.:
 * - http://localhost:5000 -> null (let browser use default, usually localhost)
 * - https://api.upcharganga.com -> .upcharganga.com (subdomain-aware, will match api and www)
 * - https://upcharganga.com -> .upcharganga.com
 *
 * Returns null for localhost (browser will use the current host) or the root domain
 * prefixed with a dot for cross-subdomain sharing. The dot prefix allows the cookie
 * to be sent to any subdomain of the root domain (e.g., api.example.com,
 * frontend.example.com, etc.), which is important for deployments where the backend
 * and frontend live on different subdomains.
 *
 * In production, make sure your CLIENT_URL and backend host are on the same root
 * domain or explicitly set COOKIE_DOMAIN in your environment.
 */
const extractDomainFromUrl = (url) => {
  if (!url) return undefined;

  try {
    const parsed = new URL(url);
    const host = parsed.hostname;

    // localhost, 127.0.0.1, or other loopback — let the browser use default
    if (host === 'localhost' || host.startsWith('127.') || host === '::1') {
      return undefined;
    }

    // Extract root domain: for 'api.example.com' -> '.example.com'
    // For 'example.com' -> '.example.com'
    const parts = host.split('.');
    if (parts.length > 1) {
      return '.' + parts.slice(-2).join('.');
    }

    return undefined;
  } catch {
    return undefined;
  }
};

/**
 * Refresh token cookie options:
 * - httpOnly: JavaScript on the frontend can NEVER read this cookie — the
 *   main defense against XSS-based token theft.
 * - secure: only sent over HTTPS in production.
 * - sameSite: 'strict' blocks the cookie from being sent on cross-site
 *   requests — a strong default CSRF defense for the refresh endpoint.
 * - path: scoped to the refresh endpoint only, so the cookie isn't even
 *   transmitted on unrelated API calls.
 * - domain: allows the cookie to be sent from frontend to backend when they
 *   are on different subdomains of the same root domain. In development
 *   (localhost), domain is undefined, letting the browser use the current host.
 *   In production, extracted from the backend's own host (server-side, we know
 *   what host we're running on). For explicit control, set COOKIE_DOMAIN env var.
 */
const getCookieDomain = () => {
  // Explicit override from env var — useful for complex deployments
  if (process.env.COOKIE_DOMAIN) {
    return process.env.COOKIE_DOMAIN;
  }

  // In production, extract from the actual server host (not CLIENT_URL)
  // The cookie is set by the backend, so it should match the backend's domain
  if (config.env === 'production') {
    // If the app is behind a proxy (e.g., Render, Vercel), the Host header
    // reflects the actual served domain. We extract from that if available.
    // For now, return undefined and let the browser infer the domain from
    // the request origin. This is safe as long as frontend and backend
    // are on the same domain/subdomain structure.
    return undefined;
  }

  // In development, always undefined (use browser default, typically localhost)
  return undefined;
};

const refreshTokenCookieOptions = {
  httpOnly: true,
  secure: config.env === 'production',
  sameSite: 'strict',
  path: '/api/v1/auth/refresh-token',
  maxAge: config.jwt.refreshExpiryMs,
  domain: getCookieDomain(),
};

const clearRefreshTokenCookieOptions = {
  httpOnly: true,
  secure: config.env === 'production',
  sameSite: 'strict',
  path: '/api/v1/auth/refresh-token',
  domain: getCookieDomain(),
};

module.exports = {
  refreshTokenCookieOptions,
  clearRefreshTokenCookieOptions,
  extractDomainFromUrl,
};
