import { EditRequest } from '../models/EditRequest.js';
import { Employee } from '../models/Employee.js';
import { User } from '../models/User.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { sendSuccess } from '../utils/ApiResponse.js';
import { ApiError } from '../utils/ApiError.js';
import { notify } from '../services/notificationService.js';
import { recordAudit } from '../services/auditService.js';
import {
  EDIT_REQUEST_STATUS,
  EDIT_REQUEST_AUTO_APPLY_PATH,
  NOTIFICATION_TYPE,
  BACK_OFFICE_ROLES,
} from '../utils/constants.js';

function requireEmployee(req) {
  const employeeId = req.user.employeeId?._id;
  if (!employeeId) throw ApiError.forbidden('Only employees can perform this action.');
  return employeeId;
}

export const createEditRequest = asyncHandler(async (req, res) => {
  const employeeId = requireEmployee(req);
  const { field, currentValue, requestedValue, reason } = req.body;

  const editRequest = await EditRequest.create({
    employeeId,
    requestedBy: req.user._id,
    field,
    currentValue,
    requestedValue,
    reason,
  });

  const backOfficeUsers = await User.find({ role: { $in: BACK_OFFICE_ROLES }, status: 'ACTIVE' });
  await Promise.all(
    backOfficeUsers.map((u) =>
      notify({
        userId: u._id,
        type: NOTIFICATION_TYPE.EDIT_REQUEST_SUBMITTED,
        title: 'New profile edit request',
        message: `${req.user.employeeId.firstName} ${req.user.employeeId.lastName} requested a change to ${field.replace(/_/g, ' ').toLowerCase()}.`,
        link: '/admin/edit-requests',
      })
    )
  );

  await recordAudit({
    actorId: req.user._id,
    action: 'EDIT_REQUEST_SUBMITTED',
    targetType: 'EditRequest',
    targetId: editRequest._id,
    description: `Submitted an edit request for ${field}`,
  });

  sendSuccess(res, { statusCode: 201, message: 'Edit request submitted successfully.', data: editRequest });
});

export const getMyEditRequests = asyncHandler(async (req, res) => {
  const employeeId = requireEmployee(req);
  const requests = await EditRequest.find({ employeeId }).sort({ createdAt: -1 });
  sendSuccess(res, { data: requests });
});

export const cancelEditRequest = asyncHandler(async (req, res) => {
  const employeeId = requireEmployee(req);
  const editRequest = await EditRequest.findOne({ _id: req.params.id, employeeId });
  if (!editRequest) throw ApiError.notFound('Edit request not found.');
  if (editRequest.status !== EDIT_REQUEST_STATUS.PENDING) {
    throw ApiError.badRequest('Only pending edit requests can be cancelled.');
  }
  editRequest.status = EDIT_REQUEST_STATUS.CANCELLED;
  await editRequest.save();
  sendSuccess(res, { message: 'Edit request cancelled.', data: editRequest });
});

export const listEditRequests = asyncHandler(async (req, res) => {
  const { status, page = 1, limit = 20 } = req.query;
  const filter = {};
  if (status) filter.status = status;

  const pageNum = Number(page) || 1;
  const limitNum = Number(limit) || 20;

  const [requests, total] = await Promise.all([
    EditRequest.find(filter)
      .populate('employeeId', 'firstName lastName employeeCode')
      .populate('reviewedBy', 'email')
      .sort({ createdAt: -1 })
      .skip((pageNum - 1) * limitNum)
      .limit(limitNum),
    EditRequest.countDocuments(filter),
  ]);

  sendSuccess(res, { data: requests, meta: { total, page: pageNum, limit: limitNum } });
});

export const getEditRequestById = asyncHandler(async (req, res) => {
  const editRequest = await EditRequest.findById(req.params.id)
    .populate('employeeId', 'firstName lastName employeeCode')
    .populate('reviewedBy', 'email');
  if (!editRequest) throw ApiError.notFound('Edit request not found.');
  sendSuccess(res, { data: editRequest });
});

export const approveEditRequest = asyncHandler(async (req, res) => {
  const editRequest = await EditRequest.findById(req.params.id).populate('employeeId');
  if (!editRequest) throw ApiError.notFound('Edit request not found.');
  if (editRequest.status !== EDIT_REQUEST_STATUS.PENDING) {
    throw ApiError.badRequest('Only pending edit requests can be approved.');
  }

  const autoApplyPath = EDIT_REQUEST_AUTO_APPLY_PATH[editRequest.field];
  if (autoApplyPath) {
    const value = autoApplyPath === 'dateOfBirth' ? new Date(editRequest.requestedValue) : editRequest.requestedValue;
    await Employee.findByIdAndUpdate(editRequest.employeeId._id, { [autoApplyPath]: value });
  }

  editRequest.status = EDIT_REQUEST_STATUS.APPROVED;
  editRequest.reviewedBy = req.user._id;
  editRequest.reviewedAt = new Date();
  editRequest.reviewComment = req.body.reviewComment || '';
  await editRequest.save();

  const employeeUser = await User.findOne({ employeeId: editRequest.employeeId._id });
  if (employeeUser) {
    await notify({
      userId: employeeUser._id,
      type: NOTIFICATION_TYPE.EDIT_REQUEST_APPROVED,
      title: 'Edit request approved',
      message: `Your request to update ${editRequest.field.replace(/_/g, ' ').toLowerCase()} has been approved.`,
      link: '/profile',
    });
  }

  await recordAudit({
    actorId: req.user._id,
    action: 'EDIT_REQUEST_APPROVED',
    targetType: 'EditRequest',
    targetId: editRequest._id,
    description: `Approved edit request for ${editRequest.employeeId.firstName} ${editRequest.employeeId.lastName} (${editRequest.field})`,
  });

  sendSuccess(res, { message: 'Edit request approved.', data: editRequest });
});

export const rejectEditRequest = asyncHandler(async (req, res) => {
  const editRequest = await EditRequest.findById(req.params.id).populate('employeeId');
  if (!editRequest) throw ApiError.notFound('Edit request not found.');
  if (editRequest.status !== EDIT_REQUEST_STATUS.PENDING) {
    throw ApiError.badRequest('Only pending edit requests can be rejected.');
  }

  editRequest.status = EDIT_REQUEST_STATUS.REJECTED;
  editRequest.reviewedBy = req.user._id;
  editRequest.reviewedAt = new Date();
  editRequest.reviewComment = req.body.reviewComment || '';
  await editRequest.save();

  const employeeUser = await User.findOne({ employeeId: editRequest.employeeId._id });
  if (employeeUser) {
    await notify({
      userId: employeeUser._id,
      type: NOTIFICATION_TYPE.EDIT_REQUEST_REJECTED,
      title: 'Edit request rejected',
      message: `Your request to update ${editRequest.field.replace(/_/g, ' ').toLowerCase()} was rejected.${
        editRequest.reviewComment ? ` Reason: ${editRequest.reviewComment}` : ''
      }`,
      link: '/profile',
    });
  }

  await recordAudit({
    actorId: req.user._id,
    action: 'EDIT_REQUEST_REJECTED',
    targetType: 'EditRequest',
    targetId: editRequest._id,
    description: `Rejected edit request for ${editRequest.employeeId.firstName} ${editRequest.employeeId.lastName} (${editRequest.field})`,
  });

  sendSuccess(res, { message: 'Edit request rejected.', data: editRequest });
});
