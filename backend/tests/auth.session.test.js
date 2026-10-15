const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const Module = require('node:module');

const repoRoot = path.resolve(__dirname, '../..');
const backendRoot = path.resolve(__dirname, '..');
const frontendRoot = path.resolve(repoRoot, 'frontend');

// Provide lightweight native Node.js shims ONLY when running in an offline
// environment where node_modules is not installed yet. When node_modules is
// present, real packages are loaded normally.
const originalLoad = Module._load;
const modelsRegistry = new Map();

const parseExpirySeconds = (exp) => {
  if (typeof exp === 'number') return exp;
  const m = String(exp || '15m').match(/^(\d+)(ms|s|m|h|d)?$/i);
  if (!m) return 900;
  const n = Number(m[1]);
  const u = (m[2] || 's').toLowerCase();
  const mult = { ms: 0.001, s: 1, m: 60, h: 3600, d: 86400 };
  return Math.floor(n * (mult[u] || 1));
};

const nativeJwt = {
  sign(payload, secret, options = {}) {
    const header = Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).toString('base64url');
    const iat = Math.floor(Date.now() / 1000);
    const exp = iat + parseExpirySeconds(options.expiresIn);
    const body = Buffer.from(JSON.stringify({ ...payload, iat, exp })).toString('base64url');
    const sig = crypto
      .createHmac('sha256', String(secret))
      .update(`${header}.${body}`)
      .digest('base64url');
    return `${header}.${body}.${sig}`;
  },
  verify(token, secret) {
    if (!token || typeof token !== 'string') {
      throw new Error('jwt must be provided');
    }
    const parts = token.split('.');
    if (parts.length !== 3) {
      throw new Error('jwt malformed');
    }
    const [header, body, sig] = parts;
    const expectedSig = crypto
      .createHmac('sha256', String(secret))
      .update(`${header}.${body}`)
      .digest('base64url');
    if (sig !== expectedSig) {
      throw new Error('invalid signature');
    }
    const decoded = JSON.parse(Buffer.from(body, 'base64url').toString('utf8'));
    if (decoded.exp && decoded.exp < Math.floor(Date.now() / 1000)) {
      const err = new Error('jwt expired');
      err.name = 'TokenExpiredError';
      throw err;
    }
    return decoded;
  },
  decode(token) {
    if (!token || typeof token !== 'string') return null;
    const parts = token.split('.');
    if (!parts || parts.length !== 3) return null;
    try {
      return JSON.parse(Buffer.from(parts[1], 'base64url').toString('utf8'));
    } catch {
      return null;
    }
  },
};

Module._load = function patchedLoad(request, parent, isMain) {
  try {
    return originalLoad.apply(this, arguments);
  } catch (err) {
    if (err.code !== 'MODULE_NOT_FOUND') throw err;
    if (request === 'dotenv') {
      return { config: () => ({}) };
    }
    if (request === 'jsonwebtoken') {
      return nativeJwt;
    }
    if (request === 'bcryptjs') {
      return {
        hash: async (s) => `hashed:${s}`,
        compare: async (candidate, hashed) => hashed === `hashed:${candidate}`,
      };
    }
    if (request === 'mongoose') {
      class Schema {
        constructor(definition, options) {
          this.definition = definition;
          this.options = options;
          this.methods = {};
          this.statics = {};
        }
        index() {}
        pre() {}
      }
      Schema.Types = { ObjectId: String, Mixed: Object };
      return {
        Schema,
        Types: { ObjectId: class ObjectId {} },
        model(name, schema) {
          if (!modelsRegistry.has(name)) {
            modelsRegistry.set(name, {
              modelName: name,
              schema,
              findById: async () => null,
              findOne: async () => null,
              findByIdAndUpdate: async () => null,
              findOneAndUpdate: async () => null,
              create: async (doc) => doc,
            });
          }
          return modelsRegistry.get(name);
        },
      };
    }
    throw err;
  }
};

