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

export function createApp() {
  const app = express();

  // Render (and most PaaS hosts) terminate TLS at a reverse proxy — without this,
  // req.protocol always reports "http", which would bake wrong http:// URLs into
  // stored profile picture links.
  app.set('trust proxy', 1);

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
      optionsSuccessStatus: 204,
    })
  );
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
