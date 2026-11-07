// Attendance Report calendar: one employee's month, every day classified from
// existing data only (attendance records, leave requests, holidays, joining
// date). Read-only — no attendance record is ever created or changed.
//
// Rules reused, not re-invented:
//  - Late / Half Day: the status already stored on the attendance record
//    (attendanceService.deriveStatus with the office grace period & half-day threshold).
//  - Absence: the admin dashboard's rule (dashboardController) — an employee with no
//    check-in and no APPROVED leave, on a day that is not a company holiday, is absent.
//    Pending, rejected and cancelled leave never protect a day.
//  - Overtime: overtimeService.overtimeForRecord — the same value as the Salary Report.
import { env } from '../config/env.js';
import { overtimeForRecord } from './overtimeService.js';
import { buildMonthGrid, dayKeyOf, employeeDisplayName, formatClockTime, formatOvertime } from './salaryReportService.js';
import { LEAVE_DURATION, LEAVE_STATUS, LEAVE_TYPE } from '../utils/constants.js';
import { displayTimeZoneFor, timeZoneLabel } from '../config/employeeTimeZones.js';

// Weekly off. No setting exists in the app; Sunday is the only day nobody has
// ever checked in on (audited 2026-11-06) and the Salary calendar already shades it.
export const WEEKLY_OFF_DAYS = Object.freeze([0]);

/** The status shown in a day cell (drives the colour). */
export const DAY_STATUS = Object.freeze({
  PRESENT: 'PRESENT',
  LATE: 'LATE',
  HALF_DAY: 'HALF_DAY',
  SICK_LEAVE: 'SICK_LEAVE',
  CASUAL_LEAVE: 'CASUAL_LEAVE',
  PAID_LEAVE: 'PAID_LEAVE',
  OTHER_LEAVE: 'OTHER_LEAVE',
  ABSENT: 'ABSENT',
  HOLIDAY: 'HOLIDAY',
  WEEKLY_OFF: 'WEEKLY_OFF',
  NOT_EMPLOYED: 'NOT_EMPLOYED', // before the joining date
  TODAY: 'TODAY', // today, not finished yet, no check-in
  UPCOMING: 'UPCOMING',
});

const LEAVE_STATUS_BY_TYPE = {
  [LEAVE_TYPE.SICK]: DAY_STATUS.SICK_LEAVE,
  [LEAVE_TYPE.CASUAL]: DAY_STATUS.CASUAL_LEAVE,
  [LEAVE_TYPE.PAID]: DAY_STATUS.PAID_LEAVE,
};
export const DAY_LABEL = {
  PRESENT: 'Present',
  LATE: 'Late',
  HALF_DAY: 'Half Day',
  SICK_LEAVE: 'Sick Leave',
  CASUAL_LEAVE: 'Casual Leave',
  PAID_LEAVE: 'Paid Leave',
  OTHER_LEAVE: 'Leave',
  ABSENT: 'Absent',
  HOLIDAY: 'Holiday',
  WEEKLY_OFF: 'Weekly off',
  NOT_EMPLOYED: 'Not yet joined',
  TODAY: 'Today',
  UPCOMING: '',
};

const keyOf = (value) => new Date(value).toISOString().slice(0, 10);
const covers = (leave, dateKey) => keyOf(leave.startDate) <= dateKey && dateKey <= keyOf(leave.endDate);

/**
 * The one classification for a day, in the required priority:
 *   1. approved leave (Sick / Casual / Paid / other)
 *   2. absent (completed working day, employed, no check-in, no approved leave, not a holiday / weekly off)
 *   3. half day  4. late  5. present (from the stored attendance status)
 * Never invents data: a full-day approved leave that also has a check-in is
 * shown as the leave but flagged `conflict` so HR can review it.
 */
