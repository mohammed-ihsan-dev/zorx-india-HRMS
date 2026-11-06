import { titleCase } from '../../utils/formatters.js';

// Leave records without `duration` were created before half days existed: Full Day.
export const isHalfDay = (leave) => leave?.duration === 'HALF_DAY';

/** "Half Day (Morning)" | "Full Day". */
export function leaveDurationLabel(leave) {
  if (!isHalfDay(leave)) return 'Full Day';
  return leave.halfDaySession ? `Half Day (${titleCase(leave.halfDaySession)})` : 'Half Day';
}

/** "Casual Leave — Half Day (Morning)". */
export const leaveTitle = (leave) => `${titleCase(leave?.leaveType || '')} Leave — ${leaveDurationLabel(leave)}`;

/** 0.5 → "0.5 day", 1 → "1 day", 3 → "3 days". */
export const formatLeaveDays = (days) => `${days} day${days > 1 ? 's' : ''}`;

// Casual and Sick Leave accrue the same way (server: leaveService.creditsThrough):
// 1/month from `creditStart`, unlimited carry-forward, pending + approved days held.
export const ACCRUING_TYPES = ['CASUAL', 'SICK'];
const monthIndexOf = (ymdOrIso) => {
  const s = String(ymdOrIso).slice(0, 7);
  return Number(s.slice(0, 4)) * 12 + Number(s.slice(5, 7)) - 1;
};

/** Days available for a leave starting on `startYMD` (display only; the server stays authoritative). */
export function accruedAvailable(info, startYMD) {
  if (!info?.creditStart || !startYMD) return null;
  const credits = Math.max(0, monthIndexOf(startYMD) - monthIndexOf(info.creditStart) + 1) * (info.accruesPerMonth || 0);
  return Math.max(0, credits - (info.approved || 0) - (info.pending || 0));
}

/** "Sick Leave: 2 available · 1 pending · 1 approved · credited 4 since Nov 2026" (HR review). */
export function balanceLine(type, info) {
  if (!info) return '';
  const name = `${type.charAt(0)}${type.slice(1).toLowerCase()} Leave`;
  if (!ACCRUING_TYPES.includes(type)) return type === 'PAID' ? `${name}: ${info.used} day${info.used === 1 ? '' : 's'} used this month (no allowance).` : '';
  const since = info.creditStart ? new Date(info.creditStart).toLocaleDateString('en-GB', { month: 'short', year: 'numeric', timeZone: 'UTC' }) : '';
  if (type === 'SICK' && !info.eligibleNow) return `${name}: not yet eligible${since ? ` (first month ${since})` : ''}.`;
  return `${name}: ${info.available} available · ${info.pending} pending · ${info.approved} approved · ${info.credited} credited since ${since}.`;
}
