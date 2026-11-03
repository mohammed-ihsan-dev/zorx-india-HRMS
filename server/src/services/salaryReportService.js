// Salary Report (attendance-based, read-only): a monthly calendar of check-in,
// check-out and overtime per employee. Not payroll — it never changes attendance.
// Overtime comes only from overtimeService (the app's one overtime rule).
import { getZonedParts } from '../utils/dateUtils.js';
import { env } from '../config/env.js';
import { overtimeForRecord } from './overtimeService.js';

const toValidDate = (value) => {
  if (!value) return null;
  const d = value instanceof Date ? value : new Date(value);
  return Number.isFinite(d.getTime()) ? d : null;
};

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
 * Report rows (days with a check-in) from attendance records (employeeId
 * populated), sorted by date, then employee name. They feed the table and CSV.
 */
export function buildSalaryRows(records, officeSettings = null, timeZone = env.timezone) {
  return records
    .filter((r) => r.checkIn?.timestamp)
    .map((r) => {
      const overtimeMinutes = overtimeForRecord(r, r.employeeId, officeSettings, timeZone);
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

const STATUS_LABEL = { PRESENT: 'Present', LATE: 'Late', HALF_DAY: 'Half day', ABSENT: 'Absent', LEAVE: 'Leave', HOLIDAY: 'Holiday', WEEKEND: 'Weekend' };

/**
 * One employee's month as calendar weeks (Monday first), shared by the screen
 * and the PDF. Each in-month cell is one of:
 *   record     — has a check-in: In / Out ("—" = missing check-out) / OT
 *   status     — a record without a check-in (e.g. Leave, Absent): its status
 *   no-record  — a past or current day with no attendance record
 *   upcoming   — a future day (left empty)
 * Sundays and holidays are flagged so they can be shaded; nothing is invented.
 */
export function buildCalendarMonth({ range, records, employee, holidays = [], officeSettings = null, today = new Date(), timeZone = env.timezone }) {
  const byDay = new Map(records.map((r) => [new Date(r.date).toISOString().slice(0, 10), r]));
  const holidayByDay = new Map(holidays.map((h) => [new Date(h.date).toISOString().slice(0, 10), h.name]));
  const t = getZonedParts(today, timeZone);
  const todayKey = `${t.year}-${String(t.month).padStart(2, '0')}-${String(t.day).padStart(2, '0')}`;
  const y = range.start.getUTCFullYear();
  const m = range.start.getUTCMonth();
  const daysInMonth = new Date(Date.UTC(y, m + 1, 0)).getUTCDate();
  const lead = (range.start.getUTCDay() + 6) % 7; // Monday = 0
  const cells = Array(lead).fill(null);
  let daysWithRecords = 0;
  let totalOvertimeMinutes = 0;
  for (let d = 1; d <= daysInMonth; d += 1) {
    const dateKey = `${y}-${String(m + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
    const weekday = new Date(Date.UTC(y, m, d)).getUTCDay();
    const r = byDay.get(dateKey);
    const cell = { day: d, dateKey, isSunday: weekday === 0, holiday: holidayByDay.get(dateKey) || null };
    if (r?.checkIn?.timestamp) {
      const overtimeMinutes = overtimeForRecord(r, employee, officeSettings, timeZone);
      daysWithRecords += 1;
      totalOvertimeMinutes += overtimeMinutes || 0;
      Object.assign(cell, {
        kind: 'record',
        checkIn: formatClockTime(r.checkIn.timestamp, timeZone),
        checkOut: r.checkOut?.timestamp ? formatClockTime(r.checkOut.timestamp, timeZone) : null,
        overtimeMinutes,
        overtime: formatOvertime(overtimeMinutes),
        status: r.status,
      });
    } else if (r) {
      daysWithRecords += 1;
      Object.assign(cell, { kind: 'status', status: r.status, statusLabel: STATUS_LABEL[r.status] || r.status });
    } else {
      cell.kind = dateKey > todayKey ? 'upcoming' : 'no-record';
    }
    cells.push(cell);
  }
  while (cells.length % 7) cells.push(null);
  const weeks = Array.from({ length: cells.length / 7 }, (_, i) => cells.slice(i * 7, i * 7 + 7));
  return {
    employeeId: employee?._id ? String(employee._id) : null,
    employeeName: employeeDisplayName(employee),
    employeeCode: employee?.employeeCode || '',
    monthLabel: range.label,
    weeks,
    daysWithRecords,
    totalOvertimeMinutes,
    totalOvertime: formatOvertime(totalOvertimeMinutes),
  };
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
