import mongoose from 'mongoose';
import { ANNOUNCEMENT_PRIORITY, ANNOUNCEMENT_AUDIENCE } from '../utils/constants.js';

const announcementSchema = new mongoose.Schema(
  {
    title: { type: String, required: true, trim: true },
    content: { type: String, required: true },
    priority: {
      type: String,
      enum: Object.values(ANNOUNCEMENT_PRIORITY),
      default: ANNOUNCEMENT_PRIORITY.NORMAL,
    },
    audience: {
      type: String,
      enum: Object.values(ANNOUNCEMENT_AUDIENCE),
      default: ANNOUNCEMENT_AUDIENCE.ALL,
    },
    departmentId: { type: mongoose.Schema.Types.ObjectId, ref: 'Department', default: null },
    publishDate: { type: Date, default: () => new Date() },
    expiryDate: { type: Date, default: null },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  },
  { timestamps: true }
);

announcementSchema.index({ publishDate: -1 });

export const Announcement = mongoose.model('Announcement', announcementSchema);
