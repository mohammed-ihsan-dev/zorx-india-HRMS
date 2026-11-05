import mongoose from 'mongoose';
import { OnsiteWorkRequest } from '../models/OnsiteWorkRequest.js';
import { User } from '../models/User.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { sendSuccess } from '../utils/ApiResponse.js';
import { ApiError } from '../utils/ApiError.js';
import { getStartOfDayUTC } from '../utils/dateUtils.js';
import { dateKeyFromInput } from '../services/wfhService.js';
import { isOnsiteWorkEligible } from '../services/onsiteWorkService.js';
import { notify } from '../services/notificationService.js';
import { recordAudit } from '../services/auditService.js';
import { ONSITE_STATUS, NOTIFICATION_TYPE, PERMISSIONS, ROLES, USER_STATUS } from '../utils/constants.js';

const DATE_INPUT = /^\d{4}-\d{2}-\d{2}$/;
const POPULATE_EMPLOYEE = { path: 'employeeId', select: 'firstName lastName employeeCode userId', populate: { path: 'userId', select: 'email' } };
const PAST_DATE_MESSAGE = 'Onsite work cannot be requested for a past date. Please contact HR/Admin for an attendance correction.';

const personName = (user) => {
  const e = user?.employeeId;
  return `${e?.firstName || ''} ${e?.lastName || ''}`.replace(/\s+/g, ' ').trim() || user?.email || 'Unknown';
};
const employeeLabel = (e) => `${e?.firstName || ''} ${e?.lastName || ''}`.replace(/\s+/g, ' ').trim() || 'Employee';
const historyEntry = (req, action, fromStatus, toStatus, comment = '') => ({
  action,
  fromStatus,
  toStatus,
  byUserId: req.user._id,
  byName: personName(req.user),
  at: new Date(),
  comment,
});

/** The signed-in employee — identity always comes from the session, never the request body. */
function requireEligibleEmployee(req) {
  const employeeId = req.user.employeeId?._id;
  if (!employeeId) throw ApiError.forbidden('Only employees can perform this action.');
  if (!isOnsiteWorkEligible(employeeId)) throw ApiError.forbidden('Onsite work requests are not enabled for your account.');
  return employeeId;
}

function assertNotPast(dateKey) {
  if (dateKey < getStartOfDayUTC()) throw ApiError.badRequest(PAST_DATE_MESSAGE);
}

const duplicateError = () => ApiError.conflict('You already have a pending or approved onsite request for this date.');

async function findOr404(id) {
  if (!mongoose.isValidObjectId(id)) throw ApiError.notFound('Onsite work request not found.');
  const request = await OnsiteWorkRequest.findById(id).populate(POPULATE_EMPLOYEE);
  if (!request) throw ApiError.notFound('Onsite work request not found.');
  return request;
}

/** Everyone who may review: Super Admins (role default) and anyone explicitly granted ONSITE_WORK_REVIEW. */
function reviewerUsers(excludeUserId) {
  return User.find({
    status: USER_STATUS.ACTIVE,
    _id: { $ne: excludeUserId },
    $or: [{ role: ROLES.SUPER_ADMIN }, { permissions: PERMISSIONS.ONSITE_WORK_REVIEW }],
  }).select('_id');
}

export const createOnsite = asyncHandler(async (req, res) => {
  const employeeId = requireEligibleEmployee(req);
  const { date, reason, workLocation, description } = req.body;
  const dateKey = dateKeyFromInput(date);
  assertNotPast(dateKey);

  if (await OnsiteWorkRequest.exists({ employeeId, date: dateKey, active: true })) throw duplicateError();

  let request;
  try {
    request = await OnsiteWorkRequest.create({
      employeeId,
      date: dateKey,
      reason,
      workLocation,
      description,
      history: [historyEntry(req, 'SUBMITTED', null, ONSITE_STATUS.PENDING)],
    });
  } catch (err) {
    if (err?.code === 11000) throw duplicateError(); // a simultaneous submit for the same day
    throw err;
  }

  const name = employeeLabel(req.user.employeeId);
  const reviewers = await reviewerUsers(req.user._id);
  await Promise.all(
    reviewers.map((u) =>
      notify({
        userId: u._id,
        type: NOTIFICATION_TYPE.ONSITE_SUBMITTED,
        title: 'New onsite work request',
        message: `${name} requested onsite work on ${date} at ${workLocation} (${reason}).`,
        link: '/admin/onsite-work',
        metadata: { onsiteRequestId: request._id },
      })
    )
  );
  await recordAudit({
    actorId: req.user._id,
    action: 'ONSITE_REQUEST_SUBMITTED',
    targetType: 'OnsiteWorkRequest',
    targetId: request._id,
    description: `${name} requested onsite work on ${date} at ${workLocation}.`,
  });

  sendSuccess(res, { statusCode: 201, message: 'Onsite work request submitted.', data: request });
});

