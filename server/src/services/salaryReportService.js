// Salary Report (attendance-based, read-only): check-in, check-out and time
// worked after the 7:00 PM cutoff. Not payroll — it never changes attendance,
// and the "overtime after 7 PM" figure is separate from Attendance.overtimeMinutes.
import { getZonedParts } from '../utils/dateUtils.js';
import { env } from '../config/env.js';

export const OVERTIME_CUTOFF = '19:00';
const DAY_MS = 86_400_000;

const toValidDate = (value) => {
  if (!value) return null;
  const d = value instanceof Date ? value : new Date(value);
  return Number.isFinite(d.getTime()) ? d : null;
};

/**
 * Minutes worked after the cutoff on the attendance day, from the RECORDED
 * checkout only. `attendanceDate` is the record's day key (UTC midnight of the
 * office-timezone day). Returns null when it can't be determined (no or invalid
 * checkout, or a checkout before the attendance day) — never guessed.
 * A checkout after midnight counts all the way from that day's cutoff.
 */
export function overtimeAfterCutoffMinutes(attendanceDate, checkOutAt, { timeZone = env.timezone, cutoff = OVERTIME_CUTOFF } = {}) {
  const day = toValidDate(attendanceDate);
  const out = toValidDate(checkOutAt);
  if (!day || !out) return null;
  const [ch, cm] = cutoff.split(':').map(Number);
  const local = getZonedParts(out, timeZone);
  const localDay = Date.UTC(local.year, local.month - 1, local.day);
  const dayOffset = Math.round((localDay - Date.UTC(day.getUTCFullYear(), day.getUTCMonth(), day.getUTCDate())) / DAY_MS);
  if (dayOffset < 0) return null;
  const minutesAfterCutoff = dayOffset * 1440 + local.hour * 60 + local.minute + local.second / 60 - (ch * 60 + cm);
  return Math.max(0, Math.floor(minutesAfterCutoff));
}

/** 75 → "01h 15m"; null → "—". */
export function formatOvertime(minutes) {
  if (minutes === null || minutes === undefined || !Number.isFinite(minutes)) return '—';
  const pad = (n) => String(n).padStart(2, '0');
  return `${pad(Math.floor(minutes / 60))}h ${pad(minutes % 60)}m`;
}

/** Timestamp → "07:30 PM" in the office timezone; missing/invalid → "—". */
export function formatClockTime(value, timeZone = env.timezone) {
  const d = toValidDate(value);
  if (!d) return '—';
  const { hour, minute } = getZonedParts(d, timeZone);
  const h12 = hour % 12 === 0 ? 12 : hour % 12;
  return `${String(h12).padStart(2, '0')}:${String(minute).padStart(2, '0')} ${hour < 12 ? 'AM' : 'PM'}`;
}

// Fixed names, so table/CSV/PDF never depend on the server's locale data ("Sep" vs "Sept").
const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

/** Day key → "27 Oct 2026". */
export function formatReportDate(value) {
  const d = toValidDate(value);
  return d ? `${String(d.getUTCDate()).padStart(2, '0')} ${MONTHS[d.getUTCMonth()].slice(0, 3)} ${d.getUTCFullYear()}` : '—';
}

export const employeeDisplayName = (e) => `${e?.firstName || ''} ${e?.lastName || ''}`.replace(/\s+/g, ' ').trim() || 'Unknown employee';

/** "2026-10" → { start, end, label } as attendance day keys [start, end). null if invalid. */
export function monthRange(month) {
  const m = /^(\d{4})-(0[1-9]|1[0-2])$/.exec(month || '');
  if (!m) return null;
  const y = Number(m[1]);
  const mi = Number(m[2]) - 1;
  if (y < 2000 || y > 2100) return null;
  return {
    start: new Date(Date.UTC(y, mi, 1)),
    end: new Date(Date.UTC(y, mi + 1, 1)),
    label: `${MONTHS[mi]} ${y}`,
  };
}

/**
 * Report rows from attendance records (employeeId populated), sorted by date,
 * then employee name. These exact rows feed the table, the CSV and the PDF.
 */
export function buildSalaryRows(records, timeZone = env.timezone) {
  return records
    .map((r) => {
      // The employee's own cutoff if HR set one (e.g. 7 PM in their timezone), else 7 PM.
      const cutoff = r.employeeId?.overtimeCutoffTime || OVERTIME_CUTOFF;
      const overtimeMinutes = overtimeAfterCutoffMinutes(r.date, r.checkOut?.timestamp, { timeZone, cutoff });
      return {
        employeeName: employeeDisplayName(r.employeeId),
        employeeCode: r.employeeId?.employeeCode || '',
        dateKey: new Date(r.date).toISOString().slice(0, 10),
        date: formatReportDate(r.date),
        checkIn: formatClockTime(r.checkIn?.timestamp, timeZone),
        checkOut: formatClockTime(r.checkOut?.timestamp, timeZone),
        overtimeMinutes,
        overtime: formatOvertime(overtimeMinutes),
      };
    })
    .sort((a, b) => a.dateKey.localeCompare(b.dateKey) || a.employeeName.localeCompare(b.employeeName));
}

export const SALARY_COLUMNS = [
  { label: 'Employee Name', value: (r) => r.employeeName },
  { label: 'Date', value: (r) => r.date },
  { label: 'Check-in Time', value: (r) => r.checkIn },
  { label: 'Check-out Time', value: (r) => r.checkOut },
  { label: 'Overtime Used', value: (r) => r.overtime },
];

/** "Muhammed Rifan" → "muhammed-rifan" for filenames. */
export const slugify = (text) =>
  String(text || '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60);
