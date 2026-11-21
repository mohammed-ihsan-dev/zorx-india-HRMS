import mongoose from 'mongoose';
import { env } from '../config/env.js';
import { ATTENDANCE_VERIFICATION_MODE } from '../utils/constants.js';

const officeSettingsSchema = new mongoose.Schema(
  {
    // Singleton document — there is only ever one office settings record for now.
    // The schema is intentionally flat so a future "offices" collection can be
    // introduced without breaking this document's shape.
    officeName: { type: String, default: 'ZORX INDIA' },
    latitude: { type: Number, required: true, min: -90, max: 90 },
    longitude: { type: Number, required: true, min: -180, max: 180 },
    attendanceRadius: { type: Number, required: true, min: 10 },
    workingStartTime: { type: String, required: true }, // "HH:mm"
    workingEndTime: { type: String, required: true }, // "HH:mm"
    breakDurationMinutes: { type: Number, required: true, min: 0 },
    timezone: { type: String, default: 'Asia/Kolkata' },
    lateThresholdMinutes: { type: Number, default: 15, min: 0 },
    halfDayThresholdMinutes: { type: Number, default: 240, min: 0 },
    overtimeEnabled: { type: Boolean, default: true },
    attendanceVerificationMode: {
      type: String,
      enum: Object.values(ATTENDANCE_VERIFICATION_MODE),
      default: ATTENDANCE_VERIFICATION_MODE.GPS,
    },
    updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
  },
  { timestamps: true }
);

// The one settings document is read on almost every attendance call (often twice
// per check-in). It changes only from Office Settings, so keep a copy for a few
// seconds; every write through Mongoose drops it at once. Each caller gets its own
// fresh document (deep copy), so nothing is shared between requests.
const SETTINGS_CACHE_MS = () => {
  const raw = process.env.SETTINGS_CACHE_MS;
  if (raw !== undefined && raw !== '') return Math.max(0, Number(raw) || 0);
  return process.env.NODE_ENV === 'test' ? 0 : 30_000;
};
let cached = null; // { at, gen, raw }
let generation = 0;
const dropCache = () => {
  generation += 1;
  cached = null;
};
for (const op of ['updateOne', 'updateMany', 'findOneAndUpdate', 'findOneAndReplace', 'replaceOne', 'deleteOne', 'deleteMany', 'findOneAndDelete']) {
  officeSettingsSchema.pre(op, { document: false, query: true }, dropCache);
  officeSettingsSchema.post(op, { document: false, query: true }, dropCache);
}
for (const op of ['save', 'deleteOne', 'updateOne']) {
  officeSettingsSchema.pre(op, { document: true, query: false }, dropCache);
  officeSettingsSchema.post(op, { document: true, query: false }, dropCache);
}
const deepCopy = (obj) => mongoose.mongo.BSON.deserialize(mongoose.mongo.BSON.serialize(obj));

officeSettingsSchema.statics.getSingleton = async function getSingleton() {
  const ttl = SETTINGS_CACHE_MS();
  if (ttl && cached && cached.gen === generation && Date.now() - cached.at <= ttl) {
    return this.hydrate(deepCopy(cached.raw));
  }
  const gen = generation;
  const raw = ttl ? await this.findOne().lean() : null;
  if (raw) {
    if (gen === generation) cached = { at: Date.now(), gen, raw };
    return this.hydrate(deepCopy(raw));
  }
  let settings = ttl ? null : await this.findOne();
  if (!settings) {
    settings = await this.create({
      officeName: 'ZORX INDIA',
      latitude: env.office.latitude,
      longitude: env.office.longitude,
      attendanceRadius: env.office.radiusMeters,
      workingStartTime: env.workingStartTime,
      workingEndTime: env.workingEndTime,
      breakDurationMinutes: env.breakDurationMinutes,
      timezone: env.timezone,
      lateThresholdMinutes: env.lateThresholdMinutes,
      halfDayThresholdMinutes: env.halfDayThresholdMinutes,
      overtimeEnabled: true,
    });
  }
  return settings;
};

export const OfficeSettings = mongoose.model('OfficeSettings', officeSettingsSchema);
