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
  },
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
