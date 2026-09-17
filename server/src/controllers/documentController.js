import fs from 'fs';
import { ProfileDocument } from '../models/ProfileDocument.js';
import { User } from '../models/User.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { sendSuccess } from '../utils/ApiResponse.js';
import { ApiError } from '../utils/ApiError.js';
import { recordAudit } from '../services/auditService.js';
import { notify } from '../services/notificationService.js';
import { assertWithinSizeLimit, absolutePathFor, deleteStoredFile } from '../services/fileStorageService.js';
import { DOCUMENT_TYPE, BACK_OFFICE_ROLES, NOTIFICATION_TYPE } from '../utils/constants.js';

function requireEmployee(req) {
  const employeeId = req.user.employeeId?._id;
  if (!employeeId) throw ApiError.forbidden('Only employees can perform this action.');
  return employeeId;
}

export const uploadDocument = asyncHandler(async (req, res) => {
  const employeeId = requireEmployee(req);
  const isBackOffice = BACK_OFFICE_ROLES.includes(req.user.role);

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
    status: isBackOffice ? 'APPROVED' : 'PENDING',
  });

  if (!isBackOffice) {
    const backOfficeUsers = await User.find({ role: { $in: BACK_OFFICE_ROLES }, status: 'ACTIVE' });
    await Promise.all(
      backOfficeUsers.map((u) =>
        notify({
          userId: u._id,
          type: NOTIFICATION_TYPE.EDIT_REQUEST_SUBMITTED,
          title: 'New profile document uploaded',
          message: `${req.user.employeeId?.firstName || 'Employee'} uploaded a ${documentType.replace(/_/g, ' ').toLowerCase()} document awaiting approval.`,
          link: '/admin/edit-requests',
        })
      )
    );
  }

  await recordAudit({
    actorId: req.user._id,
    action: 'DOCUMENT_UPLOADED',
    targetType: 'ProfileDocument',
    targetId: document._id,
    description: `Uploaded ${documentType.replace(/_/g, ' ').toLowerCase()} document`,
  });

  sendSuccess(res, { statusCode: 201, message: isBackOffice ? 'Document uploaded.' : 'Document uploaded. Awaiting admin approval.', data: document });
});

export const approveDocument = asyncHandler(async (req, res) => {
  const document = await ProfileDocument.findById(req.params.id).populate('employeeId');
  if (!document) throw ApiError.notFound('Document not found.');

  document.status = 'APPROVED';
  document.reviewedBy = req.user._id;
  document.reviewedAt = new Date();
  await document.save();

  const employeeUser = await User.findOne({ employeeId: document.employeeId._id });
  if (employeeUser) {
    await notify({
      userId: employeeUser._id,
      type: NOTIFICATION_TYPE.EDIT_REQUEST_APPROVED,
      title: 'Profile document approved',
      message: `Your ${document.documentType.replace(/_/g, ' ').toLowerCase()} document has been approved by HR.`,
      link: '/profile',
    });
  }

  await recordAudit({
    actorId: req.user._id,
    action: 'DOCUMENT_APPROVED',
    targetType: 'ProfileDocument',
    targetId: document._id,
    description: `Approved ${document.documentType} document for ${document.employeeId.firstName} ${document.employeeId.lastName}`,
  });

  sendSuccess(res, { message: 'Document approved successfully.', data: document });
});

export const rejectDocument = asyncHandler(async (req, res) => {
  const document = await ProfileDocument.findById(req.params.id).populate('employeeId');
  if (!document) throw ApiError.notFound('Document not found.');

  document.status = 'REJECTED';
  document.reviewedBy = req.user._id;
  document.reviewedAt = new Date();
  document.rejectionReason = req.body.reason || req.body.rejectionReason || '';
  await document.save();

  const employeeUser = await User.findOne({ employeeId: document.employeeId._id });
  if (employeeUser) {
    await notify({
      userId: employeeUser._id,
      type: NOTIFICATION_TYPE.EDIT_REQUEST_REJECTED,
      title: 'Profile document rejected',
      message: `Your ${document.documentType.replace(/_/g, ' ').toLowerCase()} document was rejected.`,
      link: '/profile',
    });
  }

  await recordAudit({
    actorId: req.user._id,
    action: 'DOCUMENT_REJECTED',
    targetType: 'ProfileDocument',
    targetId: document._id,
    description: `Rejected ${document.documentType} document for ${document.employeeId.firstName} ${document.employeeId.lastName}`,
  });

  sendSuccess(res, { message: 'Document rejected.', data: document });
});

export const listAllDocuments = asyncHandler(async (req, res) => {
  const { status, page = 1, limit = 30 } = req.query;
  const filter = {};
  if (status) filter.status = status;

  const pageNum = Number(page) || 1;
  const limitNum = Number(limit) || 30;

  const [documents, total] = await Promise.all([
    ProfileDocument.find(filter)
      .populate({ path: 'employeeId', select: 'firstName lastName employeeCode' })
      .sort({ createdAt: -1 })
      .skip((pageNum - 1) * limitNum)
      .limit(limitNum),
    ProfileDocument.countDocuments(filter),
  ]);

  sendSuccess(res, { data: documents, meta: { total, page: pageNum, limit: limitNum } });
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
