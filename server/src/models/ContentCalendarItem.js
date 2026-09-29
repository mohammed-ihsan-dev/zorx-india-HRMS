import mongoose from 'mongoose';
import { TASK_PRIORITY, CONTENT_CALENDAR_STATUS } from '../utils/constants.js';

const contentCalendarItemSchema = new mongoose.Schema(
  {
    client: { type: String, required: true, trim: true },
    date: { type: Date, required: true },
    assignedEmployee: { type: mongoose.Schema.Types.ObjectId, ref: 'Employee', required: true },
    work: { type: String, required: true, trim: true },
    // Never accepted from the client — always set server-side from the
    // authenticated requester (see contentCalendarController.createItem).
    assignedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    assignmentRemark: { type: String, default: '' },
    deadline: { type: Date, required: true },
    priority: { type: String, enum: Object.values(TASK_PRIORITY), default: TASK_PRIORITY.MEDIUM },
    workStatus: { type: String, enum: Object.values(CONTENT_CALENDAR_STATUS), default: CONTENT_CALENDAR_STATUS.REMAINING },
    completionRemark: { type: String, default: '' },
    clientFeedback: { type: String, default: '' },
  },
  { timestamps: true }
);

contentCalendarItemSchema.index({ assignedEmployee: 1, workStatus: 1 });
contentCalendarItemSchema.index({ date: 1 });
contentCalendarItemSchema.index({ deadline: 1 });

export const ContentCalendarItem = mongoose.model('ContentCalendarItem', contentCalendarItemSchema);
