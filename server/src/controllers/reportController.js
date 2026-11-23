import mongoose from 'mongoose';
import { Attendance } from '../models/Attendance.js';
import { Leave } from '../models/Leave.js';
import { Employee } from '../models/Employee.js';
import { User } from '../models/User.js';
import { Task } from '../models/Task.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { sendSuccess } from '../utils/ApiResponse.js';
import { getZonedParts } from '../utils/dateUtils.js';
import { ApiError } from '../utils/ApiError.js';
import { env } from '../config/env.js';
import { buildCalendarPdf } from '../utils/simplePdf.js';
import { buildSalaryRows, buildCalendarMonth, monthRange, employeeDisplayName, slugify, SALARY_COLUMNS } from '../services/salaryReportService.js';
import { overtimeForRecord, OVERTIME_THRESHOLD, OVERTIME_START } from '../services/overtimeService.js';
import { buildAttendanceCalendar } from '../services/attendanceCalendarService.js';
import { displayTimeZoneFor, timeZoneLabel } from '../config/employeeTimeZones.js';
import { OfficeSettings } from '../models/OfficeSettings.js';
import { Holiday } from '../models/Holiday.js';
import { ROLES, LEAVE_STATUS, LEAVE_TYPE, LEAVE_TYPE_LABEL, LEAVE_DURATION } from '../utils/constants.js';
import { getLeaveSummary } from '../services/leaveService.js';
import {
  resolveLeavePeriod,
  parseDayKey,
  leaveTypeCondition,
  daysInPeriod,
  summarizeTaken,
  sickBalanceFrom,
  csvCell,
} from '../services/leaveReportService.js';

