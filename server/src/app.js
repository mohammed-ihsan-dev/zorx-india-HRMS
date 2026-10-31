import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import cookieParser from 'cookie-parser';
import mongoSanitize from 'express-mongo-sanitize';
import rateLimit from 'express-rate-limit';

import { env, isTest } from './config/env.js';
import routes from './routes/index.js';
import { notFoundHandler, errorHandler } from './middleware/errorHandler.js';
import { PROFILE_PICTURES_DIR } from './services/fileStorageService.js';

/** "1" → 1 (hop count), "true"/"false" → boolean, anything else → Express trust string (e.g. "loopback, 10.0.0.0/8"). */
function parseTrustProxy(value) {
  const v = String(value).trim();
  if (/^\d+$/.test(v)) return Number(v);
  if (v === 'true' || v === 'false') return v === 'true';
  return v;
}

export function createApp() {
  const app = express();

  // Render (and most PaaS hosts) terminate TLS at a reverse proxy — without this,
  // req.protocol always reports "http", which would bake wrong http:// URLs into
  // stored profile picture links.
  // It also decides which X-Forwarded-For entry becomes req.ip, which Company
  // Wi-Fi attendance relies on — set TRUST_PROXY to match the real proxy chain.
  app.set('trust proxy', parseTrustProxy(env.attendanceNetwork.trustProxy));

  app.use(helmet({ crossOriginResourcePolicy: { policy: 'cross-origin' } }));
  const allowedOrigins = (env.clientOrigins || [env.clientOrigin]).map((o) =>
    o.replace(/\/+$/, '')
  );

  app.use(
    cors({
      origin: (origin, callback) => {
        if (!origin) return callback(null, true);
        const cleanOrigin = origin.replace(/\/+$/, '');
        if (allowedOrigins.includes(cleanOrigin) || env.nodeEnv === 'development') {
          return callback(null, true);
        }
        return callback(null, false);
      },
      credentials: true,
      // Lets the browser read export filenames (reports CSV/PDF) across origins.
      exposedHeaders: ['Content-Disposition'],
      optionsSuccessStatus: 204,
    })
  );
  // API responses are private, live data (attendance, leave balances…): never
  // let a browser, proxy or CDN reuse one. /uploads stays cacheable (served below).
  app.use('/api', (req, res, next) => {
    res.setHeader('Cache-Control', 'no-store');
    next();
  });
  app.use(express.json({ limit: '2mb' }));
  app.use(cookieParser());
  app.use(mongoSanitize());

  if (!isTest) {
    app.use(morgan(env.nodeEnv === 'production' ? 'combined' : 'dev'));
  }

  const apiLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    limit: env.nodeEnv === 'development' ? 5000 : 300,
    skip: () => env.nodeEnv === 'development',
    standardHeaders: true,
    legacyHeaders: false,
  });
  app.use('/api', apiLimiter);

  app.get('/health', (req, res) => {
    res.json({ success: true, status: 'ok', message: 'ZORX INDIA API is running.' });
  });

  app.get('/api/health', (req, res) => {
    res.json({ success: true, status: 'ok', message: 'ZORX INDIA API is running.' });
  });

  // Profile pictures only — intentionally public (rendered as <img> across the
  // app), unlike the private/authenticated employee document downloads.
  app.use('/uploads/profile-pictures', express.static(PROFILE_PICTURES_DIR, { maxAge: '7d' }));

  app.use('/api', routes);

  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}
