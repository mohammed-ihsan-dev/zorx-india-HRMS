import fs from 'fs';
import { ProfileDocument } from '../models/ProfileDocument.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { sendSuccess } from '../utils/ApiResponse.js';
import { ApiError } from '../utils/ApiError.js';
import { recordAudit } from '../services/auditService.js';
import { assertWithinSizeLimit, absolutePathFor, deleteStoredFile } from '../services/fileStorageService.js';
import { DOCUMENT_TYPE, BACK_OFFICE_ROLES } from '../utils/constants.js';

function requireEmployee(req) {
  const employeeId = req.user.employeeId?._id;
  if (!employeeId) throw ApiError.forbidden('Only employees can perform this action.');
  return employeeId;
}

export const uploadDocument = asyncHandler(async (req, res) => {
  const employeeId = requireEmployee(req);

  if (!req.file) {
    throw ApiError.badRequest('No file was uploaded.');
  }

  const { documentType } = req.body;
  if (!Object.values(DOCUMENT_TYPE).includes(documentType)) {
    deleteStoredFile(req.file.filename);
    throw ApiError.badRequest('Invalid document type.');
  }

  try {
    assertWithinSizeLimit(documentType, req.file.size);
  } catch (err) {
    deleteStoredFile(req.file.filename);
    throw err;
  }

  const document = await ProfileDocument.create({
    employeeId,
    uploadedBy: req.user._id,
    documentType,
    originalFileName: req.file.originalname,
    storedFileName: req.file.filename,
    mimeType: req.file.mimetype,
    sizeBytes: req.file.size,
  });

  await recordAudit({
    actorId: req.user._id,
    action: 'DOCUMENT_UPLOADED',
    targetType: 'ProfileDocument',
    targetId: document._id,
    description: `Uploaded ${documentType.replace(/_/g, ' ').toLowerCase()} document`,
  });

  sendSuccess(res, { statusCode: 201, message: 'Document uploaded successfully.', data: document });
});

export const listMyDocuments = asyncHandler(async (req, res) => {
  const employeeId = requireEmployee(req);
  const documents = await ProfileDocument.find({ employeeId }).sort({ createdAt: -1 });
  sendSuccess(res, { data: documents });
});

export const listDocumentsForEmployee = asyncHandler(async (req, res) => {
  const documents = await ProfileDocument.find({ employeeId: req.params.employeeId }).sort({ createdAt: -1 });
  sendSuccess(res, { data: documents });
});

export const downloadDocument = asyncHandler(async (req, res) => {
  const document = await ProfileDocument.findById(req.params.id);
  if (!document) throw ApiError.notFound('Document not found.');

  const ownEmployeeId = req.user.employeeId?._id?.toString();
  const isOwner = ownEmployeeId && document.employeeId.toString() === ownEmployeeId;
  const isBackOffice = BACK_OFFICE_ROLES.includes(req.user.role);
  if (!isOwner && !isBackOffice) {
    throw ApiError.forbidden('You do not have permission to access this document.');
  }

  const filePath = absolutePathFor(document.storedFileName);
  if (!fs.existsSync(filePath)) {
    throw ApiError.notFound('The document file could not be found.');
  }

  res.setHeader('Content-Type', document.mimeType);
  res.setHeader('Content-Disposition', `inline; filename="${encodeURIComponent(document.originalFileName)}"`);
  fs.createReadStream(filePath).pipe(res);
});