function toCsv(rows, columns) {
  const header = columns.map((c) => c.label).join(',');
  const escape = (value) => {
    const str = value === null || value === undefined ? '' : String(value);
    return /[",\n]/.test(str) ? `"${str.replace(/"/g, '""')}"` : str;
  };
  const lines = rows.map((row) => columns.map((c) => escape(c.value(row))).join(','));
  return [header, ...lines].join('\n');
}

function sendCsv(res, filename, csv) {
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  // UTF-8 BOM so Excel (the primary consumer of exported CSVs) doesn't mangle non-ASCII text.
  res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
  res.send(`﻿${csv}`);
}

// Date-only field (e.g. Attendance.date, Employee.joiningDate) formatted as the
// office-timezone calendar date. These fields are always stored at local midnight,
// so a plain ISO slice already matches the intended calendar day.
function formatDateOnly(value) {
  if (!value) return '';
  return new Date(value).toISOString().slice(0, 10);
}

// Real point-in-time timestamps (check-in/out) must be shown in the office
// timezone, not raw UTC, or admins reading the CSV see the wrong clock time.
function formatIstTimestamp(value, timeZone = env.timezone) {
  if (!value) return '';
  const { year, month, day, hour, minute, second } = getZonedParts(new Date(value), timeZone);
  const pad = (n) => String(n).padStart(2, '0');
  return `${year}-${pad(month)}-${pad(day)} ${pad(hour)}:${pad(minute)}:${pad(second)}`;
}

function rangeSuffix(from, to) {
  if (!from && !to) return '';
  const fromStr = from ? formatDateOnly(from) : 'start';
  const toStr = to ? formatDateOnly(to) : 'today';
  return `-${fromStr}-to-${toStr}`;
}

async function departmentEmployeeIds(departmentId) {
  return Employee.find({ departmentId }).distinct('_id');
}

// Attendance.date is always stored as exact local-midnight UTC (see dateUtils.getStartOfDayUTC),
// and `from`/`to` arrive as "YYYY-MM-DD" strings which the Date constructor also parses as UTC
// midnight — so a plain inclusive $gte/$lte range lines up with the office-timezone calendar day
// with no off-by-one risk.
async function buildAttendanceFilter({ from, to, employeeId, departmentId }) {
  const filter = {};
  if (employeeId) filter.employeeId = employeeId;
  if (from || to) {
    filter.date = {};
    if (from) filter.date.$gte = new Date(from);
    if (to) filter.date.$lte = new Date(to);
  }
  if (departmentId) {
    const employeeIds = await departmentEmployeeIds(departmentId);
    filter.employeeId = filter.employeeId ? filter.employeeId : { $in: employeeIds };
  }
  return filter;
}

/** Legacy from/to (no `period`): "YYYY-MM-DD" or any valid date; anything else is a 400, not a 500. */
function legacyDate(value, label) {
  if (!value) return null;
  const d = parseDayKey(value) || new Date(value);
  if (!Number.isFinite(d.getTime())) throw ApiError.badRequest(`Invalid ${label}.`);
  return d;
}

/**
 * Validated Leave Report query: the Mongo filter plus the reporting range.
 * A leave belongs to [from, to] iff it starts on/before `to` and ends on/after
 * `from` (so a multi-day leave that started before the range is included).
 * With `period` (current_month | previous_month | custom | all) the range is
 * resolved on the server in the HRMS timezone; without it, the legacy optional
 * from/to are used unchanged. `forStats`: the status filter is ignored (taken
 * totals are always APPROVED leave) and the period defaults to the current month.
 */
async function leaveReportQuery(query, { forStats = false } = {}) {
  const { employeeId, departmentId, status, leaveType, period } = query;
  if (employeeId && !mongoose.isValidObjectId(employeeId)) throw ApiError.badRequest('Invalid employee.');
  if (departmentId && !mongoose.isValidObjectId(departmentId)) throw ApiError.badRequest('Invalid department.');
  if (!forStats && status && !Object.values(LEAVE_STATUS).includes(status)) throw ApiError.badRequest('Invalid status filter.');
  if (leaveType && !Object.values(LEAVE_TYPE).includes(leaveType)) throw ApiError.badRequest('Invalid leave type filter.');

  const range =
    period || forStats
      ? resolveLeavePeriod({ period: period || undefined, from: query.from, to: query.to })
      : { period: null, from: legacyDate(query.from, 'start date'), to: legacyDate(query.to, 'end date'), label: null };

  const filter = {};
  if (employeeId) filter.employeeId = new mongoose.Types.ObjectId(employeeId);
  if (!forStats && status) filter.status = status;
  if (leaveType) filter.leaveType = leaveTypeCondition(leaveType);
  if (range.from) filter.endDate = { $gte: range.from };
  if (range.to) filter.startDate = { $lte: range.to };
  if (departmentId && !employeeId) filter.employeeId = { $in: await departmentEmployeeIds(departmentId) };
  return { filter, range };
}

/** Approved leave taken in the range (one query, projected; each record counted once). */
async function takenInRange(filter, range) {
  const approved = await Leave.find({ ...filter, status: LEAVE_STATUS.APPROVED })
    .select('leaveType status startDate endDate days duration')
    .lean();
  return summarizeTaken(approved, range.from, range.to);
}

const personName = (user) => {
  const e = user?.employeeId;
  const name = `${e?.firstName || ''} ${e?.lastName || ''}`.replace(/\s+/g, ' ').trim();
  return name || user?.email || null;
};
const leaveDurationText = (r) =>
  r.duration === LEAVE_DURATION.HALF_DAY ? `Half Day${r.halfDaySession ? ` (${r.halfDaySession.charAt(0)}${r.halfDaySession.slice(1).toLowerCase()})` : ''}` : 'Full Day';
const dayKeyString = (d) => (d ? d.toISOString().slice(0, 10) : null);

export const attendanceReport = asyncHandler(async (req, res) => {
  const { from, to } = req.query;
  const filter = await buildAttendanceFilter(req.query);
  const [records, officeSettings] = await Promise.all([
    Attendance.find(filter).populate('employeeId', 'firstName lastName employeeCode workingEndTime overtimeCutoffTime').sort({ date: -1 }),
    OfficeSettings.getSingleton(),
  ]);

  const columns = [
    { label: 'Employee Code', value: (r) => r.employeeId?.employeeCode },
    { label: 'Employee Name', value: (r) => `${r.employeeId?.firstName} ${r.employeeId?.lastName}` },
    { label: 'Date', value: (r) => formatDateOnly(r.date) },
    // Shown in the employee's display time zone (e.g. Dubai for the UAE office); see "Time Zone".
    { label: 'Check In', value: (r) => formatIstTimestamp(r.checkIn?.timestamp, displayTimeZoneFor(r.employeeId)) },
    { label: 'Check Out', value: (r) => formatIstTimestamp(r.checkOut?.timestamp, displayTimeZoneFor(r.employeeId)) },
    { label: 'Working Hours', value: (r) => (r.totalWorkingMinutes != null ? (r.totalWorkingMinutes / 60).toFixed(2) : '') },
    { label: 'Break Duration (min)', value: (r) => r.breakMinutes },
    { label: 'Extra Break (min)', value: (r) => r.extraBreakMinutes },
    { label: 'Late Minutes', value: (r) => r.lateMinutes },
    // Recalculated with the current overtime rule from the recorded check-out (not the stored value).
    { label: 'Overtime Minutes', value: (r) => overtimeForRecord(r, r.employeeId, officeSettings) ?? '' },
    { label: 'Status', value: (r) => r.status },
    { label: 'Work Mode', value: (r) => ({ WFH: 'WFH', ONSITE: 'Onsite Work' })[r.attendanceMode] || 'Office' },
    { label: 'Time Zone', value: (r) => timeZoneLabel(displayTimeZoneFor(r.employeeId)) || 'India time' },
  ];

  if (req.query.format === 'csv') {
    return sendCsv(res, `attendance-report${rangeSuffix(from, to)}.csv`, toCsv(records, columns));
  }
  sendSuccess(res, { data: records });
});

/**
 * GET /reports/leave — leave history (back office).
 * Filters: employeeId, departmentId, status, leaveType ('LOP' also matches PAID/UNPAID),
 * period (current_month | previous_month | custom + from/to | all) or legacy from/to.
 * `page` (+ `limit`, max 100) → one page and meta.total; without it, every match
 * (unchanged response for older callers). `format=csv` → every match plus a summary
 * of approved leave taken in the period (the same numbers as /reports/leave/stats).
 */
export const leaveReport = asyncHandler(async (req, res) => {
  const { filter, range } = await leaveReportQuery(req.query);
  const isCsv = req.query.format === 'csv';
  const paged = req.query.page !== undefined && !isCsv;
  const pageNum = Math.max(1, Number.parseInt(req.query.page, 10) || 1);
  const limitNum = Math.min(100, Math.max(1, Number.parseInt(req.query.limit, 10) || 10));

  let query = Leave.find(filter)
    .populate('employeeId', 'firstName lastName employeeCode')
    .populate({ path: 'reviewedBy', select: 'email employeeId', populate: { path: 'employeeId', select: 'firstName lastName' } })
    .sort({ startDate: -1, createdAt: -1 })
    .lean();
  if (paged) query = query.skip((pageNum - 1) * limitNum).limit(limitNum);
  const [records, total] = await Promise.all([query, paged ? Leave.countDocuments(filter) : null]);

  const rows = records.map((r) => ({
    ...r,
    // Days of this leave inside the reporting range (0.5 for a half day; part of a leave crossing the range edge).
    daysInPeriod: daysInPeriod(r, range.from, range.to),
    approvedByName: r.status === LEAVE_STATUS.APPROVED ? personName(r.reviewedBy) : null,
  }));

  if (isCsv) {
    // Same totals as the statistics cards (the history's status filter never changes "taken").
    const taken = await takenInRange(filter, range);
    let employeeLabel = 'All Employees';
    if (req.query.employeeId) {
      const e = await Employee.findById(req.query.employeeId).select('firstName lastName').lean();
      if (e) employeeLabel = employeeDisplayName(e);
    }
    const columns = [
      ['Employee Code', (r) => r.employeeId?.employeeCode || ''],
      ['Employee Name', (r) => employeeDisplayName(r.employeeId)],
      ['Leave Type', (r) => LEAVE_TYPE_LABEL[r.leaveType] || r.leaveType],
      ['Duration', (r) => leaveDurationText(r)],
      ['Start Date', (r) => formatDateOnly(r.startDate)],
      ['End Date', (r) => formatDateOnly(r.endDate)],
      ['Number of Days', (r) => r.days],
      ['Days In Period', (r) => r.daysInPeriod],
      ['Reason', (r) => r.reason],
      ['Status', (r) => r.status],
      ['Approved By', (r) => r.approvedByName || ''],
      ['Applied On', (r) => formatIstTimestamp(r.createdAt).slice(0, 10)],
      ['Reviewed Date', (r) => (r.reviewedAt ? formatIstTimestamp(r.reviewedAt).slice(0, 10) : '')],
    ];
    const lines = [columns.map(([label]) => csvCell(label)).join(','), ...rows.map((r) => columns.map(([, value]) => csvCell(value(r))).join(','))];
    const periodText = range.label || (range.from || range.to ? `${dayKeyString(range.from) || 'start'} to ${dayKeyString(range.to) || 'today'}` : 'All time');
    const summary = [
      ['Summary', ''],
      ['Employee', employeeLabel],
      ['Reporting Period', periodText],
      ['Casual Leave Taken (approved days)', taken.casual],
      ['Sick Leave Taken (approved days)', taken.sick],
      ['LoP Taken (approved days)', taken.lop],
      ...(taken.other ? [['Other Leave Taken (approved days)', taken.other]] : []),
      ['Total Leave Taken (approved days)', taken.total],
    ];
    lines.push('', ...summary.map(([k, v]) => `${csvCell(k)},${csvCell(v)}`));
    const who = req.query.employeeId && employeeLabel !== 'All Employees' ? `-${slugify(employeeLabel)}` : '';
    const when = range.period ? (range.from ? `-${dayKeyString(range.from)}-to-${dayKeyString(range.to)}` : '-all-time') : rangeSuffix(req.query.from, req.query.to);
    return sendCsv(res, `leave-report${who}${when}.csv`, lines.join('\n'));
  }

  const period = range.period ? { key: range.period, from: dayKeyString(range.from), to: dayKeyString(range.to), label: range.label } : undefined;
  if (paged) {
    return sendSuccess(res, { data: rows, meta: { total, page: pageNum, limit: limitNum, pages: Math.max(1, Math.ceil(total / limitNum)), period } });
  }
  sendSuccess(res, { data: rows, ...(period ? { meta: { total: rows.length, period } } : {}) });
});

/**
 * GET /reports/leave/stats — statistics cards (back office).
 * Taken totals: APPROVED leave only, clipped to the reporting period, half day = 0.5,
 * every record once; filters: employeeId, departmentId, leaveType, period (default
 * current month). With an employee: their Sick Leave balance from the existing leave
 * balance logic (leaveService.getLeaveSummary) — today's entitlement, not the period.
 */
export const leaveReportStats = asyncHandler(async (req, res) => {
  const { filter, range } = await leaveReportQuery(req.query, { forStats: true });
  const { employeeId } = req.query;
  const [taken, balance] = await Promise.all([
    takenInRange(filter, range),
    employeeId
      ? Employee.findById(employeeId)
          .select('firstName lastName employeeCode joiningDate status')
          .lean()
          .then(async (employee) => (employee ? { employee, summary: await getLeaveSummary(employee) } : null))
      : null,
  ]);
  if (employeeId && !balance) throw ApiError.notFound('Employee not found.');

  sendSuccess(res, {
    data: {
      period: { key: range.period, from: dayKeyString(range.from), to: dayKeyString(range.to), label: range.label },
      employee: balance
        ? { _id: balance.employee._id, name: employeeDisplayName(balance.employee), employeeCode: balance.employee.employeeCode || '', status: balance.employee.status }
        : null,
      taken,
      sickBalance: balance ? sickBalanceFrom(balance.summary.types[LEAVE_TYPE.SICK], balance.employee) : null,
    },
  });
});

export const employeeReport = asyncHandler(async (req, res) => {
  const { from, to, departmentId, status } = req.query;
  const filter = {};
  if (departmentId) filter.departmentId = departmentId;
  if (status) filter.status = status;
  // Joining-date range is optional — the report defaults to the full current
  // directory rather than forcing attendance-style date filtering onto it.
  if (from || to) {
    filter.joiningDate = {};
    if (from) filter.joiningDate.$gte = new Date(from);
    if (to) filter.joiningDate.$lte = new Date(to);
  }

  // Keep SUPER_ADMIN accounts out of the HR-facing directory export, matching
  // the existing employee directory listing's behavior.
  const superAdminUserIds = await User.find({ role: ROLES.SUPER_ADMIN }).distinct('_id');
  filter.userId = { $nin: superAdminUserIds };

  const records = await Employee.find(filter)
    .populate('departmentId', 'name')
    .populate('userId', 'email')
    .sort({ employeeCode: 1 });

  const columns = [
    { label: 'Employee Code', value: (r) => r.employeeCode },
    { label: 'Name', value: (r) => `${r.firstName} ${r.lastName}` },
    { label: 'Email', value: (r) => r.userId?.email || '' },
    { label: 'Phone', value: (r) => r.phone },
    { label: 'Designation', value: (r) => r.designation },
    { label: 'Department', value: (r) => r.departmentId?.name || '' },
    { label: 'Joining Date', value: (r) => formatDateOnly(r.joiningDate) },
    { label: 'Employment Type', value: (r) => r.employmentType },
    { label: 'Status', value: (r) => r.status },
  ];

  if (req.query.format === 'csv') {
    return sendCsv(res, `employee-report${rangeSuffix(from, to)}.csv`, toCsv(records, columns));
  }
  sendSuccess(res, { data: records });
});

export const taskReport = asyncHandler(async (req, res) => {
  const { from, to, status, employeeId } = req.query;
  const filter = {};
  if (status) filter.status = status;
  if (employeeId) filter.assignedTo = employeeId;
  if (from || to) {
    filter.dueDate = {};
    if (from) filter.dueDate.$gte = new Date(from);
    if (to) filter.dueDate.$lte = new Date(to);
  }

  const records = await Task.find(filter).populate('assignedTo', 'firstName lastName employeeCode').sort({ createdAt: -1 });

  const columns = [
    { label: 'Title', value: (r) => r.title },
    { label: 'Assigned To', value: (r) => `${r.assignedTo?.firstName} ${r.assignedTo?.lastName}` },
    { label: 'Priority', value: (r) => r.priority },
    { label: 'Status', value: (r) => r.status },
    { label: 'Due Date', value: (r) => formatDateOnly(r.dueDate) },
  ];

  if (req.query.format === 'csv') {
    return sendCsv(res, `task-report${rangeSuffix(from, to)}.csv`, toCsv(records, columns));
  }
  sendSuccess(res, { data: records });
});

/**
 * GET /reports/salary?month=YYYY-MM[&employeeId=...][&format=csv|pdf]
 * Back office only (router-level requireRole). Read-only. JSON: list rows plus a
 * monthly calendar per employee; CSV: the list; PDF: the calendar on A4
 * landscape, one page per employee. Overtime: overtimeService (7 PM / 6 PM rule).
 */
export const salaryReport = asyncHandler(async (req, res) => {
  const { employeeId, format } = req.query;
  const now = getZonedParts(new Date());
  const month = req.query.month || `${now.year}-${String(now.month).padStart(2, '0')}`;
  const range = monthRange(month);
  if (!range) throw ApiError.badRequest('Please choose a valid month (YYYY-MM).');
  if (format && !['csv', 'pdf'].includes(format)) throw ApiError.badRequest('Unsupported export format.');

  const EMPLOYEE_FIELDS = 'firstName lastName employeeCode workingEndTime overtimeCutoffTime';
  let employee = null;
  if (employeeId) {
    if (!mongoose.isValidObjectId(employeeId)) throw ApiError.badRequest('Invalid employee.');
    employee = await Employee.findById(employeeId).select(EMPLOYEE_FIELDS).lean();
    if (!employee) throw ApiError.notFound('Employee not found.');
  }

  const filter = { date: { $gte: range.start, $lt: range.end } };
  if (employee) filter.employeeId = employee._id;
  const [records, officeSettings, holidays] = await Promise.all([
    Attendance.find(filter).select('employeeId date status attendanceMode checkIn.timestamp checkOut.timestamp').populate('employeeId', EMPLOYEE_FIELDS).lean(),
    OfficeSettings.getSingleton(),
    Holiday.find({ date: { $gte: range.start, $lt: range.end } }).select('date name').lean(),
  ]);
  const rows = buildSalaryRows(records, officeSettings);
  const scope = employee ? employeeDisplayName(employee) : 'All Employees';

  // One calendar per employee: the chosen one (even with no records), or everyone with records.
  const byEmployee = new Map();
  for (const r of records) {
    if (!r.employeeId) continue;
    const key = String(r.employeeId._id);
    if (!byEmployee.has(key)) byEmployee.set(key, { employee: r.employeeId, records: [] });
    byEmployee.get(key).records.push(r);
  }
  if (employee && !byEmployee.has(String(employee._id))) byEmployee.set(String(employee._id), { employee, records: [] });
  const calendars = [...byEmployee.values()]
    .map(({ employee: e, records: rs }) => buildCalendarMonth({ range, records: rs, employee: e, holidays, officeSettings }))
    .sort((a, b) => a.employeeName.localeCompare(b.employeeName));

  if (!format) {
    return sendSuccess(res, {
      data: rows,
      // calendars: one monthly calendar per employee (see buildCalendarMonth).
      meta: { month, monthLabel: range.label, employee: scope, overtimeRule: { threshold: OVERTIME_THRESHOLD, start: OVERTIME_START }, total: rows.length, calendars },
    });
  }

  if (!rows.length) throw ApiError.notFound(`No attendance records for ${scope} in ${range.label}.`);
  const filename = `salary-report${employee ? `-${slugify(scope) || 'employee'}` : ''}-${month}`;

  if (format === 'csv') {
    return sendCsv(res, `${filename}.csv`, toCsv(rows, SALARY_COLUMNS));
  }

  const generated = formatIstTimestamp(new Date()).slice(0, 16);
  const pdf = buildCalendarPdf({
    brand: 'ZORX INDIA',
    title: 'Monthly Attendance Calendar',
    calendars: calendars.filter((c) => c.daysWithRecords > 0),
    lines: (cal) => [
      `Days with attendance records: ${cal.daysWithRecords}  ·  Total overtime: ${cal.totalOvertime}  ·  Generated: ${generated} (${env.timezone})${cal.timeZoneLabel ? `  ·  Check-in/out times in ${cal.timeZoneLabel}` : ''}`,
      `Overtime: check-out after 7:00 PM counts from 6:00 PM (company time; employee-specific times where HR set them). "No record" = no attendance that day.`,
    ],
    footer: 'ZORX INDIA · Salary Report · Attendance-based, not a payroll statement',
  });
  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `attachment; filename="${filename}.pdf"`);
  return res.send(pdf);
});

/**
 * GET /reports/attendance-calendar?employeeId=...&month=YYYY-MM
 * Back office only (router-level requireRole, same as every report). Read-only:
 * one employee's month with each day classified (attendanceCalendarService).
 * Loads only that employee's records for that month.
 */
export const attendanceCalendarReport = asyncHandler(async (req, res) => {
  const { employeeId } = req.query;
  const now = getZonedParts(new Date());
  const month = req.query.month || `${now.year}-${String(now.month).padStart(2, '0')}`;
  const range = monthRange(month);
  if (!range) throw ApiError.badRequest('Please choose a valid month (YYYY-MM).');
  if (!employeeId || !mongoose.isValidObjectId(employeeId)) throw ApiError.badRequest('Please choose an employee.');
  const employee = await Employee.findById(employeeId).select('firstName lastName employeeCode joiningDate status workingEndTime overtimeCutoffTime').lean();
  if (!employee) throw ApiError.notFound('Employee not found.');

  const lastDay = new Date(range.end.getTime() - 86400000);
  const [records, leaves, holidays, officeSettings] = await Promise.all([
    Attendance.find({ employeeId: employee._id, date: { $gte: range.start, $lt: range.end } })
      .select('date status attendanceMode checkIn.timestamp checkOut.timestamp')
      .lean(),
    Leave.find({ employeeId: employee._id, status: { $in: [LEAVE_STATUS.APPROVED, LEAVE_STATUS.PENDING] }, startDate: { $lte: lastDay }, endDate: { $gte: range.start } })
      .select('leaveType status startDate endDate duration')
      .lean(),
    Holiday.find({ date: { $gte: range.start, $lt: range.end } }).select('date name').lean(),
    OfficeSettings.getSingleton(),
  ]);
  const calendar = buildAttendanceCalendar({ range, employee, records, leaves, holidays, officeSettings });
  sendSuccess(res, { data: calendar, meta: { month, monthLabel: range.label } });
});
