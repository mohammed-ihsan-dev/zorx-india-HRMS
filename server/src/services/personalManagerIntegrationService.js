import { Attendance } from '../models/Attendance.js';
import { Leave } from '../models/Leave.js';
import { Holiday } from '../models/Holiday.js';
import { Employee } from '../models/Employee.js';
import { OfficeSettings } from '../models/OfficeSettings.js';
import { LEAVE_STATUS } from '../utils/constants.js';
import { env } from '../config/env.js';

// Read-only projection of ONE employee's attendance into the Personal Manager
// contract (v1). Only find()/lean() queries — this module never writes.

const DAY_MS = 86_400_000;
export const MAX_RANGE_DAYS = 93;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

/** Parses "YYYY-MM-DD" into UTC midnight (the HRMS day-key convention), or null if invalid. */
export function parseDayKey(value) {
  if (typeof value !== 'string' || !DATE_RE.test(value)) return null;
  const d = new Date(`${value}T00:00:00.000Z`);
  return Number.isFinite(d.getTime()) && d.toISOString().slice(0, 10) === value ? d : null;
}

const dayKey = (date) => new Date(date).toISOString().slice(0, 10);

/** ISO-8601 with the timezone's numeric offset, e.g. 2026-11-10T19:30:00+05:30. */
export function toOffsetIso(value, timeZone) {
  if (!value) return null;
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return null;
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat('en-US', {
      timeZone,
      year: 'numeric', month: '2-digit', day: '2-digit',
      hour: '2-digit', minute: '2-digit', second: '2-digit',
      hour12: false, timeZoneName: 'longOffset',
    }).formatToParts(date).map((p) => [p.type, p.value])
  );
  const offset = (parts.timeZoneName || 'GMT').replace('GMT', '') || '+00:00';
  const hour = String(Number(parts.hour) % 24).padStart(2, '0');
  return `${parts.year}-${parts.month}-${parts.day}T${hour}:${parts.minute}:${parts.second}${offset}`;
}

/** "HH:mm" on the record's day in `timeZone`, as an instant. */
function instantOnDay(dayKeyStr, hhmm, timeZone) {
  // Find the offset in effect on that day, then build the instant.
  const probe = new Date(`${dayKeyStr}T12:00:00.000Z`);
  const iso = toOffsetIso(probe, timeZone);
  const offset = iso.slice(19);
  return new Date(`${dayKeyStr}T${hhmm}:00${offset}`);
}

/** Minutes of completed (or still-open, capped at check-out) breaks that fall after `windowStart`. */
export function overtimeBreakMinutes(breaks, windowStart, checkOutAt) {
  if (!checkOutAt) return 0;
  const end = new Date(checkOutAt).getTime();
  const start = windowStart.getTime();
  if (end <= start) return 0;
  let ms = 0;
  for (const b of breaks || []) {
    const bs = new Date(b.startTime).getTime();
    const be = b.endTime ? new Date(b.endTime).getTime() : end;
    const overlap = Math.min(be, end) - Math.max(bs, start);
    if (overlap > 0) ms += overlap;
  }
  return Math.floor(ms / 60000);
}

function normalizeAttendance(record, { timeZone, overtimeStart }) {
  const date = dayKey(record.date);
  const checkIn = record.checkIn?.timestamp || null;
  const checkOut = record.checkOut?.timestamp || null;
  return {
    attendanceId: String(record._id),
    date,
    checkIn: toOffsetIso(checkIn, timeZone),
    checkOut: toOffsetIso(checkOut, timeZone),
    breakMinutes: Math.max(0, Number(record.breakMinutes) || 0),
    overtimeBreakMinutes: overtimeBreakMinutes(record.breaks, instantOnDay(date, overtimeStart, timeZone), checkOut),
    breaks: (record.breaks || []).map((b) => ({
      type: b.type,
      start: toOffsetIso(b.startTime, timeZone),
      end: toOffsetIso(b.endTime, timeZone),
      minutes: Math.max(0, Number(b.durationMinutes) || 0),
    })),
    status: String(record.status || 'ABSENT').toLowerCase(),
    attendanceMode: String(record.attendanceMode || 'OFFICE').toLowerCase(),
    source: 'attendance',
    updatedAt: record.updatedAt ? new Date(record.updatedAt).toISOString() : null,
  };
}

const emptyDay = (attendanceId, date, status, source, extra = {}) => ({
  attendanceId,
  date,
  checkIn: null,
  checkOut: null,
  breakMinutes: 0,
  overtimeBreakMinutes: 0,
  breaks: [],
  status,
  attendanceMode: null,
  source,
  updatedAt: null,
  ...extra,
});

/**
 * Attendance for `employeeId` between two UTC-midnight day keys (inclusive).
 * A real attendance record always wins for its day; otherwise an APPROVED
 * leave, then a company holiday, fills the day. Days with none are omitted.
 */
export async function getAttendanceForIntegration(employeeId, from, to) {
  const settings = await OfficeSettings.getSingleton();
  const timeZone = settings.timezone || env.timezone;
  const overtimeStart = settings.workingEndTime || env.workingEndTime;
  const toEnd = new Date(to.getTime() + DAY_MS - 1);

  const [employee, attendance, leaves, holidays] = await Promise.all([
    Employee.findById(employeeId).select('employeeCode firstName lastName').lean(),
    Attendance.find({ employeeId, date: { $gte: from, $lte: toEnd } }).sort({ date: 1 }).lean(),
    Leave.find({ employeeId, status: LEAVE_STATUS.APPROVED, startDate: { $lte: toEnd }, endDate: { $gte: from } }).lean(),
    Holiday.find({ date: { $gte: from, $lte: toEnd } }).lean(),
  ]);
  if (!employee) return null;

  const byDay = new Map();
  for (const r of attendance) byDay.set(dayKey(r.date), normalizeAttendance(r, { timeZone, overtimeStart }));

  for (const leave of leaves) {
    const start = Math.max(new Date(dayKey(leave.startDate)).getTime(), from.getTime());
    const end = Math.min(new Date(dayKey(leave.endDate)).getTime(), to.getTime());
    for (let t = start; t <= end; t += DAY_MS) {
      const d = dayKey(t);
      if (byDay.has(d)) continue;
      byDay.set(d, emptyDay(`LEAVE-${leave._id}-${d}`, d, 'leave', 'leave', {
        leaveType: leave.leaveType,
        leaveDuration: leave.duration || 'FULL_DAY',
      }));
    }
  }

  for (const h of holidays) {
    const d = dayKey(h.date);
    if (!byDay.has(d)) byDay.set(d, emptyDay(`HOLIDAY-${h._id}`, d, 'holiday', 'holiday', { holidayName: h.name }));
  }

  return {
    employee: {
      employeeCode: employee.employeeCode || '',
      name: `${employee.firstName} ${employee.lastName || ''}`.trim(),
    },
    timezone: timeZone,
    records: [...byDay.values()].sort((a, b) => a.date.localeCompare(b.date)),
  };
}
