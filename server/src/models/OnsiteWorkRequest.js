import mongoose from 'mongoose';
import { ONSITE_STATUS } from '../utils/constants.js';

// One status change, kept forever (submitted / edited / cancelled / approved / rejected).
const historyEntrySchema = new mongoose.Schema(
  {
    action: { type: String, required: true },
    fromStatus: { type: String, default: null },
    toStatus: { type: String, required: true },
    byUserId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    byName: { type: String, default: '' },
    at: { type: Date, required: true },
    comment: { type: String, default: '' },
  },
  { _id: false }
);

const onsiteWorkRequestSchema = new mongoose.Schema(
  {
    employeeId: { type: mongoose.Schema.Types.ObjectId, ref: 'Employee', required: true },
    // Office-calendar-day key (UTC midnight of the IST date) — the same format as
    // Attendance.date, so an approved request matches a check-in day exactly.
    date: { type: Date, required: true },
    reason: { type: String, required: true, trim: true },
    workLocation: { type: String, required: true, trim: true },
    description: { type: String, default: '', trim: true },
    status: { type: String, enum: Object.values(ONSITE_STATUS), default: ONSITE_STATUS.PENDING },
    // true while PENDING or APPROVED. Backs the unique index below: at most one
    // active request per employee per day, while rejected/cancelled ones never block a new one.
    active: { type: Boolean, default: true },
    submittedAt: { type: Date, default: () => new Date() },
    reviewedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    reviewerName: { type: String, default: '' },
    reviewedAt: { type: Date, default: null },
    reviewComment: { type: String, default: '' },
    cancelledAt: { type: Date, default: null },
    history: { type: [historyEntrySchema], default: [] },
  },
  { timestamps: true }
);

onsiteWorkRequestSchema.index({ employeeId: 1, date: 1 }, { unique: true, partialFilterExpression: { active: true }, name: 'one_active_per_employee_day' });
onsiteWorkRequestSchema.index({ status: 1, date: -1 });

export const OnsiteWorkRequest = mongoose.model('OnsiteWorkRequest', onsiteWorkRequestSchema);
