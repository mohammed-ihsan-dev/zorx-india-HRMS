import mongoose from 'mongoose';
import { TASK_PRIORITY, CONTENT_CALENDAR_STATUS } from '../utils/constants.js';

const contentCalendarItemSchema = new mongoose.Schema(
  {
    clientId: { type: mongoose.Schema.Types.ObjectId, ref: 'Client', required: true },
    client: { type: String, default: '', trim: true },
    // Assignment Date — when the work was handed to the employee. Kept as
    // `date` for backward compatibility with existing records/queries/reports;
    // the frontend labels it "Assignment Date" everywhere it's shown.
    date: { type: Date, required: true },
    assignedEmployee: { type: mongoose.Schema.Types.ObjectId, ref: 'Employee', required: true },
    work: { type: String, required: true, trim: true },
    // Never accepted from the client — always set server-side from the
    // authenticated requester (see contentCalendarController.createItem).
    assignedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    assignmentRemark: { type: String, default: '' },
    // Deadline — when the employee must submit the completed work internally.
    deadline: { type: Date, required: true },
    // Output Date — when the finished work is scheduled to go out to the
    // client. This is the ONLY date the calendar view positions items by.
    // Not required at the schema level (existing records predate this field
    // and must remain editable without being forced to backfill it); new
    // items are required to supply it via the create validator instead.
    outputDate: { type: Date, default: null },
    priority: { type: String, enum: Object.values(TASK_PRIORITY), default: TASK_PRIORITY.MEDIUM },
    workStatus: { type: String, enum: Object.values(CONTENT_CALENDAR_STATUS), default: CONTENT_CALENDAR_STATUS.REMAINING },
    completionRemark: { type: String, default: '' },
    clientFeedback: { type: String, default: '' },
  },
  { timestamps: true }
);

contentCalendarItemSchema.index({ clientId: 1 });
contentCalendarItemSchema.index({ assignedEmployee: 1, workStatus: 1 });
contentCalendarItemSchema.index({ date: 1 });
contentCalendarItemSchema.index({ deadline: 1 });
contentCalendarItemSchema.index({ outputDate: 1 });

export const ContentCalendarItem = mongoose.model('ContentCalendarItem', contentCalendarItemSchema);
