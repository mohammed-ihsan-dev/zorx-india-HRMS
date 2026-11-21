import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import cookieParser from 'cookie-parser';
import mongoSanitize from 'express-mongo-sanitize';

import { env, isTest } from './config/env.js';
import routes from './routes/index.js';
import { notFoundHandler, errorHandler } from './middleware/errorHandler.js';
import { PROFILE_PICTURES_DIR } from './services/fileStorageService.js';
import { createApiLimiter } from './middleware/apiRateLimit.js';
import { isAllowedOrigin } from './utils/origins.js';
import { readFileSync } from 'node:fs';
import crypto from 'node:crypto';

const SERVER_VERSION = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8')).version;
const STARTED_AT = new Date().toISOString();

/** "1" → 1 (hop count), "true"/"false" → boolean, anything else → Express trust string (e.g. "loopback, 10.0.0.0/8"). */
function parseTrustProxy(value) {
  const v = String(value).trim();
  if (/^\d+$/.test(v)) return Number(v);
  if (v === 'true' || v === 'false') return v === 'true';
  return v;
}

/**
 * `dbReady` (server.js): a promise for the MongoDB connection. Until it resolves,
 * API requests wait for it (up to DB_WAIT_MS) instead of failing; health checks
 * and the version endpoint never wait.
 */
const DB_WAIT_MS = 30_000;

export function createApp({ dbReady = null } = {}) {
  const app = express();

  // Render (and most PaaS hosts) terminate TLS at a reverse proxy — without this,
  // req.protocol always reports "http", which would bake wrong http:// URLs into
  // stored profile picture links.
  // It also decides which X-Forwarded-For entry becomes req.ip, which Company
  // Wi-Fi attendance relies on — set TRUST_PROXY to match the real proxy chain.
  app.set('trust proxy', parseTrustProxy(env.attendanceNetwork.trustProxy));

  app.use(helmet({ crossOriginResourcePolicy: { policy: 'cross-origin' } }));
  app.use(
    cors({
      origin: (origin, callback) => callback(null, !origin || isAllowedOrigin(origin)),
      credentials: true,
      // Lets the browser read export filenames (reports CSV/PDF) across origins.
      exposedHeaders: ['Content-Disposition', 'X-Request-Id', 'Server-Timing'],
      optionsSuccessStatus: 204,
    })
  );
  // API responses are private, live data (attendance, leave balances…): never
  // let a browser, proxy or CDN reuse one. /uploads stays cacheable (served below).
  app.use('/api', (req, res, next) => {
    res.setHeader('Cache-Control', 'no-store');
    // Timing instrumentation: total server time per API call, shown in the browser's
    // DevTools (Network → Timing) as "app" — no effect on the response body.
    const started = process.hrtime.bigint();
    // Request id for tracing one call through Cloudflare → Render logs (Cloudflare's ray id when present).
    req.id = req.get('cf-ray') || crypto.randomUUID();
    res.setHeader('X-Request-Id', req.id);
    const json = res.json.bind(res);
    res.json = (body) => {
      if (!res.headersSent) res.setHeader('Server-Timing', `app;dur=${(Number(process.hrtime.bigint() - started) / 1e6).toFixed(1)}`);
      return json(body);
    };
    next();
  });
  app.use(express.json({ limit: '2mb' }));
  app.use(cookieParser());
  app.use(mongoSanitize());

  if (!isTest) {
    // Production log line = Apache "combined" + response time, to spot slow requests in Render logs.
    // Never logs headers or bodies (tokens, cookies, passwords stay out of the logs).
    morgan.token('rid', (req) => req.id || '-');
    app.use(morgan(env.nodeEnv === 'production' ? ':remote-addr - :remote-user [:date[clf]] ":method :url HTTP/:http-version" :status :res[content-length] ":referrer" ":user-agent" :response-time ms rid=:rid' : 'dev'));
  }

  // Per signed-in user (not per IP: the office shares one IP) — see apiRateLimit.js.
  const apiLimiter = createApiLimiter({ skip: () => env.nodeEnv === 'development' });
  app.use('/api', apiLimiter);

  app.get('/health', (req, res) => {
    res.json({ success: true, status: 'ok', message: 'ZORX INDIA API is running.' });
  });

  app.get('/api/health', (req, res) => {
    res.json({ success: true, status: 'ok', message: 'ZORX INDIA API is running.' });
  });

  // Deployment fingerprint (no secrets): which commit this backend runs. Render sets
  // RENDER_GIT_COMMIT on every deploy; GIT_COMMIT can be set elsewhere.
  app.get('/api/version', (req, res) => {
    const commit = process.env.RENDER_GIT_COMMIT || process.env.GIT_COMMIT || null;
    res.json({ success: true, version: SERVER_VERSION, commit: commit ? commit.slice(0, 7) : null, branch: process.env.RENDER_GIT_BRANCH || null, startedAt: STARTED_AT });
  });

  // Profile pictures only — intentionally public (rendered as <img> across the
  // app), unlike the private/authenticated employee document downloads.
  app.use('/uploads/profile-pictures', express.static(PROFILE_PICTURES_DIR, { maxAge: '7d' }));

  if (dbReady) {
    let connected = false;
    dbReady.then(() => (connected = true), () => {});
    app.use('/api', (req, res, next) => {
      if (connected) return next();
      let timer;
      const timeout = new Promise((_, reject) => {
        timer = setTimeout(() => reject(new Error('db wait timeout')), DB_WAIT_MS);
      });
      Promise.race([dbReady, timeout])
        .then(() => next())
        .catch(() => {
          res.setHeader('Retry-After', '5');
          res.status(503).json({ success: false, code: 'SERVER_STARTING', message: 'The server is starting up. Please try again in a moment.' });
        })
        .finally(() => clearTimeout(timer));
    });
  }

  app.use('/api', routes);

  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}
