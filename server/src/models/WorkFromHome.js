import mongoose from 'mongoose';
import { WFH_STATUS } from '../utils/constants.js';

const workFromHomeSchema = new mongoose.Schema(
  {
    employeeId: { type: mongoose.Schema.Types.ObjectId, ref: 'Employee', required: true },
    // Office-calendar-day key (UTC midnight of the IST date), the same format as
    // Attendance.date, so an approved request matches a check-in day exactly.
    date: { type: Date, required: true },
    reason: { type: String, required: true, trim: true },
    workPlan: { type: String, required: true, trim: true },
    remark: { type: String, default: '', trim: true },
    status: {
      type: String,
      enum: Object.values(WFH_STATUS),
      default: WFH_STATUS.PENDING,
    },
    reviewedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    reviewedAt: { type: Date, default: null },
    reviewNote: { type: String, default: '' },
  },
  { timestamps: true }
);

workFromHomeSchema.index({ employeeId: 1, date: 1 });
workFromHomeSchema.index({ status: 1, date: -1 });

export const WorkFromHome = mongoose.model('WorkFromHome', workFromHomeSchema);