// ============================================================================
// 1. SPA ROUTING & DEPLOYMENT REWRITE TESTS (404 ON REFRESH FIX)
// ============================================================================

test('1. Vercel rewrite config routes homepage and deeply nested SPA URLs to /index.html while excluding /api and static assets', () => {
  const vercelConfigPath = path.join(frontendRoot, 'vercel.json');
  const vercelConfig = JSON.parse(fs.readFileSync(vercelConfigPath, 'utf8'));

  assert.equal(vercelConfig.outputDirectory, 'dist');
  assert.ok(Array.isArray(vercelConfig.rewrites), 'vercel.json must define rewrites');
  assert.equal(vercelConfig.rewrites.length, 1, 'Should not have hardcoded localhost /api rewrite');

  const spaRewrite = vercelConfig.rewrites[0];
  assert.equal(spaRewrite.destination, '/index.html');

  // Compile the regex from vercel.json source pattern
  const pattern = new RegExp(`^${spaRewrite.source}$`);

  // Routes that MUST match and serve /index.html on refresh or direct open:
  const validSpaRoutes = [
    '/',
    '/login',
    '/register',
    '/unauthorized',
    '/404',
    '/patient',
    '/patient/book/city',
    '/patient/book/hospital',
    '/patient/book/doctors',
    '/patient/book/confirm/671234567890abcdef123456',
    '/patient/book/success/671234567890abcdef123456',
    '/patient/appointments',
    '/patient/appointments/671234567890abcdef123456',
    '/patient/notifications',
    '/patient/profile',
    '/reception',
    '/reception/search',
    '/doctor',
    '/doctor/history',
    '/admin',
    '/admin/analytics',
    '/admin/reports',
    '/admin/hospitals',
    '/admin/doctors',
    '/admin/patients',
    '/admin/appointments',
    '/admin/departments',
    '/admin/cities',
    '/admin/staff',
  ];

  for (const route of validSpaRoutes) {
    assert.ok(
      pattern.test(route),
      `Expected SPA route "${route}" to match vercel.json rewrite regex`
    );
  }

  // Paths that MUST NOT be rewritten to /index.html (preserve genuine API 404s and static assets):
  const excludedPaths = [
    '/api',
    '/api/v1/auth/login',
    '/api/v1/nonexistent-endpoint',
    '/assets/index-Zq70qNG0.js',
    '/assets/index-BqFKdOWY.css',
    '/favicon.ico',
    '/logo.png',
    '/manifest.json',
  ];

  for (const excluded of excludedPaths) {
    assert.equal(
      pattern.test(excluded),
      false,
      `Expected non-SPA path "${excluded}" NOT to be rewritten to /index.html`
    );
  }
});

test('2. Static hosting fallbacks (public/_redirects, dist/_redirects, netlify.toml, render.yaml, vite.config.js) are properly configured', () => {
  const publicRedirects = fs.readFileSync(
    path.join(frontendRoot, 'public', '_redirects'),
    'utf8'
  );
  const distRedirects = fs.readFileSync(
    path.join(frontendRoot, 'dist', '_redirects'),
    'utf8'
  );
  assert.ok(publicRedirects.includes('/* /index.html 200'));
  assert.ok(!publicRedirects.includes('/api/* /api/:splat 200'));
  assert.ok(distRedirects.includes('/* /index.html 200'));

  const netlifyToml = fs.readFileSync(path.join(frontendRoot, 'netlify.toml'), 'utf8');
  assert.ok(netlifyToml.includes('from = "/*"'));
  assert.ok(netlifyToml.includes('to = "/index.html"'));
  assert.ok(netlifyToml.includes('status = 200'));

  const renderYaml = fs.readFileSync(path.join(repoRoot, 'render.yaml'), 'utf8');
  assert.ok(renderYaml.includes('type: rewrite'));
  assert.ok(renderYaml.includes('source: /*'));
  assert.ok(renderYaml.includes('destination: /index.html'));

  const viteConfig = fs.readFileSync(path.join(frontendRoot, 'vite.config.js'), 'utf8');
  assert.ok(viteConfig.includes("base: '/'"));
  assert.ok(viteConfig.includes("appType: 'spa'"));

  // Verify built index.html uses root-relative /assets/... paths so nested URLs load JS & CSS bundles
  const distIndexHtml = fs.readFileSync(path.join(frontendRoot, 'dist', 'index.html'), 'utf8');
  assert.ok(distIndexHtml.includes('src="/assets/'));
  assert.ok(distIndexHtml.includes('href="/assets/'));
});