export const getMyOnsite = asyncHandler(async (req, res) => {
  const employeeId = requireEligibleEmployee(req);
  const requests = await OnsiteWorkRequest.find({ employeeId }).sort({ date: -1, createdAt: -1 }).select('-history');
  sendSuccess(res, { data: requests });
});

/** Today's onsite permission for the signed-in employee (display only; check-in decides on its own). */
export const getMyOnsiteToday = asyncHandler(async (req, res) => {
  const employeeId = req.user.employeeId?._id;
  const eligible = isOnsiteWorkEligible(employeeId);
  const request = eligible
    ? await OnsiteWorkRequest.findOne({ employeeId, date: getStartOfDayUTC(), status: ONSITE_STATUS.APPROVED }).select('date reason workLocation status')
    : null;
  sendSuccess(res, { data: { eligible, approved: Boolean(request), request } });
});

export const updateOnsite = asyncHandler(async (req, res) => {
  const employeeId = requireEligibleEmployee(req);
  if (!mongoose.isValidObjectId(req.params.id)) throw ApiError.notFound('Onsite work request not found.');
  const set = { ...req.body };
  if (set.date) {
    set.date = dateKeyFromInput(set.date);
    assertNotPast(set.date);
  }
  const current = await OnsiteWorkRequest.findOne({ _id: req.params.id, employeeId });
  if (!current) throw ApiError.notFound('Onsite work request not found.');
  if (current.status !== ONSITE_STATUS.PENDING) throw ApiError.badRequest('Only pending requests can be edited.');
  assertNotPast(current.date);

  let updated;
  try {
    // Atomic: only applies while still PENDING (a reviewer may act at the same moment).
    updated = await OnsiteWorkRequest.findOneAndUpdate(
      { _id: current._id, employeeId, status: ONSITE_STATUS.PENDING },
      { $set: set, $push: { history: historyEntry(req, 'EDITED', ONSITE_STATUS.PENDING, ONSITE_STATUS.PENDING) } },
      { new: true, runValidators: true }
    ).select('-history');
  } catch (err) {
    if (err?.code === 11000) throw duplicateError();
    throw err;
  }
  if (!updated) throw ApiError.conflict('This request was reviewed in the meantime and can no longer be edited.');
  sendSuccess(res, { message: 'Onsite work request updated.', data: updated });
});

export const cancelOnsite = asyncHandler(async (req, res) => {
  const employeeId = requireEligibleEmployee(req);
  if (!mongoose.isValidObjectId(req.params.id)) throw ApiError.notFound('Onsite work request not found.');
  const updated = await OnsiteWorkRequest.findOneAndUpdate(
    { _id: req.params.id, employeeId, status: ONSITE_STATUS.PENDING },
    {
      $set: { status: ONSITE_STATUS.CANCELLED, active: false, cancelledAt: new Date() },
      $push: { history: historyEntry(req, 'CANCELLED', ONSITE_STATUS.PENDING, ONSITE_STATUS.CANCELLED) },
    },
    { new: true }
  ).select('-history');
  if (!updated) {
    const exists = await OnsiteWorkRequest.exists({ _id: req.params.id, employeeId });
    if (!exists) throw ApiError.notFound('Onsite work request not found.');
    throw ApiError.badRequest('Only pending requests can be cancelled.');
  }
  await recordAudit({
    actorId: req.user._id,
    action: 'ONSITE_REQUEST_CANCELLED',
    targetType: 'OnsiteWorkRequest',
    targetId: updated._id,
    description: `${employeeLabel(req.user.employeeId)} cancelled an onsite work request.`,
    metadata: { previousStatus: ONSITE_STATUS.PENDING, newStatus: ONSITE_STATUS.CANCELLED },
  });
  sendSuccess(res, { message: 'Onsite work request cancelled.', data: updated });
});

