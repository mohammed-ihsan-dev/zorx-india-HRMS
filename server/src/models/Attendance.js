import mongoose from 'mongoose';
import { ATTENDANCE_STATUS, BREAK_TYPE } from '../utils/constants.js';

const locationPunchSchema = new mongoose.Schema(
  {
    timestamp: { type: Date, required: true },
    latitude: { type: Number, required: true },
    longitude: { type: Number, required: true },
    distanceFromOffice: { type: Number, required: true },
  },
  { _id: false }
);

// One entry per start/end break cycle within a single workday. endTime/durationMinutes
// stay null/0 while the break is active (a "duplicate start" is prevented by only ever
// allowing one entry with endTime: null at a time — see attendanceService.canStartBreak).
const breakEntrySchema = new mongoose.Schema(
  {
    type: { type: String, enum: Object.values(BREAK_TYPE), required: true },
    startTime: { type: Date, required: true },
    endTime: { type: Date, default: null },
    durationMinutes: { type: Number, default: 0 },
  },
  { timestamps: false }
);

const attendanceSchema = new mongoose.Schema(
  {
    employeeId: { type: mongoose.Schema.Types.ObjectId, ref: 'Employee', required: true },
    // Calendar date (midnight, local office timezone) this record belongs to.
    date: { type: Date, required: true },

    checkIn: { type: locationPunchSchema, default: null },
    checkOut: { type: locationPunchSchema, default: null },

    breaks: { type: [breakEntrySchema], default: [] },
    // Actual total break minutes used in the working-time calculation at checkout
    // (sum of completed breaks) — not the configured allowance.
    breakMinutes: { type: Number, default: 0 },
    // How much the actual break time exceeded the configured daily allowance, if at all.
    extraBreakMinutes: { type: Number, default: 0 },
    totalWorkingMinutes: { type: Number, default: 0 },
    status: {
      type: String,
      enum: Object.values(ATTENDANCE_STATUS),
      default: ATTENDANCE_STATUS.ABSENT,
    },
    lateMinutes: { type: Number, default: 0 },
    overtimeMinutes: { type: Number, default: 0 },
  },
  { timestamps: true }
);

attendanceSchema.index({ employeeId: 1, date: 1 }, { unique: true });

export const Attendance = mongoose.model('Attendance', attendanceSchema);
