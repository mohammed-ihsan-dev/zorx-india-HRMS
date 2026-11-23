import { randomUUID } from 'node:crypto';
import { Leave } from '../models/Leave.js';
import { LeaveLock } from '../models/LeaveLock.js';
import {
  LEAVE_TYPE,
  LEAVE_STATUS,
  LEAVE_DURATION,
  HALF_DAY_DAYS,
  MONTHLY_LEAVE_ALLOWANCE,
  LEAVE_ACCRUAL,
  LEAVE_TYPE_LABEL,
} from '../utils/constants.js';
import { ApiError } from '../utils/ApiError.js';
import { CASUAL_CREDIT_START_OVERRIDES } from '../config/leavePolicies.js';

const ACTIVE_STATUSES = [LEAVE_STATUS.PENDING, LEAVE_STATUS.APPROVED];
const TYPE_LABEL = LEAVE_TYPE_LABEL;

/**
 * Days a request consumes, computed on the server only: 0.5 for a half day
 * (validated to be a single date), else the inclusive calendar-day count.
 */
export function leaveDaysFor({ startDate, endDate, duration }) {
  if (duration === LEAVE_DURATION.HALF_DAY) {
    if (calculateLeaveDays(startDate, endDate) !== 1) throw ApiError.badRequest('A half-day leave must start and end on the same date.');
    return HALF_DAY_DAYS;
  }
  return calculateLeaveDays(startDate, endDate);
}

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
 * new request for the same dates. The one exception: two half days of the same
 * date in opposite sessions (Morning + Evening) don't overlap.
 */
export async function assertNoOverlap(employeeId, startDate, endDate, excludeLeaveId = null, halfDaySession = null) {
  const filter = {
    employeeId,
    status: { $in: ACTIVE_STATUSES },
    startDate: { $lte: endDate },
    endDate: { $gte: startDate },
  };
  if (excludeLeaveId) filter._id = { $ne: excludeLeaveId };

  const overlapping = await Leave.find(filter).select('duration halfDaySession').lean();
  const clash = overlapping.find(
    (l) => !(halfDaySession && l.duration === LEAVE_DURATION.HALF_DAY && l.halfDaySession && l.halfDaySession !== halfDaySession)
  );
  if (clash) {
    throw ApiError.badRequest(
      clash.duration === LEAVE_DURATION.HALF_DAY && halfDaySession
        ? 'You already have a half-day leave for this session on this date.'
        : 'This date range overlaps with an existing leave request.'
    );
  }
}

/**
 * First day Sick Leave may be taken: the 1st of the month in which Sick Leave
 * credits start — the joining month + 2 calendar months (Sep → Nov, Dec → Feb),
 * never before the policy start. null for a missing or invalid joining date,
 * which means NOT eligible, never "no restriction".
 */