// ============================================================================
// 2. BACKEND CONFIG, COOKIE SETTINGS & PRODUCTION / DEV PARITY TESTS
// ============================================================================

test('3. Environment duration parser and cookie options match between creation and clearing in dev and production', () => {
  const config = require(path.join(backendRoot, 'src/config/env'));
  const cookieUtil = require(path.join(backendRoot, 'src/utils/cookie.util'));

  assert.equal(config.parseDurationToMs('15m', 0), 15 * 60 * 1000);
  assert.equal(config.parseDurationToMs('7d', 0), 7 * 24 * 60 * 60 * 1000);
  assert.equal(config.parseDurationToMs('30d', 0), 30 * 24 * 60 * 60 * 1000);

  // Check default development cookie options
  const createOpts = cookieUtil.getRefreshTokenCookieOptions();
  const clearOpts = cookieUtil.getClearRefreshTokenCookieOptions();

  assert.equal(createOpts.httpOnly, true);
  assert.equal(createOpts.path, '/api/v1/auth');
  assert.ok(
    createOpts.maxAge > 0,
    'Refresh cookie must have positive maxAge for persistence across browser restarts'
  );

  // Clear options must match creation options on path, httpOnly, secure, sameSite, domain
  assert.equal(clearOpts.httpOnly, createOpts.httpOnly);
  assert.equal(clearOpts.path, createOpts.path);
  assert.equal(clearOpts.sameSite, createOpts.sameSite);
  assert.equal(clearOpts.secure, createOpts.secure);
  assert.equal(clearOpts.domain, createOpts.domain);

  // Verify production cookie behavior (Secure + SameSite=None for cross-origin credentials)
  const prevEnv = config.env;
  const prevSameSite = config.cookie.sameSite;
  const prevSecure = config.cookie.secure;
  try {
    config.env = 'production';
    config.cookie.sameSite = 'none';
    config.cookie.secure = true;

    const prodCreate = cookieUtil.getRefreshTokenCookieOptions();
    const prodClear = cookieUtil.getClearRefreshTokenCookieOptions();

    assert.equal(prodCreate.httpOnly, true);
    assert.equal(prodCreate.secure, true);
    assert.equal(prodCreate.sameSite, 'none');
    assert.equal(prodCreate.path, '/api/v1/auth');
    assert.equal(prodClear.secure, true);
    assert.equal(prodClear.sameSite, 'none');
    assert.equal(prodClear.path, '/api/v1/auth');
  } finally {
    config.env = prevEnv;
    config.cookie.sameSite = prevSameSite;
    config.cookie.secure = prevSecure;
  }
});

// ============================================================================
// 3. TOKEN GENERATION, ROTATION, EXPIRATION & HASHING TESTS
// ============================================================================

test('4. Access and refresh tokens are signed, verified, hashed, and uniquely rotated even within the same millisecond', () => {
  const tokenUtil = require(path.join(backendRoot, 'src/utils/token.util'));

  const fakeUser = {
    _id: '671234567890abcdef123456',
    role: 'patient',
  };

  const access1 = tokenUtil.generateAccessToken(fakeUser);
  const decodedAccess = tokenUtil.verifyAccessToken(access1);
  assert.equal(decodedAccess.id, fakeUser._id);
  assert.equal(decodedAccess.role, 'patient');

  // Generate two refresh tokens in the exact same millisecond — must differ due to jti
  const refresh1 = tokenUtil.generateRefreshToken(fakeUser);
  const refresh2 = tokenUtil.generateRefreshToken(fakeUser);
  assert.notEqual(
    refresh1,
    refresh2,
    'Rotated refresh tokens must be unique even in the same second'
  );

  const decodedRefresh = tokenUtil.verifyRefreshToken(refresh1);
  assert.equal(decodedRefresh.id, fakeUser._id);
  assert.ok(decodedRefresh.jti, 'Refresh token must include unique jti');

  const hash1 = tokenUtil.hashToken(refresh1);
  assert.notEqual(hash1, refresh1);
  assert.match(hash1, /^[a-f0-9]{64}$/);
});

