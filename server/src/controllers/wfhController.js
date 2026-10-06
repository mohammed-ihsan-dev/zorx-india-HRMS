import mongoose from 'mongoose';
import { WorkFromHome } from '../models/WorkFromHome.js';
import { User } from '../models/User.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { sendSuccess } from '../utils/ApiResponse.js';
import { ApiError } from '../utils/ApiError.js';
import { getStartOfDayUTC } from '../utils/dateUtils.js';
import { dateKeyFromInput, isDefaultWfhEmployee } from '../services/wfhService.js';
import { notify } from '../services/notificationService.js';
import { recordAudit } from '../services/auditService.js';
import { WFH_STATUS, NOTIFICATION_TYPE, BACK_OFFICE_ROLES } from '../utils/constants.js';

const ACTIVE_STATUSES = [WFH_STATUS.PENDING, WFH_STATUS.APPROVED];
const DATE_INPUT = /^\d{4}-\d{2}-\d{2}$/;

function requireEmployee(req) {
  const employeeId = req.user.employeeId?._id;
  if (!employeeId) {
    throw ApiError.forbidden('Only employees can perform this action.');
  }
  return employeeId;
}

async function findWfhOr404(id) {
  if (!mongoose.isValidObjectId(id)) throw ApiError.notFound('WFH request not found.');
  const wfh = await WorkFromHome.findById(id)
    .populate('employeeId', 'firstName lastName employeeCode')
    .populate('reviewedBy', 'email');
  if (!wfh) throw ApiError.notFound('WFH request not found.');
  return wfh;
}

export const createWfh = asyncHandler(async (req, res) => {
  const employeeId = requireEmployee(req);
  const { date, reason, workPlan, remark } = req.body;

  if (await isDefaultWfhEmployee(employeeId)) {
    throw ApiError.badRequest('You are configured as a permanent Work From Home employee. WFH approval is not required for you.');
  }

  const dateKey = dateKeyFromInput(date);
  if (dateKey < getStartOfDayUTC()) {
    throw ApiError.badRequest('WFH cannot be requested for a past date.');
  }

  const duplicate = await WorkFromHome.exists({ employeeId, date: dateKey, status: { $in: ACTIVE_STATUSES } });
  if (duplicate) {
    throw ApiError.conflict('You already have a pending or approved WFH request for this date.');
  }

  const wfh = await WorkFromHome.create({ employeeId, date: dateKey, reason, workPlan, remark });

  const reviewers = await User.find({ role: { $in: BACK_OFFICE_ROLES }, status: 'ACTIVE', _id: { $ne: req.user._id } });
  await Promise.all(
    reviewers.map((u) =>
      notify({
        userId: u._id,
        type: NOTIFICATION_TYPE.WFH_SUBMITTED,
        title: 'New WFH request',
        message: `${req.user.employeeId.firstName} ${req.user.employeeId.lastName} requested to work from home.`,
        link: '/admin/work-from-home',
      })
    )
  );

  sendSuccess(res, { statusCode: 201, message: 'WFH request submitted successfully.', data: wfh });
});

export const getMyWfh = asyncHandler(async (req, res) => {
  const employeeId = requireEmployee(req);
  const requests = await WorkFromHome.find({ employeeId }).sort({ date: -1, createdAt: -1 });
  sendSuccess(res, { data: requests });
});

export const getMyWfhToday = asyncHandler(async (req, res) => {
  const employeeId = req.user.employeeId?._id;
  const defaultWfh = await isDefaultWfhEmployee(employeeId);
  const request = employeeId && !defaultWfh
    ? await WorkFromHome.findOne({ employeeId, date: getStartOfDayUTC(), status: WFH_STATUS.APPROVED })
    : null;
  sendSuccess(res, { data: { approved: defaultWfh || Boolean(request), defaultWfh, request } });
});

