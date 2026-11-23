// Reports → Leave: reporting periods, the days a leave contributes to a period,
// and the "taken" totals. Read-only. Leave balances are NOT calculated here —
// the Sick Leave balance comes from leaveService.getLeaveSummary, the same
// calculation the employee's Leave page and the HR review screen use.
import { getZonedParts } from '../utils/dateUtils.js';
import { env } from '../config/env.js';
import { ApiError } from '../utils/ApiError.js';
import { LEAVE_TYPE, LEAVE_STATUS, LEAVE_DURATION } from '../utils/constants.js';

const DAY_MS = 86_400_000;
const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

export const LEAVE_REPORT_PERIOD = Object.freeze({
  CURRENT_MONTH: 'current_month',
  PREVIOUS_MONTH: 'previous_month',
  CUSTOM: 'custom',
  ALL: 'all',
});

// LoP family: LOP, its old name PAID (migrated, but old records may remain) and the
// retired UNPAID type. All three are unpaid leave, so they count as LoP taken.
export const LOP_TYPES = Object.freeze([LEAVE_TYPE.LOP, LEAVE_TYPE.PAID, LEAVE_TYPE.UNPAID]);

/** Leave type filter value → Mongo condition ('LOP' also matches PAID and UNPAID). */
export function leaveTypeCondition(leaveType) {
  if (!leaveType) return undefined;
  return LOP_TYPES.includes(leaveType) ? { $in: LOP_TYPES } : leaveType;
}

/** "YYYY-MM-DD" → UTC-midnight day key (the convention Leave dates use), or null. */
export function parseDayKey(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const d = new Date(`${value}T00:00:00.000Z`);
  return Number.isFinite(d.getTime()) && d.toISOString().slice(0, 10) === value ? d : null;
}

const keyLabel = (d) => `${String(d.getUTCDate()).padStart(2, '0')} ${MONTHS[d.getUTCMonth()].slice(0, 3)} ${d.getUTCFullYear()}`;

/**
 * The reporting period as inclusive day keys { from, to } (null = unbounded) plus a label.
 * Months are calendar months in the HRMS timezone (env.timezone), so the first and last
 * day of "this month" follow India time, not the server's clock.
 */
export function resolveLeavePeriod({ period = LEAVE_REPORT_PERIOD.CURRENT_MONTH, from, to } = {}, now = new Date(), timeZone = env.timezone) {
  if (!Object.values(LEAVE_REPORT_PERIOD).includes(period)) throw ApiError.badRequest('Please choose a valid reporting period.');
  if (period === LEAVE_REPORT_PERIOD.ALL) return { period, from: null, to: null, label: 'All time' };
  if (period === LEAVE_REPORT_PERIOD.CUSTOM) {
    const f = parseDayKey(from);
    const t = parseDayKey(to);
    if (!f || !t) throw ApiError.badRequest('Please choose a valid start and end date.');
    if (t < f) throw ApiError.badRequest('The end date must be on or after the start date.');
    return { period, from: f, to: t, label: `${keyLabel(f)} – ${keyLabel(t)}` };
  }
  const { year, month } = getZonedParts(now, timeZone);
  const offset = period === LEAVE_REPORT_PERIOD.PREVIOUS_MONTH ? -1 : 0;
  // Date.UTC rolls month -1 / 12 over into the neighbouring year.
  const start = new Date(Date.UTC(year, month - 1 + offset, 1));
  const end = new Date(Date.UTC(year, month + offset, 0));
  return { period, from: start, to: end, label: `${MONTHS[start.getUTCMonth()]} ${start.getUTCFullYear()}` };
}

/**
 * Days of `leave` that fall inside [from, to] (inclusive day keys; null = unbounded).
 * A leave entirely inside the period contributes its stored `days` (0.5 for a half day),
 * exactly what the balance logic deducts. A leave crossing the period edge contributes
 * its share by calendar days — the same rule `days` itself is computed with
 * (leaveService.calculateLeaveDays counts calendar days).
 */