export function classifyDay({ dateKey, weekday, holiday, record, leaves = [], joiningKey = null, todayKey }) {
  const approved = leaves.find((l) => l.status === LEAVE_STATUS.APPROVED && covers(l, dateKey));
  const pending = leaves.find((l) => l.status === LEAVE_STATUS.PENDING && covers(l, dateKey));
  const checkedIn = Boolean(record?.checkIn?.timestamp);

  if (approved) {
    const status = LEAVE_STATUS_BY_TYPE[approved.leaveType] || DAY_STATUS.OTHER_LEAVE;
    const halfDay = approved.duration === LEAVE_DURATION.HALF_DAY;
    return { status, leaveHalfDay: halfDay, conflict: checkedIn && !halfDay ? 'Attendance recorded on a full-day approved leave' : null };
  }
  if (checkedIn) {
    if (record.status === 'HALF_DAY') return { status: DAY_STATUS.HALF_DAY };
    if (record.status === 'LATE') return { status: DAY_STATUS.LATE };
    return { status: DAY_STATUS.PRESENT };
  }
  if (record?.status === 'ABSENT') return { status: DAY_STATUS.ABSENT, pendingLeave: Boolean(pending) };
  if (joiningKey && dateKey < joiningKey) return { status: DAY_STATUS.NOT_EMPLOYED };
  if (holiday) return { status: DAY_STATUS.HOLIDAY };
  if (WEEKLY_OFF_DAYS.includes(weekday)) return { status: DAY_STATUS.WEEKLY_OFF };
  if (dateKey > todayKey) return { status: DAY_STATUS.UPCOMING };
  // Today is not a completed working day until it is over (no cut-off exists in the app).
  if (dateKey === todayKey) return { status: DAY_STATUS.TODAY, pendingLeave: Boolean(pending) };
  return { status: DAY_STATUS.ABSENT, pendingLeave: Boolean(pending) };
}

/**
 * GET /reports/attendance-calendar payload: weeks of cells + a status summary.
 * `records` are this employee's attendance in the month; `leaves` overlap it.
 */
export function buildAttendanceCalendar({ range, employee, records = [], leaves = [], holidays = [], officeSettings = null, today = new Date(), timeZone = env.timezone }) {
  const byDay = new Map(records.map((r) => [keyOf(r.date), r]));
  const todayKey = dayKeyOf(today, timeZone);
  const clock = displayTimeZoneFor(employee, timeZone); // clock times only (e.g. Dubai); days and rules stay on office time
  const joiningKey = employee?.joiningDate ? keyOf(employee.joiningDate) : null;
  const summary = {};
  let totalOvertimeMinutes = 0;
  const weeks = buildMonthGrid(range, { holidays }, ({ day, dateKey, weekday, isSunday, holiday }) => {
    const record = byDay.get(dateKey);
    const day_ = classifyDay({ dateKey, weekday, holiday, record, leaves, joiningKey, todayKey });
    summary[day_.status] = (summary[day_.status] || 0) + 1;
    const cell = { day, dateKey, isSunday, holiday, ...day_, label: DAY_LABEL[day_.status] };
    if (record?.checkIn?.timestamp) {
      // Finalized overtime only: null without a recorded check-out (never a live estimate).
      const overtimeMinutes = overtimeForRecord(record, employee, officeSettings, timeZone);
      totalOvertimeMinutes += overtimeMinutes || 0;
      Object.assign(cell, {
        checkIn: formatClockTime(record.checkIn.timestamp, clock),
        checkOut: record.checkOut?.timestamp ? formatClockTime(record.checkOut.timestamp, clock) : null,
        overtimeMinutes,
        overtime: formatOvertime(overtimeMinutes),
        hasOvertime: overtimeMinutes > 0,
        onsite: record.attendanceMode === 'ONSITE',
        wfh: record.attendanceMode === 'WFH',
      });
    }
    return cell;
  });
  return {
    employeeId: employee?._id ? String(employee._id) : null,
    employeeName: employeeDisplayName(employee),
    employeeCode: employee?.employeeCode || '',
    monthLabel: range.label,
    timeZone: clock,
    timeZoneLabel: timeZoneLabel(clock, timeZone),
    weeks,
    summary,
    totalOvertimeMinutes,
    totalOvertime: formatOvertime(totalOvertimeMinutes),
  };
}
