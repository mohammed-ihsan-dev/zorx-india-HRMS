import { Leave } from '../models/Leave.js';
import { Employee } from '../models/Employee.js';
import { User } from '../models/User.js';
import { ProfileDocument } from '../models/ProfileDocument.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { sendSuccess } from '../utils/ApiResponse.js';
import { ApiError } from '../utils/ApiError.js';
import {
  calculateLeaveDays,
  deductLeaveBalance,
  restoreLeaveBalance,
  getOrCreateLeaveBalance,
  assertNoOverlap,
} from '../services/leaveService.js';
import { notify } from '../services/notificationService.js';
import { recordAudit } from '../services/auditService.js';
import { LEAVE_STATUS, NOTIFICATION_TYPE, BACK_OFFICE_ROLES } from '../utils/constants.js';

function requireEmployee(req) {
  const employeeId = req.user.employeeId?._id;
  if (!employeeId) {
    throw ApiError.forbidden('Only employees can perform this action.');
  }
  return employeeId;
}

export const createLeave = asyncHandler(async (req, res) => {
  const employeeId = requireEmployee(req);
  const { leaveType, startDate, endDate, reason, supportingDocumentId } = req.body;

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const start = new Date(startDate);
  start.setHours(0, 0, 0, 0);

  if (start < today) {
    throw ApiError.badRequest('Leave request start date cannot be before today.');
  }

  const days = calculateLeaveDays(startDate, endDate);
  const year = new Date(startDate).getFullYear();

  if (supportingDocumentId) {
    const document = await ProfileDocument.findOne({ _id: supportingDocumentId, employeeId });
    if (!document) {
      throw ApiError.badRequest('The supporting document could not be found.');
    }
  }

  await assertNoOverlap(employeeId, startDate, endDate);
  await getOrCreateLeaveBalance(employeeId, year);

  const leave = await Leave.create({
    employeeId,
    leaveType,
    startDate,
    endDate,
    days,
    reason,
    supportingDocumentId: supportingDocumentId || null,
  });

  const backOfficeUsers = await User.find({ role: { $in: BACK_OFFICE_ROLES }, status: 'ACTIVE' });
  await Promise.all(
    backOfficeUsers.map((u) =>
      notify({
        userId: u._id,
        type: NOTIFICATION_TYPE.LEAVE_SUBMITTED,
        title: 'New leave request',
        message: `${req.user.employeeId.firstName} ${req.user.employeeId.lastName} submitted a ${leaveType.toLowerCase()} leave request.`,
        link: '/admin/leaves',
      })
    )
  );

  sendSuccess(res, { statusCode: 201, message: 'Leave request submitted successfully.', data: leave });
});

export const getMyLeaves = asyncHandler(async (req, res) => {
  const employeeId = requireEmployee(req);
  const leaves = await Leave.find({ employeeId })
    .populate('supportingDocumentId', 'documentType originalFileName mimeType')
    .sort({ createdAt: -1 });
  const balance = await getOrCreateLeaveBalance(employeeId, new Date().getFullYear());
  sendSuccess(res, { data: { leaves, balance } });
});

export const listLeaves = asyncHandler(async (req, res) => {
  const { status, employeeId, page = 1, limit = 20 } = req.query;
  const filter = {};
  if (status) filter.status = status;
  if (employeeId) filter.employeeId = employeeId;

  const pageNum = Number(page) || 1;
  const limitNum = Number(limit) || 20;

  const [leaves, total] = await Promise.all([
    Leave.find(filter)
      .populate('employeeId', 'firstName lastName employeeCode')
      .sort({ createdAt: -1 })
      .skip((pageNum - 1) * limitNum)
      .limit(limitNum),
    Leave.countDocuments(filter),
  ]);

  sendSuccess(res, { data: leaves, meta: { total, page: pageNum, limit: limitNum } });
});

export const approveLeave = asyncHandler(async (req, res) => {
  const leave = await Leave.findById(req.params.id).populate('employeeId');
  if (!leave) throw ApiError.notFound('Leave request not found.');
  if (leave.status !== LEAVE_STATUS.PENDING) {
    throw ApiError.badRequest('Only pending leave requests can be approved.');
  }

  const year = new Date(leave.startDate).getFullYear();
  await deductLeaveBalance(leave.employeeId._id, leave.leaveType, leave.days, year);

  leave.status = LEAVE_STATUS.APPROVED;
  leave.reviewedBy = req.user._id;
  leave.reviewedAt = new Date();
  leave.reviewNote = req.body.reviewNote || '';
  await leave.save();

  const employeeUser = await User.findOne({ employeeId: leave.employeeId._id });
  if (employeeUser) {
    await notify({
      userId: employeeUser._id,
      type: NOTIFICATION_TYPE.LEAVE_APPROVED,
      title: 'Leave approved',
      message: `Your ${leave.leaveType.toLowerCase()} leave request has been approved.`,
      link: '/leave',
    });
  }

  await recordAudit({
    actorId: req.user._id,
    action: 'LEAVE_APPROVED',
    targetType: 'Leave',
    targetId: leave._id,
    description: `Approved leave for ${leave.employeeId.firstName} ${leave.employeeId.lastName}`,
  });

  sendSuccess(res, { message: 'Leave approved successfully.', data: leave });
});

export const rejectLeave = asyncHandler(async (req, res) => {
  const leave = await Leave.findById(req.params.id).populate('employeeId');
  if (!leave) throw ApiError.notFound('Leave request not found.');
  if (leave.status !== LEAVE_STATUS.PENDING) {
    throw ApiError.badRequest('Only pending leave requests can be rejected.');
  }

  leave.status = LEAVE_STATUS.REJECTED;
  leave.reviewedBy = req.user._id;
  leave.reviewedAt = new Date();
  leave.reviewNote = req.body.reviewNote || '';
  await leave.save();

  const employeeUser = await User.findOne({ employeeId: leave.employeeId._id });
  if (employeeUser) {
    await notify({
      userId: employeeUser._id,
      type: NOTIFICATION_TYPE.LEAVE_REJECTED,
      title: 'Leave rejected',
      message: `Your ${leave.leaveType.toLowerCase()} leave request has been rejected.`,
      link: '/leave',
    });
  }

  await recordAudit({
    actorId: req.user._id,
    action: 'LEAVE_REJECTED',
    targetType: 'Leave',
    targetId: leave._id,
    description: `Rejected leave for ${leave.employeeId.firstName} ${leave.employeeId.lastName}`,
  });

  sendSuccess(res, { message: 'Leave rejected.', data: leave });
});

export const cancelLeave = asyncHandler(async (req, res) => {
  const employeeId = requireEmployee(req);
  const leave = await Leave.findOne({ _id: req.params.id, employeeId });
  if (!leave) throw ApiError.notFound('Leave request not found.');
  if (leave.status === LEAVE_STATUS.APPROVED) {
    const year = new Date(leave.startDate).getFullYear();
    await restoreLeaveBalance(employeeId, leave.leaveType, leave.days, year);
  }
  if (![LEAVE_STATUS.PENDING, LEAVE_STATUS.APPROVED].includes(leave.status)) {
    throw ApiError.badRequest('This leave request cannot be cancelled.');
  }
  leave.status = LEAVE_STATUS.CANCELLED;
  await leave.save();
  sendSuccess(res, { message: 'Leave cancelled.', data: leave });
});
