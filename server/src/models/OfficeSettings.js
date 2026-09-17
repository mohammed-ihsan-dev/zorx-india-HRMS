import mongoose from 'mongoose';
import { env } from '../config/env.js';

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
    updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
  },
  { timestamps: true }
);

officeSettingsSchema.statics.getSingleton = async function getSingleton() {
  let settings = await this.findOne();
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
