import { Attendance } from '../models/Attendance.js';
import { OfficeSettings } from '../models/OfficeSettings.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { sendSuccess } from '../utils/ApiResponse.js';
import { ApiError } from '../utils/ApiError.js';
import * as attendanceService from '../services/attendanceService.js';

function requireEmployee(req) {
  const employeeId = req.user.employeeId?._id;
  if (!employeeId) {
    throw ApiError.forbidden('Only employees can perform attendance actions.');
  }
  return employeeId;
}

export const checkIn = asyncHandler(async (req, res) => {
  const employeeId = requireEmployee(req);
  const attendance = await attendanceService.performCheckIn(employeeId, req.body);
  sendSuccess(res, { message: 'Checked in successfully.', data: attendance });
});

export const checkOut = asyncHandler(async (req, res) => {
  const employeeId = requireEmployee(req);
  const attendance = await attendanceService.performCheckOut(employeeId, req.body);
  sendSuccess(res, { message: 'Checked out successfully.', data: attendance });
});

export const startBreak = asyncHandler(async (req, res) => {
  const employeeId = requireEmployee(req);
  const attendance = await attendanceService.performStartBreak(employeeId, req.body.type);
  sendSuccess(res, { message: 'Break started.', data: attendance });
});

export const endBreak = asyncHandler(async (req, res) => {
  const employeeId = requireEmployee(req);
  const attendance = await attendanceService.performEndBreak(employeeId);
  sendSuccess(res, { message: 'Break ended.', data: attendance });
});

export const getMyAttendanceToday = asyncHandler(async (req, res) => {
  const employeeId = requireEmployee(req);
  const [attendance, officeSettings] = await Promise.all([
    attendanceService.getTodayAttendance(employeeId),
    OfficeSettings.getSingleton(),
  ]);
  sendSuccess(res, { data: { attendance, officeSettings } });
});

export const getMyAttendanceHistory = asyncHandler(async (req, res) => {
  const employeeId = requireEmployee(req);
  const { from, to, status, page = 1, limit = 31 } = req.query;

  const filter = { employeeId };
  if (from || to) {
    filter.date = {};
    if (from) filter.date.$gte = new Date(from);
    if (to) filter.date.$lte = new Date(to);
  }
  if (status) filter.status = status;

  const pageNum = Number(page) || 1;
  const limitNum = Number(limit) || 31;

  const [records, total] = await Promise.all([
    Attendance.find(filter)
      .sort({ date: -1 })
      .skip((pageNum - 1) * limitNum)
      .limit(limitNum),
    Attendance.countDocuments(filter),
  ]);

  sendSuccess(res, { data: records, meta: { total, page: pageNum, limit: limitNum } });
});

export const listAttendance = asyncHandler(async (req, res) => {
  const { employeeId, departmentId, from, to, status, page = 1, limit = 50 } = req.query;

  const filter = {};
  if (employeeId) filter.employeeId = employeeId;
  if (status) filter.status = status;
  if (from || to) {
    filter.date = {};
    if (from) filter.date.$gte = new Date(from);
    if (to) filter.date.$lte = new Date(to);
  }

  const pageNum = Number(page) || 1;
  const limitNum = Number(limit) || 50;

  let query = Attendance.find(filter)
    .populate({
      path: 'employeeId',
      select: 'firstName lastName employeeCode departmentId',
      populate: { path: 'departmentId', select: 'name' },
    })
    .sort({ date: -1 })
    .skip((pageNum - 1) * limitNum)
    .limit(limitNum);

  let records = await query;

  if (departmentId) {
    records = records.filter((r) => r.employeeId?.departmentId?._id?.toString() === departmentId);
  }

  const total = await Attendance.countDocuments(filter);

  sendSuccess(res, { data: records, meta: { total, page: pageNum, limit: limitNum } });
});

export const getEmployeeAttendance = asyncHandler(async (req, res) => {
  const { employeeId } = req.params;
  const records = await Attendance.find({ employeeId }).sort({ date: -1 }).limit(90);
  sendSuccess(res, { data: records });
});
