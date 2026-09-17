import mongoose from 'mongoose';
import { DOCUMENT_TYPE } from '../utils/constants.js';

const profileDocumentSchema = new mongoose.Schema(
  {
    employeeId: { type: mongoose.Schema.Types.ObjectId, ref: 'Employee', required: true },
    uploadedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    documentType: { type: String, enum: Object.values(DOCUMENT_TYPE), required: true },
    originalFileName: { type: String, required: true },
    // Filename on disk under the private uploads directory — never exposed directly to clients.
    storedFileName: { type: String, required: true },
    mimeType: { type: String, required: true },
    sizeBytes: { type: Number, required: true },
    status: { type: String, enum: ['PENDING', 'APPROVED', 'REJECTED'], default: 'PENDING' },
    reviewedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    reviewedAt: { type: Date },
    rejectionReason: { type: String, default: '' },
  },
  { timestamps: true }
);

profileDocumentSchema.index({ employeeId: 1, createdAt: -1 });

export const ProfileDocument = mongoose.model('ProfileDocument', profileDocumentSchema);
