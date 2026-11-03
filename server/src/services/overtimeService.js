// The one overtime rule for the whole app (Salary Report, attendance history and
// calendar, Attendance Report CSV, stored value at check-out):
//   check-out at or before 7:00 PM  → 0
//   check-out after 7:00 PM         → check-out − 6:00 PM
// in the company timezone, from the RECORDED check-out only. 7 PM is the
// eligibility threshold; 6 PM is where counting starts once it is crossed.
// An employee may have their own pair (HR-set): threshold = overtimeCutoffTime,
// start = workingEndTime — e.g. 7 PM / 6 PM Dubai = 20:30 / 19:30 IST.
import { getZonedParts } from '../utils/dateUtils.js';
import { env } from '../config/env.js';

export const OVERTIME_THRESHOLD = '19:00';
export const OVERTIME_START = '18:00';
const DAY_MS = 86_400_000;

const hhmmToMinutes = (hhmm) => {
  const [h, m] = String(hhmm).split(':').map(Number);
  return h * 60 + m;
};
const toValidDate = (value) => {
  if (!value) return null;
  const d = value instanceof Date ? value : new Date(value);
  return Number.isFinite(d.getTime()) ? d : null;
};

/** The threshold/start pair that applies to this employee (company default unless HR set their own). */
export function overtimeRuleFor(employee) {
  if (employee?.overtimeCutoffTime) {
    return { threshold: employee.overtimeCutoffTime, start: employee.workingEndTime || OVERTIME_START };
  }
  return { threshold: OVERTIME_THRESHOLD, start: OVERTIME_START };
}

/**
 * Overtime minutes for one attendance day, or null when it cannot be determined
 * (no or invalid check-out, or a check-out before the attendance day) — never guessed.
 * `attendanceDate` is the record's day key (UTC midnight of the company-timezone day).
 * Minute precision: 7:00:59 PM still counts as 7:00 PM (zero).
 */
export function calculateOvertimeMinutes(attendanceDate, checkOutAt, { threshold = OVERTIME_THRESHOLD, start = OVERTIME_START, timeZone = env.timezone } = {}) {
  const day = toValidDate(attendanceDate);
  const out = toValidDate(checkOutAt);
  if (!day || !out) return null;
  const local = getZonedParts(out, timeZone);
  const dayOffset = Math.round((Date.UTC(local.year, local.month - 1, local.day) - Date.UTC(day.getUTCFullYear(), day.getUTCMonth(), day.getUTCDate())) / DAY_MS);
  if (dayOffset < 0) return null;
  // Minutes since the attendance day's midnight (a check-out after midnight keeps counting).
  const outMinute = dayOffset * 1440 + local.hour * 60 + local.minute;
  if (outMinute <= hhmmToMinutes(threshold)) return 0;
  return Math.max(0, outMinute - hhmmToMinutes(start));
}

/** Overtime for an attendance record of `employee`; 0 when overtime is switched off in Office Settings. */
export function overtimeForRecord(record, employee, officeSettings, timeZone = env.timezone) {
  const minutes = calculateOvertimeMinutes(record?.date, record?.checkOut?.timestamp, { ...overtimeRuleFor(employee), timeZone });
  if (minutes === null) return null;
  return officeSettings?.overtimeEnabled === false ? 0 : minutes;
}