// ============================================================================
// 4. SESSION PERSISTENCE, ROTATION, REVOCATION & LOGOUT SERVICE TESTS
// ============================================================================

test('5. Auth service rotates refresh tokens, rejects revoked/reused/expired tokens, and supports idempotent logout with expired access token', async () => {
  const User = require(path.join(backendRoot, 'src/modules/auth/auth.model'));
  const authService = require(path.join(backendRoot, 'src/modules/auth/auth.service'));
  const authController = require(path.join(backendRoot, 'src/modules/auth/auth.controller'));
  const tokenUtil = require(path.join(backendRoot, 'src/utils/token.util'));

  const dbUsers = new Map();

  const origFindById = User.findById;
  const origFindByIdAndUpdate = User.findByIdAndUpdate;
  const origFindOneAndUpdate = User.findOneAndUpdate;

  const makeQueryChain = (doc) => ({
    select() {
      return this;
    },
    populate() {
      return this;
    },
    then(resolve, reject) {
      return Promise.resolve(doc).then(resolve, reject);
    },
  });

  try {
    const userId = '671234567890abcdef123456';
    const userDoc = {
      _id: userId,
      fullName: 'Aarav Sharma',
      email: 'aarav@example.com',
      role: 'patient',
      isActive: true,
      refreshToken: undefined,
      refreshTokenExpiresAt: undefined,
      passwordChangedAt: undefined,
      isPasswordChangedAfter() {
        return false;
      },
      async save() {
        dbUsers.set(userId, this);
        return this;
      },
    };
    dbUsers.set(userId, userDoc);

    User.findById = (id) => makeQueryChain(dbUsers.get(String(id)) || null);
    User.findByIdAndUpdate = async (id, update) => {
      const u = dbUsers.get(String(id));
      if (u && update?.$unset) {
        if (update.$unset.refreshToken) u.refreshToken = undefined;
        if (update.$unset.refreshTokenExpiresAt) u.refreshTokenExpiresAt = undefined;
      }
      return u || null;
    };
    User.findOneAndUpdate = async (filter, update) => {
      for (const u of dbUsers.values()) {
        if (filter.refreshToken && u.refreshToken === filter.refreshToken) {
          if (update?.$unset) {
            if (update.$unset.refreshToken) u.refreshToken = undefined;
            if (update.$unset.refreshTokenExpiresAt) u.refreshTokenExpiresAt = undefined;
          }
          return u;
        }
      }
      return null;
    };

    // Step 1: Issue initial tokens on login
    const initialTokens = await authService.issueTokens(userDoc);
    assert.ok(initialTokens.accessToken);
    assert.ok(initialTokens.refreshToken);
    assert.equal(userDoc.refreshToken, tokenUtil.hashToken(initialTokens.refreshToken));
    assert.ok(userDoc.refreshTokenExpiresAt instanceof Date);

    // Step 2: Simulate closing & reopening browser -> refreshAccessToken restores session and rotates token
    const refreshed = await authService.refreshAccessToken(initialTokens.refreshToken);
    assert.equal(refreshed.user.email, 'aarav@example.com');
    assert.ok(refreshed.accessToken);
    assert.ok(refreshed.refreshToken);
    assert.notEqual(refreshed.refreshToken, initialTokens.refreshToken);
    assert.equal(userDoc.refreshToken, tokenUtil.hashToken(refreshed.refreshToken));

    // Step 3: Reusing the old rotated refresh token must fail with 401 and revoke the session
    await assert.rejects(
      () => authService.refreshAccessToken(initialTokens.refreshToken),
      (err) => err.statusCode === 401 && err.message.includes('Session invalid')
    );
    assert.equal(userDoc.refreshToken, undefined, 'Session must be revoked upon token reuse');

    // Step 4: Re-login and test logout controller when access token has expired (req.user is undefined, only cookie present)
    const secondLogin = await authService.issueTokens(userDoc);
    assert.ok(userDoc.refreshToken);

    const clearedCookies = [];
    let statusCode = null;
    let jsonPayload = null;
    const mockRes = {
      clearCookie(name, opts) {
        clearedCookies.push({ name, opts });
        return this;
      },
      status(code) {
        statusCode = code;
        return this;
      },
      json(body) {
        jsonPayload = body;
        return this;
      },
    };

    await new Promise((resolve, reject) => {
      authController.logout(
        { user: undefined, cookies: { refreshToken: secondLogin.refreshToken } },
        mockRes,
        (err) => (err ? reject(err) : resolve())
      );
      setImmediate(resolve);
    });

    assert.equal(statusCode, 200);
    assert.equal(jsonPayload?.message, 'Logged out successfully.');
    assert.equal(
      userDoc.refreshToken,
      undefined,
      'Logout must revoke server-side refreshToken using cookie even when access token is expired'
    );
    assert.ok(
      clearedCookies.some((c) => c.name === 'refreshToken' && c.opts.path === '/api/v1/auth'),
      'Logout must clear refreshToken cookie on /api/v1/auth'
    );

    // Step 5: Reopening website after logout must NOT restore session using the old cookie
    await assert.rejects(
      () => authService.refreshAccessToken(secondLogin.refreshToken),
      (err) => err.statusCode === 401
    );

    // Step 6: Repeated logout calls must be idempotent and never throw
    await authService.logoutUser({ userId: undefined, refreshToken: secondLogin.refreshToken });
    await authService.logoutUser({ userId, refreshToken: undefined });
    await authService.logoutUser(null);
  } finally {
    User.findById = origFindById;
    User.findByIdAndUpdate = origFindByIdAndUpdate;
    User.findOneAndUpdate = origFindOneAndUpdate;
  }
});

