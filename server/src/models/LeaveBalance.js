import mongoose from 'mongoose';
import { LEAVE_TYPE } from '../utils/constants.js';

const leaveBalanceSchema = new mongoose.Schema(
  {
    employeeId: { type: mongoose.Schema.Types.ObjectId, ref: 'Employee', required: true },
    year: { type: Number, required: true },
    balances: {
      [LEAVE_TYPE.CASUAL]: { type: Number, default: 12 },
      [LEAVE_TYPE.SICK]: { type: Number, default: 8 },
      [LEAVE_TYPE.EARNED]: { type: Number, default: 10 },
    },
    used: {
      [LEAVE_TYPE.CASUAL]: { type: Number, default: 0 },
      [LEAVE_TYPE.SICK]: { type: Number, default: 0 },
      [LEAVE_TYPE.EARNED]: { type: Number, default: 0 },
    },
  },
  { timestamps: true }
);

leaveBalanceSchema.index({ employeeId: 1, year: 1 }, { unique: true });

export const LeaveBalance = mongoose.model('LeaveBalance', leaveBalanceSchema);