export const listWfh = asyncHandler(async (req, res) => {
  const { status, employeeId, from, to, page = 1, limit = 20 } = req.query;
  const filter = {};
  if (status) {
    if (!Object.values(WFH_STATUS).includes(status)) throw ApiError.badRequest('Invalid status filter.');
    filter.status = status;
  }
  if (employeeId) {
    if (!mongoose.isValidObjectId(employeeId)) throw ApiError.badRequest('Invalid employee filter.');
    filter.employeeId = employeeId;
  }
  if (from || to) {
    if ((from && !DATE_INPUT.test(from)) || (to && !DATE_INPUT.test(to))) {
      throw ApiError.badRequest('Invalid date filter.');
    }
    filter.date = {};
    if (from) filter.date.$gte = dateKeyFromInput(from);
    if (to) filter.date.$lte = dateKeyFromInput(to);
  }

  const pageNum = Math.max(1, Number(page) || 1);
  const limitNum = Math.min(100, Math.max(1, Number(limit) || 20));

  const [requests, total] = await Promise.all([
    WorkFromHome.find(filter)
      .populate('employeeId', 'firstName lastName employeeCode')
      .populate('reviewedBy', 'email')
      .sort({ date: -1, createdAt: -1 })
      .skip((pageNum - 1) * limitNum)
      .limit(limitNum),
    WorkFromHome.countDocuments(filter),
  ]);

  sendSuccess(res, {
    data: requests,
    meta: { total, page: pageNum, limit: limitNum, pages: Math.max(1, Math.ceil(total / limitNum)) },
  });
});

export const getWfhSummary = asyncHandler(async (req, res) => {
  const [pending, approved, rejected, today] = await Promise.all([
    WorkFromHome.countDocuments({ status: WFH_STATUS.PENDING }),
    WorkFromHome.countDocuments({ status: WFH_STATUS.APPROVED }),
    WorkFromHome.countDocuments({ status: WFH_STATUS.REJECTED }),
    WorkFromHome.countDocuments({ status: WFH_STATUS.APPROVED, date: getStartOfDayUTC() }),
  ]);
  sendSuccess(res, { data: { pending, approved, rejected, today } });
});

export const getWfhById = asyncHandler(async (req, res) => {
  const wfh = await findWfhOr404(req.params.id);
  const isReviewer = BACK_OFFICE_ROLES.includes(req.user.role);
  const ownEmployeeId = req.user.employeeId?._id?.toString();
  if (!isReviewer && wfh.employeeId?._id?.toString() !== ownEmployeeId) {
    throw ApiError.forbidden('You can only view your own WFH requests.');
  }
  sendSuccess(res, { data: wfh });
});

function reviewWfh(nextStatus) {
  return asyncHandler(async (req, res) => {
    const wfh = await findWfhOr404(req.params.id);
    if (wfh.status !== WFH_STATUS.PENDING) {
      throw ApiError.badRequest('Only pending WFH requests can be reviewed.');
    }
    const ownEmployeeId = req.user.employeeId?._id?.toString();
    if (ownEmployeeId && wfh.employeeId?._id?.toString() === ownEmployeeId) {
      throw ApiError.forbidden('You cannot review your own WFH request.');
    }

    wfh.status = nextStatus;
    wfh.reviewedBy = req.user._id;
    wfh.reviewedAt = new Date();
    wfh.reviewNote = req.body.reviewNote || '';
    await wfh.save();

    const approved = nextStatus === WFH_STATUS.APPROVED;
    const employeeUser = await User.findOne({ employeeId: wfh.employeeId._id });
    if (employeeUser) {
      await notify({
        userId: employeeUser._id,
        type: approved ? NOTIFICATION_TYPE.WFH_APPROVED : NOTIFICATION_TYPE.WFH_REJECTED,
        title: approved ? 'WFH approved' : 'WFH rejected',
        message: `Your work from home request has been ${approved ? 'approved' : 'rejected'}.`,
        link: '/work-from-home',
      });
    }

    await recordAudit({
      actorId: req.user._id,
      action: approved ? 'WFH_APPROVED' : 'WFH_REJECTED',
      targetType: 'WorkFromHome',
      targetId: wfh._id,
      description: `${approved ? 'Approved' : 'Rejected'} WFH for ${wfh.employeeId.firstName} ${wfh.employeeId.lastName}`,
    });

    sendSuccess(res, { message: approved ? 'WFH request approved.' : 'WFH request rejected.', data: wfh });
  });
}

export const approveWfh = reviewWfh(WFH_STATUS.APPROVED);
export const rejectWfh = reviewWfh(WFH_STATUS.REJECTED);