// ============================================================================
// 5. FRONTEND TOKEN STORE, SINGLE-FLIGHT REFRESH, LOGOUT & ROLE ROUTING TESTS
// ============================================================================

test('6. Frontend tokenStore, apiClient single-flight refresh deduplication, and epoch-based logout cancellation execute accurately', async () => {
  const tokenStoreUrl = `file://${path.join(frontendRoot, 'src/services/tokenStore.js')}`;
  const tokenStore = await import(tokenStoreUrl);

  // Set up mock window storage with obsolete entries
  const mockLocal = new Map([
    ['accessToken', 'obsolete-access'],
    ['refreshToken', 'obsolete-refresh'],
    ['user', '{"id":"old"}'],
  ]);
  const mockSession = new Map([['token', 'obsolete-session-token']]);

  global.window = {
    localStorage: {
      removeItem: (k) => mockLocal.delete(k),
    },
    sessionStorage: {
      removeItem: (k) => mockSession.delete(k),
    },
  };

  tokenStore.setAccessToken('live-memory-token');
  assert.equal(tokenStore.getAccessToken(), 'live-memory-token');
  const epochBefore = tokenStore.getSessionEpoch();

  // Clearing access token must wipe memory, increment sessionEpoch, and purge legacy browser storage
  tokenStore.clearAccessToken();
  assert.equal(tokenStore.getAccessToken(), null);
  assert.equal(tokenStore.getSessionEpoch(), epochBefore + 1);
  assert.equal(mockLocal.size, 0, 'Obsolete localStorage auth keys must be removed on logout');
  assert.equal(mockSession.size, 0, 'Obsolete sessionStorage auth keys must be removed on logout');

  // Verify source invariants across frontend auth files
  const apiClientCode = fs.readFileSync(
    path.join(frontendRoot, 'src/services/apiClient.js'),
    'utf8'
  );
  const authContextCode = fs.readFileSync(
    path.join(frontendRoot, 'src/context/AuthContext.jsx'),
    'utf8'
  );
  const protectedRouteCode = fs.readFileSync(
    path.join(frontendRoot, 'src/routes/ProtectedRoute.jsx'),
    'utf8'
  );
  const patientTopNavCode = fs.readFileSync(
    path.join(frontendRoot, 'src/features/patient/components/ui/PatientTopNav.jsx'),
    'utf8'
  );
  const loginPageCode = fs.readFileSync(
    path.join(frontendRoot, 'src/features/auth/pages/LoginPage.jsx'),
    'utf8'
  );
  const appRoutesCode = fs.readFileSync(
    path.join(frontendRoot, 'src/routes/AppRoutes.jsx'),
    'utf8'
  );

  assert.ok(apiClientCode.includes('export const refreshSession'));
  assert.ok(apiClientCode.includes('getSessionEpoch() !== startEpoch'));
  assert.ok(apiClientCode.includes('withCredentials: true'));

  const clearBeforeAwaitIndex = authContextCode.indexOf('clearSession();');
  const awaitLogoutIndex = authContextCode.indexOf('await logoutRequest');
  assert.ok(
    clearBeforeAwaitIndex !== -1 &&
      awaitLogoutIndex !== -1 &&
      clearBeforeAwaitIndex < awaitLogoutIndex,
    'AuthContext.logout must call clearSession() immediately before awaiting logoutRequest()'
  );
  assert.ok(
    authContextCode.includes('queryClient.clear()'),
    'AuthContext.clearSession must clear React Query cache on logout'
  );

  assert.ok(protectedRouteCode.includes('if (isLoading)'));
  assert.ok(protectedRouteCode.includes('return <FullScreenLoader />'));
  assert.ok(
    protectedRouteCode.includes('state={{ from: `${location.pathname}${location.search}` }}')
  );

  assert.ok(
    !patientTopNavCode.includes('onClick={logout}'),
    'PatientTopNav must not reference undefined logout variable'
  );
  assert.ok(patientTopNavCode.includes('handleLogout()'));

  assert.ok(loginPageCode.includes('[USER_ROLES.PATIENT]'));
  assert.ok(loginPageCode.includes('[USER_ROLES.RECEPTIONIST]'));
  assert.ok(loginPageCode.includes('[USER_ROLES.DOCTOR_ASSISTANT]'));
  assert.ok(loginPageCode.includes('[USER_ROLES.DOCTOR]'));
  assert.ok(loginPageCode.includes('[USER_ROLES.ADMIN]'));
  assert.ok(
    appRoutesCode.includes('allowedRoles={[USER_ROLES.DOCTOR_ASSISTANT, USER_ROLES.DOCTOR]}'),
    'AppRoutes must allow both doctorAssistant and doctor roles on /doctor panel'
  );
});

