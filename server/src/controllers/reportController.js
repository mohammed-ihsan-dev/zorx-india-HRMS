import { Attendance } from '../models/Attendance.js';
import { Leave } from '../models/Leave.js';
import { Employee } from '../models/Employee.js';
import { Task } from '../models/Task.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { sendSuccess } from '../utils/ApiResponse.js';

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
  res.setHeader('Content-Type', 'text/csv');
  res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
  res.send(csv);
}

async function buildFilter({ from, to, employeeId, departmentId }, dateField = 'date') {
  const filter = {};
  if (employeeId) filter.employeeId = employeeId;
  if (from || to) {
    filter[dateField] = {};
    if (from) filter[dateField].$gte = new Date(from);
    if (to) filter[dateField].$lte = new Date(to);
  }
  if (departmentId) {
    const employeeIds = await Employee.find({ departmentId }).distinct('_id');
    filter.employeeId = filter.employeeId ? filter.employeeId : { $in: employeeIds };
  }
  return filter;
}

export const attendanceReport = asyncHandler(async (req, res) => {
  const filter = await buildFilter(req.query, 'date');
  const records = await Attendance.find(filter).populate('employeeId', 'firstName lastName employeeCode').sort({ date: -1 });

  const columns = [
    { label: 'Employee Code', value: (r) => r.employeeId?.employeeCode },
    { label: 'Employee Name', value: (r) => `${r.employeeId?.firstName} ${r.employeeId?.lastName}` },
    { label: 'Date', value: (r) => r.date.toISOString().slice(0, 10) },
    { label: 'Check In', value: (r) => (r.checkIn ? r.checkIn.timestamp.toISOString() : '') },
    { label: 'Check Out', value: (r) => (r.checkOut ? r.checkOut.timestamp.toISOString() : '') },
    { label: 'Working Minutes', value: (r) => r.totalWorkingMinutes },
    { label: 'Total Break Minutes', value: (r) => r.breakMinutes },
    { label: 'Extra Break Minutes', value: (r) => r.extraBreakMinutes },
    { label: 'Late Minutes', value: (r) => r.lateMinutes },
    { label: 'Overtime Minutes', value: (r) => r.overtimeMinutes },
    { label: 'Status', value: (r) => r.status },
  ];

  if (req.query.format === 'csv') {
    return sendCsv(res, 'attendance-report.csv', toCsv(records, columns));
  }
  sendSuccess(res, { data: records });
});

export const leaveReport = asyncHandler(async (req, res) => {
  const filter = await buildFilter(req.query, 'startDate');
  const records = await Leave.find(filter).populate('employeeId', 'firstName lastName employeeCode').sort({ startDate: -1 });

  const columns = [
    { label: 'Employee Code', value: (r) => r.employeeId?.employeeCode },
    { label: 'Employee Name', value: (r) => `${r.employeeId?.firstName} ${r.employeeId?.lastName}` },
    { label: 'Leave Type', value: (r) => r.leaveType },
    { label: 'Start Date', value: (r) => r.startDate.toISOString().slice(0, 10) },
    { label: 'End Date', value: (r) => r.endDate.toISOString().slice(0, 10) },
    { label: 'Days', value: (r) => r.days },
    { label: 'Status', value: (r) => r.status },
    { label: 'Reason', value: (r) => r.reason },
  ];

  if (req.query.format === 'csv') {
    return sendCsv(res, 'leave-report.csv', toCsv(records, columns));
  }
  sendSuccess(res, { data: records });
});

export const employeeReport = asyncHandler(async (req, res) => {
  const filter = {};
  if (req.query.departmentId) filter.departmentId = req.query.departmentId;
  if (req.query.status) filter.status = req.query.status;

  const records = await Employee.find(filter).populate('departmentId', 'name').sort({ employeeCode: 1 });

  const columns = [
    { label: 'Employee Code', value: (r) => r.employeeCode },
    { label: 'Name', value: (r) => `${r.firstName} ${r.lastName}` },
    { label: 'Department', value: (r) => r.departmentId?.name || '' },
    { label: 'Designation', value: (r) => r.designation },
    { label: 'Joining Date', value: (r) => r.joiningDate.toISOString().slice(0, 10) },
    { label: 'Employment Type', value: (r) => r.employmentType },
    { label: 'Status', value: (r) => r.status },
  ];

  if (req.query.format === 'csv') {
    return sendCsv(res, 'employee-report.csv', toCsv(records, columns));
  }
  sendSuccess(res, { data: records });
});

export const taskReport = asyncHandler(async (req, res) => {
  const filter = {};
  if (req.query.status) filter.status = req.query.status;
  if (req.query.employeeId) filter.assignedTo = req.query.employeeId;

  const records = await Task.find(filter).populate('assignedTo', 'firstName lastName employeeCode').sort({ createdAt: -1 });

  const columns = [
    { label: 'Title', value: (r) => r.title },
    { label: 'Assigned To', value: (r) => `${r.assignedTo?.firstName} ${r.assignedTo?.lastName}` },
    { label: 'Priority', value: (r) => r.priority },
    { label: 'Status', value: (r) => r.status },
    { label: 'Due Date', value: (r) => (r.dueDate ? r.dueDate.toISOString().slice(0, 10) : '') },
  ];

  if (req.query.format === 'csv') {
    return sendCsv(res, 'task-report.csv', toCsv(records, columns));
  }
  sendSuccess(res, { data: records });
});
