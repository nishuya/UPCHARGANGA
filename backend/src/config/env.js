require('dotenv').config();

/**
 * Central config loader. Every other file reads env vars through here —
 * never via process.env directly — so there is exactly one place that
 * knows the shape of our configuration and one place to add validation.
 *
 * SECURITY: In production, fail startup immediately if required secrets are missing.
 * Never use hardcoded development defaults in deployed environments.
 */

const REQUIRED_IN_PRODUCTION = [
  'MONGO_URI',
  'ACCESS_TOKEN_SECRET',
  'REFRESH_TOKEN_SECRET',
  'CLIENT_URL',
  'GOOGLE_CLIENT_ID',
];

const isProduction = process.env.NODE_ENV === 'production';

if (isProduction) {
  const missing = REQUIRED_IN_PRODUCTION.filter((key) => !process.env[key]);
  if (missing.length) {
    // Fail fast on boot rather than limping along with undefined secrets.
    // Do not print the actual secret values, only the names.
    const errorMsg = `CRITICAL: Missing required environment variables in production: ${missing.join(', ')}. Application startup blocked.`;
    console.error(errorMsg);
    process.exit(1);
  }

  // Additional production-only validation
  if (
    process.env.ACCESS_TOKEN_SECRET === 'dev_access_secret_change_me' ||
    process.env.REFRESH_TOKEN_SECRET === 'dev_refresh_secret_change_me'
  ) {
    const errorMsg =
      'CRITICAL: Development JWT secrets detected in production environment. Application startup blocked.';
    console.error(errorMsg);
    process.exit(1);
  }
}

// Validate JWT secrets are different (best practice to keep tokens separate)
if (process.env.ACCESS_TOKEN_SECRET && process.env.REFRESH_TOKEN_SECRET) {
  if (process.env.ACCESS_TOKEN_SECRET === process.env.REFRESH_TOKEN_SECRET) {
    console.warn(
      '⚠️  WARNING: ACCESS_TOKEN_SECRET and REFRESH_TOKEN_SECRET are identical. Best practice is to use different secrets.'
    );
  }
}

/**
 * Parses a human-readable duration string (e.g. "15m", "7d", "30d", "24h", "3600s")
 * into milliseconds. Falls back to fallbackMs if parsing fails.
 */
const parseDurationToMs = (value, fallbackMs) => {
  if (!value) return fallbackMs;
  if (typeof value === 'number' && Number.isFinite(value)) return value;

  const match = String(value)
    .trim()
    .match(/^(\d+)\s*(ms|s|m|h|d)?$/i);
  if (!match) return fallbackMs;

  const amount = Number(match[1]);
  const unit = (match[2] || 'ms').toLowerCase();

  const multipliers = {
    ms: 1,
    s: 1000,
    m: 60 * 1000,
    h: 60 * 60 * 1000,
    d: 24 * 60 * 60 * 1000,
  };

  return amount * (multipliers[unit] || 1);
};

const normalizeOrigin = (url) => (url ? String(url).trim().replace(/\/+$/, '') : '');

const rawClientUrl = process.env.CLIENT_URL || 'http://localhost:5173';
const clientUrls = rawClientUrl
  .split(',')
  .map(normalizeOrigin)
  .filter(Boolean);

const refreshExpiry = process.env.REFRESH_TOKEN_EXPIRY || '7d';
const SEVEN_DAYS_MS = 7 * 24 * 60 * 60 * 1000;

module.exports = {
  env: process.env.NODE_ENV || 'development',
  port: Number(process.env.PORT) || 5000,
  mongoUri:
    process.env.MONGO_URI ||
    (isProduction ? undefined : 'mongodb://localhost:27017/smart-hospital-queue'),
  clientUrl: clientUrls[0] || 'http://localhost:5173',
  clientUrls,
  normalizeOrigin,
  parseDurationToMs,

  jwt: {
    // In production, these MUST come from env vars (no fallbacks to hardcoded values)
    accessSecret: isProduction
      ? process.env.ACCESS_TOKEN_SECRET
      : process.env.ACCESS_TOKEN_SECRET || 'dev_access_secret_change_me',
    accessExpiry: process.env.ACCESS_TOKEN_EXPIRY || '15m',
    refreshSecret: isProduction
      ? process.env.REFRESH_TOKEN_SECRET
      : process.env.REFRESH_TOKEN_SECRET || 'dev_refresh_secret_change_me',
    refreshExpiry,
    refreshExpiryMs: parseDurationToMs(refreshExpiry, SEVEN_DAYS_MS),
    // JWT algorithm to use (always HS256 with our current setup; could extend to RS256)
    algorithm: 'HS256',
  },

  cookie: {
    domain: process.env.COOKIE_DOMAIN || undefined,
    path: process.env.COOKIE_PATH || '/api/v1/auth',
    sameSite: process.env.COOKIE_SAME_SITE
      ? process.env.COOKIE_SAME_SITE.toLowerCase()
      : isProduction
        ? 'none'
        : 'lax',
    secure:
      process.env.COOKIE_SECURE !== undefined
        ? process.env.COOKIE_SECURE === 'true'
        : isProduction,
  },

  bcryptSaltRounds: Number(process.env.BCRYPT_SALT_ROUNDS) || 12,

  smtp: {
    host: process.env.SMTP_HOST,
    port: Number(process.env.SMTP_PORT) || 587,
    user: process.env.SMTP_USER,
    pass: process.env.SMTP_PASS,
    fromEmail: process.env.SMTP_FROM_EMAIL || 'no-reply@smarthospital.com',
  },

  security: {
    maxLoginAttempts: Number(process.env.MAX_LOGIN_ATTEMPTS) || 5,
    lockTimeMinutes: Number(process.env.LOCK_TIME_MINUTES) || 15,
    passwordResetExpiryMinutes: Number(process.env.PASSWORD_RESET_EXPIRY_MINUTES) || 10,
    // Account setup tokens should have a short expiry (same as password reset)
    accountSetupExpiryMinutes: Number(process.env.ACCOUNT_SETUP_EXPIRY_MINUTES) || 10,
  },

  cloudinary: {
    cloudName: process.env.CLOUDINARY_CLOUD_NAME,
    apiKey: process.env.CLOUDINARY_API_KEY,
    apiSecret: process.env.CLOUDINARY_API_SECRET,
    enabled: !!(
      process.env.CLOUDINARY_CLOUD_NAME &&
      process.env.CLOUDINARY_API_KEY &&
      process.env.CLOUDINARY_API_SECRET
    ),
  },

  upload: {
    maxFileSize: Number(process.env.MAX_FILE_SIZE_MB) || 5, // MB
    allowedImageTypes: ['image/jpeg', 'image/png', 'image/webp'],
  },

  google: {
    clientId: process.env.GOOGLE_CLIENT_ID,
  },

  oauth: {
    emailVerificationExpiryMinutes: Number(process.env.EMAIL_VERIFICATION_EXPIRY_MINUTES) || 15,
    verificationResendLimitPerHour: Number(process.env.VERIFICATION_RESEND_LIMIT_PER_HOUR) || 3,
  },
};
