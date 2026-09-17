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
  mongoDb: process.env.MONGODB_DB || 'zorx-ms',

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
};

export const isTest = env.nodeEnv === 'test';
