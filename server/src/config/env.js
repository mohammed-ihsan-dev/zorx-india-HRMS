import dotenv from 'dotenv';

dotenv.config();

function required(name, fallback) {
  const value = process.env[name] ?? fallback;
  if (value === undefined) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

const defaultOrigins = [
  'https://zorxindia.online',
  'https://www.zorxindia.online',
  'https://zorxindiahrms.vercel.app',
  'http://localhost:5173',
  'http://localhost:5174',
  'http://127.0.0.1:5173',
  'http://127.0.0.1:5174',
];

const parsedOrigins = process.env.CLIENT_ORIGIN
  ? process.env.CLIENT_ORIGIN.split(',').map((o) => o.trim()).filter(Boolean)
  : [];

const clientOrigins = Array.from(new Set([...defaultOrigins, ...parsedOrigins]));

const CLOUDINARY_VARS = ['CLOUDINARY_URL', 'CLOUDINARY_CLOUD_NAME', 'CLOUDINARY_API_KEY', 'CLOUDINARY_API_SECRET'];
const envValue = (name) => (process.env[name] || '').trim().replace(/^(['"])(.*)\1$/, '$2');

/**
 * Cloudinary settings from either CLOUDINARY_URL (cloudinary://<key>:<secret>@<cloud>)
 * or the three separate variables (which win where set). Values are trimmed and
 * stripped of surrounding quotes (a common .env / dashboard paste mistake).
 * `expected` = production, or any Cloudinary variable is set: then a broken setup
 * is an error, never a silent fall-back to local disk. `problem` names what is
 * missing — variable names only, never values.
 */
export function parseCloudinary(nodeEnv = process.env.NODE_ENV) {
  let fromUrl = {};
  let urlInvalid = false;
  const rawUrl = envValue('CLOUDINARY_URL');
  if (rawUrl) {
    try {
      const u = new URL(rawUrl);
      if (u.protocol !== 'cloudinary:' || !u.hostname || !u.username || !u.password) throw new Error('shape');
      fromUrl = { cloudName: u.hostname, apiKey: decodeURIComponent(u.username), apiSecret: decodeURIComponent(u.password) };
    } catch {
      urlInvalid = true;
    }
  }
  const cloudName = envValue('CLOUDINARY_CLOUD_NAME') || fromUrl.cloudName || '';
  const apiKey = envValue('CLOUDINARY_API_KEY') || fromUrl.apiKey || '';
  const apiSecret = envValue('CLOUDINARY_API_SECRET') || fromUrl.apiSecret || '';
  const enabled = Boolean(cloudName && apiKey && apiSecret);
  const anySet = CLOUDINARY_VARS.some((n) => envValue(n));
  const expected = nodeEnv === 'production' || anySet;

  let problem = null;
  if (!enabled) {
    const missing = [!cloudName && 'CLOUDINARY_CLOUD_NAME', !apiKey && 'CLOUDINARY_API_KEY', !apiSecret && 'CLOUDINARY_API_SECRET'].filter(Boolean);
    problem = urlInvalid
      ? 'CLOUDINARY_URL is set but is not in the form cloudinary://<api_key>:<api_secret>@<cloud_name>.'
      : anySet
        ? `Cloudinary is only partly configured; missing: ${missing.join(', ')} (or set CLOUDINARY_URL).`
        : 'No Cloudinary variables are set (CLOUDINARY_URL, or CLOUDINARY_CLOUD_NAME + CLOUDINARY_API_KEY + CLOUDINARY_API_SECRET).';
  }
  return {
    cloudName,
    apiKey,
    apiSecret,
    folder: (envValue('CLOUDINARY_FOLDER') || 'zorx_hrms').replace(/^\/+|\/+$/g, ''),
    enabled,
    expected,
    problem,
  };
}

export const env = {
  nodeEnv: process.env.NODE_ENV || 'development',
  port: Number(process.env.PORT) || 5000,

  mongoUri: required('MONGODB_URI'),
  mongoDb: process.env.MONGODB_DB || 'zorx_ms',

  jwtSecret: required('JWT_SECRET'),
  jwtExpiresIn: process.env.JWT_EXPIRES_IN || '8h',

  clientOrigin: process.env.CLIENT_ORIGIN || 'http://localhost:5173',
  clientOrigins,

  office: {
    latitude: Number(process.env.OFFICE_LATITUDE) || 10.991401,
    longitude: Number(process.env.OFFICE_LONGITUDE) || 76.442772,
    radiusMeters: Number(process.env.OFFICE_ATTENDANCE_RADIUS) || 200,
  },

  timezone: process.env.TIMEZONE || 'Asia/Kolkata',
  workingStartTime: process.env.WORKING_START_TIME || '09:30',
  workingEndTime: process.env.WORKING_END_TIME || '18:00',
  breakDurationMinutes: Number(process.env.BREAK_DURATION_MINUTES) || 60,
  lateThresholdMinutes: Number(process.env.LATE_THRESHOLD_MINUTES) || 15,
  halfDayThresholdMinutes: Number(process.env.HALF_DAY_THRESHOLD_MINUTES) || 240,

  // Outgoing email (password reset). Unconfigured = reset emails can't be sent;
  // the forgot-password endpoint still answers generically and logs a warning.
  mail: {
    host: process.env.SMTP_HOST || '',
    port: Number(process.env.SMTP_PORT) || 587,
    secure: process.env.SMTP_SECURE === 'true',
    user: process.env.SMTP_USER || '',
    pass: process.env.SMTP_PASS || '',
    from: process.env.MAIL_FROM || process.env.SMTP_USER || '',
    // Resend HTTPS API (preferred; works where outbound SMTP ports are blocked,
    // e.g. Render free instances). When set, it is used instead of SMTP.
    resendApiKey: process.env.RESEND_API_KEY || '',
  },
  // Cloudinary image storage (profile pictures). CLOUDINARY_URL is
  // cloudinary://<api_key>:<api_secret>@<cloud_name>; the separate variables
  // override it. Unconfigured = images stay on the server's own disk.
  cloudinary: parseCloudinary(),
  // Public URL of the frontend, used to build the reset link.
  appUrl: (process.env.APP_URL || 'http://localhost:5173').replace(/\/+$/, ''),

  // Company Wi-Fi attendance. Server-side only — never sent to clients.
  // ATTENDANCE_WIFI_ALLOWED_IPS: comma-separated public IPs and/or CIDR ranges
  // (e.g. "43.229.89.156" or "2403:a080:84f:ca41::/64"). Empty = Wi-Fi mode
  // cannot be enabled and rejects every punch (fail closed).
  // TRUST_PROXY: Express "trust proxy" value used to derive the client IP from
  // X-Forwarded-For. Defaults to 1 (the previous hard-coded behavior).
  attendanceNetwork: {
    allowedIps: process.env.ATTENDANCE_WIFI_ALLOWED_IPS || '',
    trustProxy: process.env.TRUST_PROXY ?? '1',
  },

  // Non-persisted virtual test account — see utils/virtualTestUser.js. Defaults
  // to fully disabled; must be explicitly opted into, and in production an
  // additional explicit flag is required on top of that.
  testUser: {
    enabled: process.env.TEST_USER_ENABLED === 'true',
    email: process.env.TEST_USER_EMAIL || '',
    password: process.env.TEST_USER_PASSWORD || '',
    allowInProduction: process.env.ALLOW_VIRTUAL_TEST_USER === 'true',
  },
};

export const isTest = env.nodeEnv === 'test';