// ============================================================================
// 6. RBAC, UNAUTHENTICATED REJECTION & CROSS-HOSPITAL ISOLATION TESTS
// ============================================================================

test('7. Unauthenticated requests are rejected with 401 and cross-hospital access is rejected with 403', async () => {
  const protect = require(path.join(backendRoot, 'src/middlewares/auth.middleware'));
  const requireHospitalAccess = require(path.join(
    backendRoot,
    'src/middlewares/requireHospitalAccess.middleware'
  ));
  const authorizeHospital = require(path.join(
    backendRoot,
    'src/middlewares/authorizeHospital.middleware'
  ));
  const authorizeQueueAccess = require(path.join(
    backendRoot,
    'src/middlewares/authorizeQueueAccess.middleware'
  ));
  const Appointment = require(path.join(
    backendRoot,
    'src/modules/appointments/appointments.model'
  ));
  const Queue = require(path.join(backendRoot, 'src/modules/queue/queue.model'));

  // 0. Unauthenticated request to protect middleware must fail with 401
  let unauthError = null;
  await new Promise((resolve) => {
    protect({ headers: {} }, {}, (err) => {
      unauthError = err;
      resolve();
    });
  });
  assert.equal(unauthError?.statusCode, 401);

  const origApptFindById = Appointment.findById;
  const origQueueFindById = Queue.findById;

  try {
    const hospitalAId = '671111111111111111111111';
    const hospitalBId = '672222222222222222222222';
    const doctorAId = '673333333333333333333333';

    // Simulate populated req.user.hospital and req.user.assignedDoctor (as populated by protect middleware)
    const receptionUserHospitalA = {
      _id: '674444444444444444444444',
      role: 'receptionist',
      hospital: { _id: hospitalAId, name: 'Hospital A' },
    };

    const assistantUserHospitalA = {
      _id: '675555555555555555555555',
      role: 'doctorAssistant',
      hospital: { _id: hospitalAId, name: 'Hospital A' },
      assignedDoctor: { _id: doctorAId, specialization: 'Cardiology' },
    };

    // 1. requireHospitalAccess allows same-hospital appointment even when hospital is a populated object
    Appointment.findById = async () => ({
      _id: '676666666666666666666666',
      hospital: hospitalAId,
    });

    let errResult = null;
    await requireHospitalAccess(
      { user: receptionUserHospitalA, params: { id: '676666666666666666666666' } },
      {},
      (err) => {
        errResult = err;
      }
    );
    assert.equal(errResult, undefined, 'Same-hospital receptionist should be allowed');

    // 2. requireHospitalAccess rejects cross-hospital appointment with 403
    Appointment.findById = async () => ({
      _id: '677777777777777777777777',
      hospital: hospitalBId,
    });

    await requireHospitalAccess(
      { user: receptionUserHospitalA, params: { id: '677777777777777777777777' } },
      {},
      (err) => {
        errResult = err;
      }
    );
    assert.equal(
      errResult?.statusCode,
      403,
      'Cross-hospital receptionist access must be rejected with 403'
    );

    // 3. authorizeHospital works with populated req.user.hospital
    const checkBodyHospital = authorizeHospital('body.hospital');
    errResult = null;
    checkBodyHospital(
      { user: receptionUserHospitalA, body: { hospital: hospitalAId } },
      {},
      (err) => {
        errResult = err;
      }
    );
    assert.equal(errResult, undefined);

    checkBodyHospital(
      { user: receptionUserHospitalA, body: { hospital: hospitalBId } },
      {},
      (err) => {
        errResult = err;
      }
    );
    assert.equal(errResult?.statusCode, 403);

    // 4. authorizeQueueAccess allows doctorAssistant for their assigned doctor in their hospital
    Queue.findById = async () => ({
      _id: '678888888888888888888888',
      doctor: doctorAId,
      hospital: hospitalAId,
    });

    errResult = null;
    await authorizeQueueAccess(
      {
        user: assistantUserHospitalA,
        params: { queueId: '678888888888888888888888' },
        method: 'POST',
      },
      {},
      (err) => {
        errResult = err;
      }
    );
    assert.equal(
      errResult,
      undefined,
      'Assigned doctorAssistant should be authorized for their doctor queue'
    );

    // 5. authorizeQueueAccess rejects doctorAssistant for another hospital/doctor queue
    Queue.findById = async () => ({
      _id: '679999999999999999999999',
      doctor: '67aaaaaaaaaaaaaaaaaaaaaa',
      hospital: hospitalBId,
    });

    errResult = null;
    await authorizeQueueAccess(
      {
        user: assistantUserHospitalA,
        params: { queueId: '679999999999999999999999' },
        method: 'POST',
      },
      {},
      (err) => {
        errResult = err;
      }
    );
    assert.equal(
      errResult?.statusCode,
      403,
      'Unassigned/cross-hospital queue access must be rejected'
    );
  } finally {
    Appointment.findById = origApptFindById;
    Queue.findById = origQueueFindById;
  }
});