export const listOnsite = asyncHandler(async (req, res) => {
  const { status, employeeId, from, to, page = 1, limit = 20 } = req.query;
  const filter = {};
  if (status) {
    if (!Object.values(ONSITE_STATUS).includes(status)) throw ApiError.badRequest('Invalid status filter.');
    filter.status = status;
  }
  if (employeeId) {
    if (!mongoose.isValidObjectId(employeeId)) throw ApiError.badRequest('Invalid employee filter.');
    filter.employeeId = employeeId;
  }
  if (from || to) {
    if ((from && !DATE_INPUT.test(from)) || (to && !DATE_INPUT.test(to))) throw ApiError.badRequest('Invalid date filter.');
    filter.date = {};
    if (from) filter.date.$gte = dateKeyFromInput(from);
    if (to) filter.date.$lte = dateKeyFromInput(to);
  }
  const pageNum = Math.max(1, Number(page) || 1);
  const limitNum = Math.min(100, Math.max(1, Number(limit) || 20));
  const [requests, total, counts] = await Promise.all([
    OnsiteWorkRequest.find(filter)
      .populate(POPULATE_EMPLOYEE)
      .sort({ date: -1, createdAt: -1 })
      .skip((pageNum - 1) * limitNum)
      .limit(limitNum),
    OnsiteWorkRequest.countDocuments(filter),
    OnsiteWorkRequest.aggregate([{ $group: { _id: '$status', n: { $sum: 1 } } }]),
  ]);
  const summary = Object.fromEntries(Object.values(ONSITE_STATUS).map((s) => [s.toLowerCase(), counts.find((c) => c._id === s)?.n || 0]));
  sendSuccess(res, {
    data: requests,
    meta: { total, page: pageNum, limit: limitNum, pages: Math.max(1, Math.ceil(total / limitNum)), summary },
  });
});

export const getOnsiteById = asyncHandler(async (req, res) => {
  const request = await findOr404(req.params.id);
  sendSuccess(res, { data: request });
});

function reviewOnsite(nextStatus) {
  const approved = nextStatus === ONSITE_STATUS.APPROVED;
  return asyncHandler(async (req, res) => {
    const current = await findOr404(req.params.id);
    const ownEmployeeId = req.user.employeeId?._id?.toString();
    if (ownEmployeeId && current.employeeId?._id?.toString() === ownEmployeeId) {
      throw ApiError.forbidden('You cannot review your own onsite work request.');
    }
    if (current.status !== ONSITE_STATUS.PENDING) {
      throw ApiError.conflict(`This request has already been ${current.status.toLowerCase()}.`);
    }
    if (approved && current.date < getStartOfDayUTC()) {
      throw ApiError.badRequest('This date has already passed. Reject the request, or use an attendance correction instead.');
    }

    const comment = req.body.comment || '';
    const now = new Date();
    // Atomic PENDING -> APPROVED/REJECTED: when two reviewers act at once only one
    // update matches; the other gets 409 and no second notification is sent.
    const updated = await OnsiteWorkRequest.findOneAndUpdate(
      { _id: current._id, status: ONSITE_STATUS.PENDING },
      {
        $set: {
          status: nextStatus,
          active: approved,
          reviewedBy: req.user._id,
          reviewerName: personName(req.user),
          reviewedAt: now,
          reviewComment: comment,
        },
        $push: { history: historyEntry(req, approved ? 'APPROVED' : 'REJECTED', ONSITE_STATUS.PENDING, nextStatus, comment) },
      },
      { new: true }
    ).populate(POPULATE_EMPLOYEE);
    if (!updated) throw ApiError.conflict('This request was just reviewed by someone else. Please refresh.');

    const dateLabel = updated.date.toISOString().slice(0, 10);
    const employeeUserId = updated.employeeId?.userId?._id || (await User.findOne({ employeeId: updated.employeeId._id }).select('_id'))?._id;
    if (employeeUserId) {
      await notify({
        userId: employeeUserId,
        type: approved ? NOTIFICATION_TYPE.ONSITE_APPROVED : NOTIFICATION_TYPE.ONSITE_REJECTED,
        title: approved ? 'Onsite work approved' : 'Onsite work rejected',
        message: approved
          ? `Your onsite work on ${dateLabel} at ${updated.workLocation} was approved. You can check in from the onsite location that day.`
          : `Your onsite work request for ${dateLabel} was rejected: ${comment}`,
        link: '/onsite-work',
        metadata: { onsiteRequestId: updated._id },
      });
    }
    await recordAudit({
      actorId: req.user._id,
      action: approved ? 'ONSITE_REQUEST_APPROVED' : 'ONSITE_REQUEST_REJECTED',
      targetType: 'OnsiteWorkRequest',
      targetId: updated._id,
      description: `${approved ? 'Approved' : 'Rejected'} onsite work for ${employeeLabel(updated.employeeId)} on ${dateLabel}.`,
      metadata: { previousStatus: ONSITE_STATUS.PENDING, newStatus: nextStatus, approverName: personName(req.user), comment },
    });

    sendSuccess(res, { message: approved ? 'Onsite work request approved.' : 'Onsite work request rejected.', data: updated });
  });
}

export const approveOnsite = reviewOnsite(ONSITE_STATUS.APPROVED);
export const rejectOnsite = reviewOnsite(ONSITE_STATUS.REJECTED);
