import { env } from '../config/env.js';

const clean = (o) => String(o || '').replace(/\/+$/, '');
const allowed = () => new Set((env.clientOrigins || [env.clientOrigin]).map(clean));

/** True for the app's own front-end origins (and any origin in development). */
export function isAllowedOrigin(origin) {
  if (!origin) return false;
  return allowed().has(clean(origin)) || env.nodeEnv === 'development';
}
