import mongoose from 'mongoose';
import { LEAVE_TYPE, LEAVE_STATUS } from '../utils/constants.js';

const leaveSchema = new mongoose.Schema(
  {
    employeeId: { type: mongoose.Schema.Types.ObjectId, ref: 'Employee', required: true },
    leaveType: { type: String, enum: Object.values(LEAVE_TYPE), required: true },
    startDate: { type: Date, required: true },
    endDate: { type: Date, required: true },
    days: { type: Number, required: true, min: 0.5 },
    reason: { type: String, required: true, trim: true },
    // Optional supporting proof (e.g. medical certificate) — reuses the existing
    // ProfileDocument storage/authorization mechanism rather than a separate one.
    supportingDocumentId: { type: mongoose.Schema.Types.ObjectId, ref: 'ProfileDocument', default: null },
    status: {
      type: String,
      enum: Object.values(LEAVE_STATUS),
      default: LEAVE_STATUS.PENDING,
    },
    reviewedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    reviewedAt: { type: Date, default: null },
    reviewNote: { type: String, default: '' },
  },
  { timestamps: true }
);

leaveSchema.index({ employeeId: 1, status: 1 });

export const Leave = mongoose.model('Leave', leaveSchema);
