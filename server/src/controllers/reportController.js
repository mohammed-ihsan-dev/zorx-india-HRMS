import { Attendance } from '../models/Attendance.js';
import { Leave } from '../models/Leave.js';
import { Employee } from '../models/Employee.js';
import { User } from '../models/User.js';
import { Task } from '../models/Task.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { sendSuccess } from '../utils/ApiResponse.js';
import { getZonedParts } from '../utils/dateUtils.js';
import { ROLES } from '../utils/constants.js';

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
function formatIstTimestamp(value) {
  if (!value) return '';
  const { year, month, day, hour, minute, second } = getZonedParts(new Date(value));
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

// A leave overlaps the requested [from, to] window iff it starts on/before `to`
// and ends on/after `from` — comparing only startDate (the previous behavior)
// missed any multi-day leave that started before the selected range.
async function buildLeaveFilter({ from, to, employeeId, departmentId, status, leaveType }) {
  const filter = {};
  if (employeeId) filter.employeeId = employeeId;
  if (status) filter.status = status;
  if (leaveType) filter.leaveType = leaveType;
  if (from) filter.endDate = { $gte: new Date(from) };
  if (to) filter.startDate = { $lte: new Date(to) };
  if (departmentId) {
    const employeeIds = await departmentEmployeeIds(departmentId);
    filter.employeeId = filter.employeeId ? filter.employeeId : { $in: employeeIds };
  }
  return filter;
}

export const attendanceReport = asyncHandler(async (req, res) => {
  const { from, to } = req.query;
  const filter = await buildAttendanceFilter(req.query);
  const records = await Attendance.find(filter).populate('employeeId', 'firstName lastName employeeCode').sort({ date: -1 });

  const columns = [
    { label: 'Employee Code', value: (r) => r.employeeId?.employeeCode },
    { label: 'Employee Name', value: (r) => `${r.employeeId?.firstName} ${r.employeeId?.lastName}` },
    { label: 'Date', value: (r) => formatDateOnly(r.date) },
    { label: 'Check In', value: (r) => formatIstTimestamp(r.checkIn?.timestamp) },
    { label: 'Check Out', value: (r) => formatIstTimestamp(r.checkOut?.timestamp) },
    { label: 'Working Hours', value: (r) => (r.totalWorkingMinutes != null ? (r.totalWorkingMinutes / 60).toFixed(2) : '') },
    { label: 'Break Duration (min)', value: (r) => r.breakMinutes },
    { label: 'Extra Break (min)', value: (r) => r.extraBreakMinutes },
    { label: 'Late Minutes', value: (r) => r.lateMinutes },
    { label: 'Overtime Minutes', value: (r) => r.overtimeMinutes },
    { label: 'Status', value: (r) => r.status },
  ];

  if (req.query.format === 'csv') {
    return sendCsv(res, `attendance-report${rangeSuffix(from, to)}.csv`, toCsv(records, columns));
  }
  sendSuccess(res, { data: records });
});

export const leaveReport = asyncHandler(async (req, res) => {
  const { from, to } = req.query;
  const filter = await buildLeaveFilter(req.query);
  const records = await Leave.find(filter).populate('employeeId', 'firstName lastName employeeCode').sort({ startDate: -1 });

  const columns = [
    { label: 'Employee Code', value: (r) => r.employeeId?.employeeCode },
    { label: 'Employee Name', value: (r) => `${r.employeeId?.firstName} ${r.employeeId?.lastName}` },
    { label: 'Leave Type', value: (r) => r.leaveType },
    { label: 'Start Date', value: (r) => formatDateOnly(r.startDate) },
    { label: 'End Date', value: (r) => formatDateOnly(r.endDate) },
    { label: 'Number of Days', value: (r) => r.days },
    { label: 'Reason', value: (r) => r.reason },
    { label: 'Status', value: (r) => r.status },
    { label: 'Requested Date', value: (r) => formatDateOnly(r.createdAt) },
    { label: 'Reviewed Date', value: (r) => formatDateOnly(r.reviewedAt) },
  ];

  if (req.query.format === 'csv') {
    return sendCsv(res, `leave-report${rangeSuffix(from, to)}.csv`, toCsv(records, columns));
  }
  sendSuccess(res, { data: records });
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