// ============================================================================
// 7. RESPONSIVE DESIGN VERIFICATION ACROSS PATIENT & ALL FRONTEND PAGES
// ============================================================================

test('8. Patient pages, shared components, and role dashboards enforce mobile-first responsive layouts without horizontal overflow', () => {
  const tailwindConfig = fs.readFileSync(
    path.join(frontendRoot, 'tailwind.config.js'),
    'utf8'
  );
  const indexCss = fs.readFileSync(
    path.join(frontendRoot, 'src/index.css'),
    'utf8'
  );
  const bookingSteps = fs.readFileSync(
    path.join(frontendRoot, 'src/features/patient/components/BookingSteps.jsx'),
    'utf8'
  );
  const notificationBell = fs.readFileSync(
    path.join(frontendRoot, 'src/features/patient/components/NotificationBell.jsx'),
    'utf8'
  );
  const patientTopNav = fs.readFileSync(
    path.join(frontendRoot, 'src/features/patient/components/ui/PatientTopNav.jsx'),
    'utf8'
  );
  const trackPage = fs.readFileSync(
    path.join(frontendRoot, 'src/features/patient/pages/AppointmentTrackPage.jsx'),
    'utf8'
  );
  const bookingSuccessPage = fs.readFileSync(
    path.join(frontendRoot, 'src/features/patient/pages/BookingSuccessPage.jsx'),
    'utf8'
  );
  const dashboardShell = fs.readFileSync(
    path.join(frontendRoot, 'src/components/common/DashboardShell.jsx'),
    'utf8'
  );
  const statsBar = fs.readFileSync(
    path.join(frontendRoot, 'src/features/reception/components/StatsBar.jsx'),
    'utf8'
  );

  // 1. Fluid typography & xs breakpoint + role color tokens in tailwind.config.js
  assert.ok(tailwindConfig.includes("xs: '420px'"), 'Tailwind config must define xs screen breakpoint');
  assert.ok(tailwindConfig.includes('clamp('), 'Tailwind config must use fluid clamp() typography');
  assert.ok(tailwindConfig.includes('role:'), 'Tailwind config must define role color tokens');

  // 2. Global overflow-x protection in index.css
  assert.ok(indexCss.includes('overflow-x: hidden'), 'index.css must prevent horizontal viewport overflow');

  // 3. Patient BookingSteps, NotificationBell, PatientTopNav, TrackPage, BookingSuccessPage responsive fixes
  assert.ok(bookingSteps.includes('min-w-0'), 'BookingSteps must compress cleanly on narrow mobile viewports');
  assert.ok(
    notificationBell.includes('fixed inset-x-3') && notificationBell.includes('sm:w-96'),
    'NotificationBell must fit inside mobile screens without overflowing off-screen'
  );
  assert.ok(
    patientTopNav.includes('px-4 py-6 sm:px-6 sm:py-8 lg:px-8'),
    'PatientTopNav main content must use mobile-first padding'
  );
  assert.ok(
    trackPage.includes('border-t border-upchar-200 pt-3 sm:border-t-0 sm:pt-0 sm:border-l'),
    'AppointmentTrackPage token banner must use top border on mobile and left border on desktop'
  );
  assert.ok(
    bookingSuccessPage.includes('break-all'),
    'BookingSuccessPage must wrap long payment/order IDs on mobile'
  );

  // 4. DashboardShell min-w-0 & Reception StatsBar responsive grid
  assert.ok(
    dashboardShell.includes('min-w-0'),
    'DashboardShell main flex child must include min-w-0 so wide tables/charts do not overflow mobile viewports'
  );
  assert.ok(
    !statsBar.includes('min-w-max'),
    'Reception StatsBar must not use min-w-max that forces horizontal overflow'
  );
});
