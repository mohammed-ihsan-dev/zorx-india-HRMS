import { titleCase } from '../../utils/formatters.js';

// Leave records without `duration` were created before half days existed: Full Day.
export const isHalfDay = (leave) => leave?.duration === 'HALF_DAY';

/** "Half Day (Morning)" | "Full Day". */
export function leaveDurationLabel(leave) {
  if (!isHalfDay(leave)) return 'Full Day';
  return leave.halfDaySession ? `Half Day (${titleCase(leave.halfDaySession)})` : 'Half Day';
}

// LoP (Loss of Pay) was called Paid Leave before; 'PAID' may still appear from an old cache.
const TYPE_NAME = { CASUAL: 'Casual Leave', SICK: 'Sick Leave', LOP: 'LoP', PAID: 'LoP' };
const TYPE_SHORT = { CASUAL: 'Casual', SICK: 'Sick', LOP: 'LoP', PAID: 'LoP' };

/** "Casual Leave" | "Sick Leave" | "LoP". */
export const leaveTypeName = (type) => TYPE_NAME[type] || (type ? `${titleCase(type)} Leave` : '');
/** "Casual" | "Sick" | "LoP" (tight spaces: calendar cells, table cells, cards). */
export const leaveTypeShort = (type) => TYPE_SHORT[type] || titleCase(type || '');

/** "Casual Leave — Half Day (Morning)". */
export const leaveTitle = (leave) => `${leaveTypeName(leave?.leaveType)} — ${leaveDurationLabel(leave)}`;

/** 0.5 → "0.5 day", 1 → "1 day", 3 → "3 days". */
export const formatLeaveDays = (days) => `${days} day${days > 1 ? 's' : ''}`;

// Casual and Sick Leave accrue 1/month from `creditStart` (server: leaveService.creditsThrough),
// pending + approved days held. Casual carries forward with no cap. Sick has a yearly reset:
// the leave year starts in the joining month (`leaveYearStart` → `resetsOn`), at most
// `maxPerYear` (12), and unused days lapse at the reset.
export const ACCRUING_TYPES = ['CASUAL', 'SICK'];
const monthIndexOf = (ymdOrIso) => {
  const s = String(ymdOrIso).slice(0, 7);
  return Number(s.slice(0, 4)) * 12 + Number(s.slice(5, 7)) - 1;
};
// Fixed month names (browser locale data differs: "Sep" vs "Sept"). Dates are UTC day keys.
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const shortMonth = (iso) => `${MONTHS[new Date(iso).getUTCMonth()]} ${new Date(iso).getUTCFullYear()}`;
const shortDay = (iso) => `${new Date(iso).getUTCDate()} ${shortMonth(iso)}`;

/**
 * Days available for a leave starting on `startYMD` (display only; the server stays authoritative).
 * null when it can't be known here — e.g. a Sick Leave date in another leave year.
 */
export function accruedAvailable(info, startYMD) {
  if (!info?.creditStart || !startYMD) return null;
  const month = monthIndexOf(startYMD);
  let first = monthIndexOf(info.creditStart);
  if (info.leaveYearStart && info.resetsOn) {
    if (month < monthIndexOf(info.leaveYearStart) || month >= monthIndexOf(info.resetsOn)) return null;
    first = Math.max(first, monthIndexOf(info.leaveYearStart));
  }
  let credits = Math.max(0, month - first + 1) * (info.accruesPerMonth || 0);
  if (info.maxPerYear) credits = Math.min(credits, info.maxPerYear);
  return Math.max(0, credits - (info.approved || 0) - (info.pending || 0));
}

/** "unused days carry forward" (Casual) or "up to 12 a year · resets 1 Sep 2027" (Sick). */
export function renewalNote(info) {
  return info?.resetsOn ? `up to ${info.maxPerYear} a year · resets ${shortDay(info.resetsOn)}` : 'unused days carry forward';
}

/** The same as a sentence: "Unused days carry forward." / "Up to 12 a year · resets 1 Sep 2027." */
export function renewalText(info) {
  const note = renewalNote(info);
  return `${note.charAt(0).toUpperCase()}${note.slice(1)}.`;
}

/** "Sick Leave: 2 available · 1 pending · 1 approved · credited 4 since Nov 2026" (HR review). */
export function balanceLine(type, info) {
  if (!info) return '';
  const name = leaveTypeName(type);
  if (!ACCRUING_TYPES.includes(type)) return type === 'LOP' || type === 'PAID' ? `${name}: ${info.used} day${info.used === 1 ? '' : 's'} used this month (no allowance).` : '';
  const since = info.creditStart ? shortMonth(info.creditStart) : '';
  if (type === 'SICK' && !info.eligibleNow) return `${name}: not yet eligible${since ? ` (first month ${since})` : ''}.`;
  if (info.resetsOn) {
    return `${name}: ${info.available} available · ${info.pending} pending · ${info.approved} approved · ${info.credited} of ${info.yearlyAllowance} credited this leave year (resets ${shortDay(info.resetsOn)}).`;
  }
  return `${name}: ${info.available} available · ${info.pending} pending · ${info.approved} approved · ${info.credited} credited since ${since}.`;
}
