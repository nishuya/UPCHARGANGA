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

// Sets a range of protective HTTP headers (X-Frame-Options, HSTS, etc).
app.use(helmet());

// Only our known frontend origin may make credentialed requests — required
// for the httpOnly refresh-token cookie to be sent/received cross-origin.
// In production, CLIENT_URL must match the actual frontend domain.
// In development, it's typically http://localhost:5173 (Vite dev server).
app.use(
  cors({
    origin: (origin, callback) => {
      const allowed = config.clientUrl;
      // Allow requests from the configured CLIENT_URL
      if (!origin || origin === allowed) {
        callback(null, true);
      } else {
        // In development, also allow localhost variations for local testing
        if (config.env === 'development' && (origin === 'http://localhost:5173' || origin === 'http://localhost:3000')) {
          callback(null, true);
        } else {
          callback(new Error('CORS not allowed'));
        }
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
// req.body/query/params — prevents NoSQL injection via operator injection
// (e.g. { "email": { "$gt": "" } }).
// NOTE: express-mongo-sanitize@2 reassigns `req.query`, which throws on
// Express 5 (req.query is a read-only getter there). This custom
// middleware mutates req.query in place instead.
app.use(sanitize);

app.use(compression());

if (config.env !== 'test') {
  app.use(morgan(config.env === 'development' ? 'dev' : 'combined'));
}

app.get('/health', (req, res) => res.status(200).json({ status: 'ok', env: config.env }));

app.use('/api/v1', routes);

// Catch-all for unmatched routes.
app.use((req, res, next) => {
  next(new ApiError(404, `Route ${req.originalUrl} not found`));
});
app.get("/", (req, res) => {
  res.status(200).json({
    success: true,
    message: "UpcharGanga API is running",
    status: "healthy",
  });
});

// Must be registered LAST — Express identifies error middleware by arity (4 args).
app.use(errorHandler);

module.exports = app;
