import mongoose from 'mongoose';
import { EDIT_REQUEST_FIELD, EDIT_REQUEST_STATUS } from '../utils/constants.js';

const editRequestSchema = new mongoose.Schema(
  {
    employeeId: { type: mongoose.Schema.Types.ObjectId, ref: 'Employee', required: true },
    requestedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    field: { type: String, enum: Object.values(EDIT_REQUEST_FIELD), required: true },
    currentValue: { type: String, default: '' },
    requestedValue: { type: String, required: true, trim: true },
    reason: { type: String, required: true, trim: true },
    status: { type: String, enum: Object.values(EDIT_REQUEST_STATUS), default: EDIT_REQUEST_STATUS.PENDING },
    reviewedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    reviewedAt: { type: Date, default: null },
    reviewComment: { type: String, default: '' },
  },
  { timestamps: true }
);

editRequestSchema.index({ employeeId: 1, status: 1 });

export const EditRequest = mongoose.model('EditRequest', editRequestSchema);
