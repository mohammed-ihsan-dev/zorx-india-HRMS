// Reports → Leave: display helpers. Every number comes from the server
// (/reports/leave and /reports/leave/stats); nothing is recalculated here.

export const LEAVE_REPORT_PERIODS = [
  { value: 'current_month', label: 'Current Month' },
  { value: 'previous_month', label: 'Previous Month' },
  { value: 'custom', label: 'Custom Date Range' },
  { value: 'all', label: 'All Time' },
];

export const LEAVE_REPORT_STATUSES = ['', 'APPROVED', 'PENDING', 'REJECTED', 'CANCELLED'];
export const LEAVE_REPORT_TYPES = ['', 'CASUAL', 'SICK', 'LOP'];

const YMD = /^\d{4}-\d{2}-\d{2}$/;

/**
 * Query params shared by the statistics, the history and the CSV export, or
 * null while a custom range is incomplete or reversed (nothing is requested then).
 */
export function buildLeaveReportParams({ employeeId, period, from, to, leaveType }) {
  const params = { period };
  if (period === 'custom') {
    if (!YMD.test(from || '') || !YMD.test(to || '') || to < from) return null;
    params.from = from;
    params.to = to;
  }
  if (employeeId) params.employeeId = employeeId;
  if (leaveType) params.leaveType = leaveType;
  return params;
}

/** 0.5 → "0.5", 1.25 → "1.25", 3 → "3" (no float noise). */
export const formatDayNumber = (n) => String(Math.round((Number(n) || 0) * 100) / 100);

/** 0.5 → "0.5 Day", 1 → "1 Day", 3 → "3 Days". */
export function formatDayCount(n) {
  const v = Math.round((Number(n) || 0) * 100) / 100;
  return `${formatDayNumber(v)} ${v > 1 ? 'Days' : 'Day'}`;
}

/** "0.5 Day (Morning)" | "1 Day" | "6 Days · 3 in period" (the part of a leave crossing the period edge). */
export function leaveDurationText(row) {
  const session = row?.duration === 'HALF_DAY' && row.halfDaySession ? ` (${row.halfDaySession.charAt(0)}${row.halfDaySession.slice(1).toLowerCase()})` : '';
  const base = `${formatDayCount(row?.days)}${session}`;
  const inPeriod = Number(row?.daysInPeriod);
  return Number.isFinite(inPeriod) && inPeriod !== Number(row?.days) ? `${base} · ${formatDayNumber(inPeriod)} in period` : base;
}

// Fixed month names (browser locale data differs: "Sep" vs "Sept"). Dates are UTC day keys.
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const monthYear = (value) => (value ? `${MONTHS[new Date(value).getUTCMonth()]} ${new Date(value).getUTCFullYear()}` : '');
const dayMonthYear = (value) => `${String(new Date(value).getUTCDate()).padStart(2, '0')} ${monthYear(value)}`;

/** The Sick Leave Remaining card: { value, hint } from the server's sickBalance (null = all employees). */
export function sickRemainingCard(sickBalance, employeeSelected) {
  if (!employeeSelected) return { value: '—', hint: 'Select an employee to see their balance.' };
  if (!sickBalance) return { value: '…', hint: '' };
  if (sickBalance.state === 'ok') {
    const pending = sickBalance.pending ? ` · ${formatDayNumber(sickBalance.pending)} pending` : '';
    if (sickBalance.allowance !== null && sickBalance.allowance !== undefined) {
      // Yearly Sick Leave: "8.5 / 12" = this leave year's entitlement minus approved days.
      const resets = sickBalance.resetsOn ? ` · resets ${dayMonthYear(sickBalance.resetsOn)}` : '';
      return {
        value: `${formatDayNumber(sickBalance.remaining)} / ${formatDayNumber(sickBalance.allowance)}`,
        hint: `${formatDayNumber(sickBalance.availableToRequest)} available now (${formatDayNumber(sickBalance.credited)} credited)${pending}${resets}`,
      };
    }
    const since = monthYear(sickBalance.creditStart);
    return {
      value: `${formatDayNumber(sickBalance.remaining)} / ${formatDayNumber(sickBalance.credited)}`,
      hint: `Days remaining · ${sickBalance.accruesPerMonth}/month${since ? ` since ${since}` : ''}${pending}`,
    };
  }
  if (sickBalance.state === 'not_eligible') {
    return { value: 'Not yet', hint: sickBalance.eligibleFrom ? `Eligible from ${monthYear(sickBalance.eligibleFrom)}` : 'Not eligible yet' };
  }
  return { value: 'Unavailable', hint: sickBalance.reason || 'The balance could not be verified.' };
}

/** "01 Nov 2026 – 30 Nov 2026" for a period from the server; "All time" when unbounded. */
export function periodRangeText(period) {
  if (!period) return '';
  if (!period.from || !period.to) return 'All time';
  return `${dayMonthYear(`${period.from}T00:00:00Z`)} – ${dayMonthYear(`${period.to}T00:00:00Z`)}`;
}