export function getSickLeaveEligibleFrom(joiningDate) {
  if (!joiningDate || Number.isNaN(new Date(joiningDate).getTime())) return null;
  return creditStart(LEAVE_TYPE.SICK, joiningDate);
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

// ---- Accruing leave (Casual, Sick): monthly credits with unlimited carry-forward ----
// The balance is derived, never stored: credits are a pure function of the
// joining date and the calendar month, so refreshes, retries, tabs and
// concurrent calls can never grant a month twice, and nothing resets at
// month-end. Usage comes from the leave requests themselves. Each type differs
// only by its LEAVE_ACCRUAL config (policy start, months after joining).
const monthIndex = (date) => {
  const d = new Date(date);
  return d.getUTCFullYear() * 12 + d.getUTCMonth();
};
const fromIndex = (i) => new Date(Date.UTC(Math.floor(i / 12), i % 12, 1));
const policyStartIndex = (type) => LEAVE_ACCRUAL[type].START_YEAR * 12 + LEAVE_ACCRUAL[type].START_MONTH_INDEX;

/**
 * First month (as a UTC month-start Date) in which this employee earns `type` leave.
 * `employeeId` (optional) applies an HR-approved per-employee start (config/leavePolicies.js).
 */
export function creditStart(type, joiningDate, employeeId = null) {
  const cfg = LEAVE_ACCRUAL[type];
  const policy = policyStartIndex(type);
  const joined = joiningDate && !Number.isNaN(new Date(joiningDate).getTime()) ? monthIndex(joiningDate) + cfg.ELIGIBLE_AFTER_JOINING_MONTHS : policy;
  const override = type === LEAVE_TYPE.CASUAL && employeeId ? CASUAL_CREDIT_START_OVERRIDES[String(employeeId)] : null;
  const own = override ? override.year * 12 + override.monthIndex : -Infinity;
  return fromIndex(Math.max(policy, joined, own));
}

const validDate = (d) => Boolean(d) && !Number.isNaN(new Date(d).getTime());

/**
 * For a type with a yearly reset (Sick): the leave year containing `date`, as month
 * indexes { start, end } (end exclusive), anchored on the joining month — joined
 * September → Sep–Aug every year. null for carry-forward types (Casual) or without a
 * joining date.
 */
export function leaveYearOf(type, joiningDate, date) {
  if (!LEAVE_ACCRUAL[type]?.YEARLY_RESET || !validDate(joiningDate)) return null;
  const anchor = monthIndex(joiningDate);
  const m = monthIndex(date);
  const start = m < anchor ? anchor : anchor + Math.floor((m - anchor) / 12) * 12;
  return { start, end: start + 12 };
}

/** The leave year of `date` as dates { start, end } (end = the reset day, exclusive), or null. */
export function leaveYearDates(type, joiningDate, date) {
  const y = leaveYearOf(type, joiningDate, date);
  return y ? { start: fromIndex(y.start), end: fromIndex(y.end) } : null;
}

/**
 * `type` days earned through the month of `date`, inclusive: from its credit start
 * month (carry-forward types), or — with a yearly reset — from the later of the credit
 * start and the start of that leave year, capped at MAX_PER_YEAR.
 */
export function creditsThrough(type, joiningDate, date, employeeId = null) {
  const cfg = LEAVE_ACCRUAL[type];
  if (cfg.REQUIRES_JOINING_DATE && !validDate(joiningDate)) return 0;
  const year = leaveYearOf(type, joiningDate, date);
  const first = Math.max(monthIndex(creditStart(type, joiningDate, employeeId)), year ? year.start : -Infinity);
  const credits = Math.max(0, monthIndex(date) - first + 1) * cfg.DAYS_PER_MONTH;
  return cfg.MAX_PER_YEAR ? Math.min(cfg.MAX_PER_YEAR, credits) : credits;
}

/**
 * The full entitlement of the leave year containing `date` (credits through its last
 * month): 12 in a full year; less in the first year (eligibility starts two months
 * after joining) or where the policy start falls inside the year. null without a reset.
 */
export function yearlyAllowance(type, joiningDate, date, employeeId = null) {
  const year = leaveYearOf(type, joiningDate, date);
  return year ? creditsThrough(type, joiningDate, fromIndex(year.end - 1), employeeId) : null;
}

/**
 * `type` days with one of `statuses` since that type's accrual began (earlier leave never
 * counts) — with `year` ({ start, end } dates), only leave starting inside that leave year.
 */
export async function daysTaken(type, employeeId, statuses = ACTIVE_STATUSES, excludeLeaveId = null, year = null) {
  const policyStart = fromIndex(policyStartIndex(type));
  const startDate = { $gte: year && year.start > policyStart ? year.start : policyStart };
  if (year) startDate.$lt = year.end;
  const match = { employeeId, leaveType: type, status: { $in: statuses }, startDate };
  if (excludeLeaveId) match._id = { $ne: excludeLeaveId };
  const [row] = await Leave.aggregate([{ $match: match }, { $group: { _id: null, days: { $sum: '$days' } } }]);
  return row?.days || 0;
}

/**
 * `type` days available for a leave starting on `date`: credits earned through
 * that month minus every other pending/approved day of that type (wherever dated —
 * within the same leave year for a yearly-reset type). Counting all other days, not
 * just earlier ones, means no combination of requests can ever spend more than has been earned.
 */
export async function getAvailable(type, employee, date, { statuses = ACTIVE_STATUSES, excludeLeaveId = null } = {}) {
  const year = leaveYearDates(type, employee.joiningDate, date);
  return creditsThrough(type, employee.joiningDate, date, employee._id) - (await daysTaken(type, employee._id, statuses, excludeLeaveId, year));
}

// Casual Leave names, kept for existing callers (same results as before).
export const getCasualCreditStart = (joiningDate) => creditStart(LEAVE_TYPE.CASUAL, joiningDate);
export const casualCreditsThrough = (joiningDate, date) => creditsThrough(LEAVE_TYPE.CASUAL, joiningDate, date);
export const casualDaysTaken = (employeeId, statuses = ACTIVE_STATUSES, excludeLeaveId = null) => daysTaken(LEAVE_TYPE.CASUAL, employeeId, statuses, excludeLeaveId);
export const getCasualAvailable = (employee, date, opts) => getAvailable(LEAVE_TYPE.CASUAL, employee, date, opts);

const monthYear = (d) => d.toLocaleDateString('en-IN', { month: 'long', year: 'numeric', timeZone: 'UTC' });

/**
 * Company leave policy, enforced on both submission and approval:
 * - Casual Leave and Sick Leave: only within the accrued balance (1/month,
 *   unlimited carry-forward; Sick from the second month after joining);
 * - LoP: no allowance (taken at the employee's own risk).
 * On submission, pending requests hold their days (no double-requesting the same
 * balance); on approval (`approving: true`) only already-approved leave counts,
 * so any one of several pending requests can still be approved.
 */
export async function assertLeaveAllowed(employee, leaveType, startDate, days, excludeLeaveId = null, { approving = false } = {}) {
  const statuses = approving ? [LEAVE_STATUS.APPROVED] : ACTIVE_STATUSES;

  if (LEAVE_ACCRUAL[leaveType]) {
    if (leaveType === LEAVE_TYPE.SICK) {
      const eligibleFrom = getSickLeaveEligibleFrom(employee.joiningDate);
      if (!eligibleFrom) throw ApiError.badRequest('Sick Leave needs a joining date on your profile. Please contact HR.');
      if (new Date(startDate) < eligibleFrom) {
        throw ApiError.badRequest(`Sick Leave is available from ${monthYear(eligibleFrom)} (the second calendar month after your joining month).`, { leaveType, eligibleFrom });
      }
    }
    const available = Math.max(0, await getAvailable(leaveType, employee, startDate, { statuses, excludeLeaveId }));
    if (days > available) {
      const { label } = monthWindow(startDate);
      throw ApiError.badRequest(
        `Not enough ${TYPE_LABEL[leaveType]}: ${available} day${available === 1 || available === 0.5 ? '' : 's'} available for ${label}, ${days} requested ` +
          `(short by ${days - available}). You can choose LoP instead.`,
        { leaveType, available, requested: days, shortfall: days - available }
      );
    }
    return;
  }

  const allowance = MONTHLY_LEAVE_ALLOWANCE[leaveType];
  if (allowance === undefined) return;

  const used = await countMonthlyLeaveDays(employee._id, leaveType, startDate, excludeLeaveId, statuses);
  if (used + days > allowance) {
    const { label } = monthWindow(startDate);
    throw ApiError.badRequest(
      used >= allowance
        ? `You have already used your ${TYPE_LABEL[leaveType]} for ${label}. Please choose LoP instead.`
        : `${TYPE_LABEL[leaveType]} is limited to ${allowance} day per month. Please choose LoP for the remaining days.`
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

/** One accruing type's balance (same shape for Casual and Sick). */
async function accruedBalance(type, employee, referenceDate) {
  const credited = creditsThrough(type, employee.joiningDate, referenceDate, employee._id);
  // Yearly-reset types (Sick) count usage inside the current leave year only.
  const year = leaveYearDates(type, employee.joiningDate, referenceDate);
  const [approved, pending] = await Promise.all([
    daysTaken(type, employee._id, [LEAVE_STATUS.APPROVED], null, year),
    daysTaken(type, employee._id, [LEAVE_STATUS.PENDING], null, year),
  ]);
  return {
    accruesPerMonth: LEAVE_ACCRUAL[type].DAYS_PER_MONTH,
    creditStart: creditStart(type, employee.joiningDate, employee._id),
    credited,
    approved,
    pending,
    available: Math.max(0, credited - approved - pending),
    ...(LEAVE_ACCRUAL[type].YEARLY_RESET
      ? {
          maxPerYear: LEAVE_ACCRUAL[type].MAX_PER_YEAR,
          // This leave year (null without a joining date): its first month, the reset day and its full entitlement.
          leaveYearStart: year?.start || null,
          resetsOn: year?.end || null,
          yearlyAllowance: year ? yearlyAllowance(type, employee.joiningDate, referenceDate, employee._id) : 0,
        }
      : {}),
  };
}

/** Current balances for the Leave page (Casual and Sick: accrued balance; LoP: used this month). */
export async function getLeaveSummary(employee, referenceDate = new Date()) {
  const { start, label } = monthWindow(referenceDate);
  const eligibleFrom = getSickLeaveEligibleFrom(employee.joiningDate);
  const lop = { allowance: null, used: await countMonthlyLeaveDays(employee._id, LEAVE_TYPE.LOP, start) };
  return {
    month: label,
    types: {
      [LEAVE_TYPE.CASUAL]: await accruedBalance(LEAVE_TYPE.CASUAL, employee, referenceDate),
      [LEAVE_TYPE.SICK]: {
        ...(await accruedBalance(LEAVE_TYPE.SICK, employee, referenceDate)),
        eligibleFrom,
        eligibleNow: Boolean(eligibleFrom) && new Date(referenceDate) >= eligibleFrom,
      },
      [LEAVE_TYPE.LOP]: lop,
      // Same entry under the old key, so an app version cached before the rename still renders.
      [LEAVE_TYPE.PAID]: lop,
    },
  };
}
