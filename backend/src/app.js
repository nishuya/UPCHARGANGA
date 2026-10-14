const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const cookieParser = require('cookie-parser');
const sanitize = require('./middlewares/sanitize.middleware');
const compression = require('compression');
const morgan = require('morgan');

const config = require('./config/env');
const routes = require('./routes');
const errorHandler = require('./middlewares/error.middleware');
const ApiError = require('./errors/ApiError');

/**
 * Builds and returns the Express app WITHOUT connecting to MongoDB or
 * starting a listener. Kept separate from server.js so the app object can
 * be imported directly in tests (supertest) without needing a live DB or
 * an open port.
 */
const app = express();

// Trust the first reverse proxy (Render, Railway, Vercel, Nginx) so req.secure,
// X-Forwarded-Proto, and rate-limiter client IPs work accurately in production.
app.set('trust proxy', 1);

// Sets a range of protective HTTP headers (X-Frame-Options, HSTS, etc).
app.use(helmet());

const isOriginAllowed = (origin) => {
  if (!origin) return true;
  const normalized = config.normalizeOrigin ? config.normalizeOrigin(origin) : origin.replace(/\/+$/, '');
  const allowedList =
    Array.isArray(config.clientUrls) && config.clientUrls.length
      ? config.clientUrls
      : [config.clientUrl?.replace(/\/+$/, '')].filter(Boolean);

  if (allowedList.includes(normalized)) {
    return true;
  }

  if (
    config.env !== 'production' &&
    (normalized === 'http://localhost:5173' ||
      normalized === 'http://localhost:4173' ||
      normalized === 'http://localhost:3000' ||
      normalized === 'http://127.0.0.1:5173' ||
      normalized === 'http://127.0.0.1:4173')
  ) {
    return true;
  }

  return false;
};

// Only our known frontend origin(s) may make credentialed requests — required
// for the httpOnly refresh-token cookie to be sent/received cross-origin.
app.use(
  cors({
    origin: (origin, callback) => {
      if (isOriginAllowed(origin)) {
        callback(null, true);
      } else {
        callback(new ApiError(403, 'CORS not allowed'));
      }
    },
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
    maxAge: 86400, // 24 hours
  })
);

// Body size limits are a cheap defense against oversized-payload abuse.
app.use(express.json({ limit: '10kb' }));
app.use(express.urlencoded({ extended: true, limit: '10kb' }));

app.use(cookieParser());

// Strips any key starting with '$' or containing '.' from
// req.body/query/params — prevents NoSQL injection via operator injection.
app.use(sanitize);

app.use(compression());

if (config.env !== 'test') {
  app.use(morgan(config.env === 'development' ? 'dev' : 'combined'));
}

app.get('/', (req, res) => {
  res.status(200).json({
    success: true,
    message: 'UpcharGanga API is running',
    status: 'healthy',
  });
});

app.get('/health', (req, res) => res.status(200).json({ status: 'ok', env: config.env }));

app.use('/api/v1', routes);

// Catch-all for unmatched routes — preserves genuine 404 JSON responses for unknown API routes.
app.use((req, res, next) => {
  next(new ApiError(404, `Route ${req.originalUrl} not found`));
});

// Must be registered LAST — Express identifies error middleware by arity (4 args).
app.use(errorHandler);

module.exports = app;