export function daysInPeriod(leave, from = null, to = null) {
  const start = new Date(leave.startDate).getTime();
  const end = new Date(leave.endDate).getTime();
  const days = Number(leave.days) || 0;
  if (!Number.isFinite(start) || !Number.isFinite(end)) return 0;
  const lo = from ? Math.max(start, from.getTime()) : start;
  const hi = to ? Math.min(end, to.getTime()) : end;
  if (hi < lo) return 0;
  const span = Math.round((end - start) / DAY_MS) + 1;
  const overlap = Math.round((hi - lo) / DAY_MS) + 1;
  if (leave.duration === LEAVE_DURATION.HALF_DAY || overlap >= span) return days;
  return round2((days * overlap) / span);
}

export const round2 = (n) => Math.round(n * 100) / 100;

/** Bucket used by the statistics cards. */
export function statBucket(leaveType) {
  if (leaveType === LEAVE_TYPE.CASUAL) return 'casual';
  if (leaveType === LEAVE_TYPE.SICK) return 'sick';
  if (LOP_TYPES.includes(leaveType)) return 'lop';
  return 'other';
}

/** "Taken" totals: APPROVED leave only, each record counted once, clipped to the period. */
export function summarizeTaken(leaves, from = null, to = null) {
  const totals = { casual: 0, sick: 0, lop: 0, other: 0, total: 0, approvedRequests: 0 };
  for (const leave of leaves) {
    if (leave.status !== LEAVE_STATUS.APPROVED) continue;
    const d = daysInPeriod(leave, from, to);
    if (d <= 0) continue;
    totals[statBucket(leave.leaveType)] += d;
    totals.total += d;
    totals.approvedRequests += 1;
  }
  for (const k of ['casual', 'sick', 'lop', 'other', 'total']) totals[k] = round2(totals[k]);
  return totals;
}

/** "Sick Leave Remaining" from getLeaveSummary's SICK entry — never recalculated here. */
export function sickBalanceFrom(sick, employee) {
  if (!sick) return { state: 'unavailable', reason: 'No leave balance could be calculated.' };
  if (!employee?.joiningDate) return { state: 'unavailable', reason: 'No joining date on the employee profile.' };
  if (!sick.eligibleNow) {
    return { state: 'not_eligible', eligibleFrom: sick.eligibleFrom, credited: sick.credited, remaining: 0 };
  }
  // Yearly-reset Sick Leave: the entitlement of the current leave year (12 in a full year).
  const allowance = Number.isFinite(sick.yearlyAllowance) ? sick.yearlyAllowance : null;
  return {
    state: 'ok',
    allowance,
    credited: sick.credited,
    approved: sick.approved,
    pending: sick.pending,
    // This leave year's entitlement minus APPROVED days (rejected/cancelled never count; pending shown separately).
    remaining: Math.max(0, round2((allowance ?? sick.credited) - sick.approved)),
    // What can be requested today: credited so far minus approved and pending — the employee's Leave page figure.
    availableToRequest: sick.available,
    accruesPerMonth: sick.accruesPerMonth,
    creditStart: sick.creditStart,
    leaveYearStart: sick.leaveYearStart || null,
    resetsOn: sick.resetsOn || null,
  };
}

/**
 * CSV cell. Text that a spreadsheet would run as a formula (=, +, -, @, tab, CR)
 * is prefixed with a single quote; numbers are written as numbers.
 */
export function csvCell(value) {
  if (value === null || value === undefined) return '';
  if (typeof value === 'number') return Number.isFinite(value) ? String(value) : '';
  let str = String(value);
  if (/^[=+\-@\t\r]/.test(str)) str = `'${str}`;
  return /[",\n\r]/.test(str) ? `"${str.replace(/"/g, '""')}"` : str;
}
