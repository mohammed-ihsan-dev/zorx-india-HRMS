import { randomUUID } from 'node:crypto';
import { Leave } from '../models/Leave.js';
import { LeaveLock } from '../models/LeaveLock.js';
import {
  LEAVE_TYPE,
  LEAVE_STATUS,
  MONTHLY_LEAVE_ALLOWANCE,
  SICK_LEAVE_ELIGIBILITY_MONTHS,
  CASUAL_LEAVE_ACCRUAL,
} from '../utils/constants.js';
import { ApiError } from '../utils/ApiError.js';

const ACTIVE_STATUSES = [LEAVE_STATUS.PENDING, LEAVE_STATUS.APPROVED];
const TYPE_LABEL = { [LEAVE_TYPE.CASUAL]: 'Casual Leave', [LEAVE_TYPE.SICK]: 'Sick Leave', [LEAVE_TYPE.PAID]: 'Paid Leave' };

export function calculateLeaveDays(startDate, endDate) {
  const start = new Date(startDate);
  const end = new Date(endDate);
  const diffMs = end.setHours(0, 0, 0, 0) - start.setHours(0, 0, 0, 0);
  const days = diffMs / (1000 * 60 * 60 * 24) + 1;
  if (days < 1) {
    throw ApiError.badRequest('Leave end date must be on or after the start date.');
  }
  return days;
}

/**
 * Throws if the employee already has a pending or approved leave request that
 * overlaps the given date range. Rejected/cancelled requests never block a
 * new request for the same dates.
 */
export async function assertNoOverlap(employeeId, startDate, endDate, excludeLeaveId = null) {
  const filter = {
    employeeId,
    status: { $in: ACTIVE_STATUSES },
    startDate: { $lte: endDate },
    endDate: { $gte: startDate },
  };
  if (excludeLeaveId) filter._id = { $ne: excludeLeaveId };

  const overlapping = await Leave.findOne(filter);
  if (overlapping) {
    throw ApiError.badRequest('This date range overlaps with an existing leave request.');
  }
}

/** First calendar day Sick Leave may start: joining date + 3 months (null if no joining date). */
export function getSickLeaveEligibleFrom(joiningDate) {
  if (!joiningDate) return null;
  const j = new Date(joiningDate);
  return new Date(Date.UTC(j.getUTCFullYear(), j.getUTCMonth() + SICK_LEAVE_ELIGIBILITY_MONTHS, j.getUTCDate()));
}

// Leave dates are stored as UTC-midnight calendar days, so months are taken in UTC.
function monthWindow(date) {
  const d = new Date(date);
  return {
    start: new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1)),
    end: new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 1)),
    label: d.toLocaleDateString('en-IN', { month: 'long', year: 'numeric', timeZone: 'UTC' }),
  };
}

/** Days of `leaveType` in the calendar month of `date` with one of `statuses` (default pending/approved). */
export async function countMonthlyLeaveDays(employeeId, leaveType, date, excludeLeaveId = null, statuses = ACTIVE_STATUSES) {
  const { start, end } = monthWindow(date);
  const match = { employeeId, leaveType, status: { $in: statuses }, startDate: { $gte: start, $lt: end } };
  if (excludeLeaveId) match._id = { $ne: excludeLeaveId };
  const [row] = await Leave.aggregate([{ $match: match }, { $group: { _id: null, days: { $sum: '$days' } } }]);
  return row?.days || 0;
}

// ---- Casual Leave: monthly accrual with unlimited carry-forward ----
// The balance is derived, never stored: credits are a pure function of the
// joining date and the calendar month, so refreshes, retries, tabs and
// concurrent calls can never grant a month twice, and nothing resets at
// month-end. Usage comes from the leave requests themselves.
const monthIndex = (date) => {
  const d = new Date(date);
  return d.getUTCFullYear() * 12 + d.getUTCMonth();
};
const ACCRUAL_START_INDEX = CASUAL_LEAVE_ACCRUAL.START_YEAR * 12 + CASUAL_LEAVE_ACCRUAL.START_MONTH_INDEX;
const ACCRUAL_START_DATE = new Date(Date.UTC(CASUAL_LEAVE_ACCRUAL.START_YEAR, CASUAL_LEAVE_ACCRUAL.START_MONTH_INDEX, 1));

/** First month (as a UTC month-start Date) in which this employee earns Casual Leave. */
export function getCasualCreditStart(joiningDate) {
  const first = Math.max(ACCRUAL_START_INDEX, joiningDate ? monthIndex(joiningDate) : ACCRUAL_START_INDEX);
  return new Date(Date.UTC(Math.floor(first / 12), first % 12, 1));
}

/** Casual Leave days earned from the credit start month through the month of `date`, inclusive. */
export function casualCreditsThrough(joiningDate, date) {
  const months = monthIndex(date) - monthIndex(getCasualCreditStart(joiningDate)) + 1;
  return Math.max(0, months) * CASUAL_LEAVE_ACCRUAL.DAYS_PER_MONTH;
}

/** Casual days with one of `statuses` since accrual began (earlier "user's risk" casual leave never counts). */
export async function casualDaysTaken(employeeId, statuses = ACTIVE_STATUSES, excludeLeaveId = null) {
  const match = { employeeId, leaveType: LEAVE_TYPE.CASUAL, status: { $in: statuses }, startDate: { $gte: ACCRUAL_START_DATE } };
  if (excludeLeaveId) match._id = { $ne: excludeLeaveId };
  const [row] = await Leave.aggregate([{ $match: match }, { $group: { _id: null, days: { $sum: '$days' } } }]);
  return row?.days || 0;
}

/**
 * Casual days available for a leave starting on `date`: credits earned through
 * that month minus every other pending/approved casual day (wherever dated).
 * Counting all other days, not just earlier ones, means no combination of
 * requests can ever spend more than has been earned.
 */
export async function getCasualAvailable(employee, date, { statuses = ACTIVE_STATUSES, excludeLeaveId = null } = {}) {
  return casualCreditsThrough(employee.joiningDate, date) - (await casualDaysTaken(employee._id, statuses, excludeLeaveId));
}

/**
 * Company leave policy, enforced on both submission and approval:
 * - Casual Leave: only within the accrued balance (1/month, unlimited carry-forward);
 * - Sick Leave: only from 3 months after joining, MONTHLY_LEAVE_ALLOWANCE days per month;
 * - Paid Leave: no allowance (taken at the employee's own risk).
 * On submission, pending requests hold their days (no double-requesting the same
 * balance); on approval (`approving: true`) only already-approved leave counts,
 * so any one of several pending requests can still be approved.
 */
export async function assertLeaveAllowed(employee, leaveType, startDate, days, excludeLeaveId = null, { approving = false } = {}) {
  const statuses = approving ? [LEAVE_STATUS.APPROVED] : ACTIVE_STATUSES;

  if (leaveType === LEAVE_TYPE.CASUAL) {
    const available = Math.max(0, await getCasualAvailable(employee, startDate, { statuses, excludeLeaveId }));
    if (days > available) {
      const { label } = monthWindow(startDate);
      throw ApiError.badRequest(
        `Not enough Casual Leave: ${available} day${available === 1 ? '' : 's'} available for ${label}, ${days} requested ` +
          `(short by ${days - available}). You can choose Paid Leave instead.`,
        { leaveType, available, requested: days, shortfall: days - available }
      );
    }
    return;
  }

  if (leaveType === LEAVE_TYPE.SICK) {
    const eligibleFrom = getSickLeaveEligibleFrom(employee.joiningDate);
    if (eligibleFrom && new Date(startDate) < eligibleFrom) {
      const on = eligibleFrom.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric', timeZone: 'UTC' });
      throw ApiError.badRequest(`Sick Leave is available ${SICK_LEAVE_ELIGIBILITY_MONTHS} months after joining (from ${on}).`);
    }
  }

  const allowance = MONTHLY_LEAVE_ALLOWANCE[leaveType];
  if (allowance === undefined) return;

  const used = await countMonthlyLeaveDays(employee._id, leaveType, startDate, excludeLeaveId, statuses);
  if (used + days > allowance) {
    const { label } = monthWindow(startDate);
    throw ApiError.badRequest(
      used >= allowance
        ? `You have already used your ${TYPE_LABEL[leaveType]} for ${label}. Please choose Paid Leave instead.`
        : `${TYPE_LABEL[leaveType]} is limited to ${allowance} day per month. Please choose Paid Leave for the remaining days.`
    );
  }
}

// ---- Per-employee serialization of balance-affecting leave operations ----
const LOCK_MS = 10_000;
const LOCK_WAIT_MS = 3_000;
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Runs `fn` while holding this employee's leave lock, so balance checks and the
 * writes that depend on them (submission, approval) never interleave. Works on
 * any MongoDB deployment (no transaction/replica-set requirement).
 */
export async function withEmployeeLeaveLock(employeeId, fn) {
  await LeaveLock.init();
  const token = randomUUID();
  const giveUpAt = Date.now() + LOCK_WAIT_MS;
  for (;;) {
    const now = new Date();
    try {
      await LeaveLock.findOneAndUpdate(
        { employeeId, lockedUntil: { $lt: now } },
        { $set: { token, lockedUntil: new Date(now.getTime() + LOCK_MS) } },
        { upsert: true }
      );
      break;
    } catch (err) {
      if (err?.code !== 11000) throw err;
      if (Date.now() > giveUpAt) {
        throw ApiError.conflict('Another leave request is being processed. Please try again.');
      }
      await sleep(25 + Math.floor(Math.random() * 50));
    }
  }
  try {
    return await fn();
  } finally {
    await LeaveLock.deleteOne({ employeeId, token });
  }
}

/** Current balances for the Leave page (Casual: accrued balance; Sick/Paid: this month). */
export async function getLeaveSummary(employee, referenceDate = new Date()) {
  const { start, label } = monthWindow(referenceDate);
  const used = async (type) => countMonthlyLeaveDays(employee._id, type, start);
  const eligibleFrom = getSickLeaveEligibleFrom(employee.joiningDate);
  const credited = casualCreditsThrough(employee.joiningDate, referenceDate);
  const approved = await casualDaysTaken(employee._id, [LEAVE_STATUS.APPROVED]);
  const pending = await casualDaysTaken(employee._id, [LEAVE_STATUS.PENDING]);
  return {
    month: label,
    types: {
      [LEAVE_TYPE.CASUAL]: {
        accruesPerMonth: CASUAL_LEAVE_ACCRUAL.DAYS_PER_MONTH,
        creditStart: getCasualCreditStart(employee.joiningDate),
        credited,
        approved,
        pending,
        available: Math.max(0, credited - approved - pending),
      },
      [LEAVE_TYPE.SICK]: {
        allowance: MONTHLY_LEAVE_ALLOWANCE[LEAVE_TYPE.SICK],
        used: await used(LEAVE_TYPE.SICK),
        eligibleFrom,
        eligibleNow: !eligibleFrom || new Date(referenceDate) >= eligibleFrom,
      },
      [LEAVE_TYPE.PAID]: { allowance: null, used: await used(LEAVE_TYPE.PAID) },
    },
  };
}
