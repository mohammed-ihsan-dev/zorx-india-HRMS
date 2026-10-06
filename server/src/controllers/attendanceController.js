import { Attendance } from '../models/Attendance.js';
import { OfficeSettings } from '../models/OfficeSettings.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { sendSuccess } from '../utils/ApiResponse.js';
import { ApiError } from '../utils/ApiError.js';
import * as attendanceService from '../services/attendanceService.js';
import { isValidCoordinate } from '../utils/geo.js';
import { getStartOfDayUTC } from '../utils/dateUtils.js';
import { env } from '../config/env.js';
import {
  VIRTUAL_EMPLOYEE_ID,
  isVirtualTestUserEnabled,
  getVirtualAttendanceSnapshot,
  setVirtualAttendanceSnapshot,
  resetVirtualAttendanceSnapshot,
} from '../utils/virtualTestUser.js';
import { ROLES, ATTENDANCE_STATUS, ATTENDANCE_MODE, BREAK_TYPE } from '../utils/constants.js';

function requireEmployee(req) {
  const employeeId = req.user.employeeId?._id;
  if (!employeeId) {
    throw ApiError.forbidden('Only employees can perform attendance actions.');
  }
  return employeeId;
}

// Super Admin is an administrative/monitoring role, not an attendance-punching
// employee — enforced server-side since frontend hiding of the buttons is not security.
function rejectSuperAdmin(req) {
  if (req.user.role === ROLES.SUPER_ADMIN) {
    throw ApiError.forbidden('Super Admin accounts do not record attendance.');
  }
}

function requireValidCoords(req) {
  const coords = req.body;
  if (!coords || !isValidCoordinate(coords.latitude, coords.longitude)) {
    throw ApiError.badRequest('Invalid location coordinates were received.');
  }
  return coords;
}

/**
 * The virtual test user has no real Employee document, so the normal
 * attendanceService persistence functions can never run for it. These
 * branches reuse every existing PURE validation/calculation function
 * (canCheckIn, calculateLateMinutes, deriveStatus, etc.) unchanged — only
 * the final write is replaced with an in-memory snapshot instead of
 * Attendance.create()/.save(). Real employees never take this branch.
 * Office-radius rejection is intentionally not enforced here (so testing
 * doesn't require being physically at the office); it remains fully
 * enforced for every real employee via attendanceService.validateLocation,
 * untouched below.
 */
const VIRTUAL_NOTE = ' (Virtual test account — not saved.)';

export const checkIn = asyncHandler(async (req, res) => {
  rejectSuperAdmin(req);

  if (req.user.isVirtualTestUser) {
    const officeSettings = await OfficeSettings.getSingleton();
    attendanceService.canCheckIn(getVirtualAttendanceSnapshot());
    const coords = requireValidCoords(req);
    const distance = attendanceService.calculateDistance(coords, officeSettings);
    const now = new Date();
    const lateMinutes = attendanceService.calculateLateMinutes(now, officeSettings);
    const snapshot = setVirtualAttendanceSnapshot({
      employeeId: VIRTUAL_EMPLOYEE_ID,
      date: getStartOfDayUTC(now, officeSettings.timezone),
      checkIn: { timestamp: now, latitude: coords.latitude, longitude: coords.longitude, distanceFromOffice: distance },
      checkOut: null,
      breaks: [],
      breakMinutes: 0,
      extraBreakMinutes: 0,
      totalWorkingMinutes: 0,
      status: lateMinutes > 0 ? ATTENDANCE_STATUS.LATE : ATTENDANCE_STATUS.PRESENT,
      lateMinutes,
      overtimeMinutes: 0,
    });
    return sendSuccess(res, { message: `Checked in successfully.${VIRTUAL_NOTE}`, data: snapshot });
  }

  const employeeId = requireEmployee(req);
  const attendance = await attendanceService.performCheckIn(employeeId, req.body);
  sendSuccess(res, { message: 'Checked in successfully.', data: attendance });
});

export const resetVirtualAttendance = asyncHandler(async (req, res) => {
  if (
    !isVirtualTestUserEnabled() ||
    !req.user?.isVirtualTestUser ||
    (env.testUser.email && req.user?.email?.toLowerCase() !== env.testUser.email.toLowerCase())
  ) {
    throw ApiError.forbidden('Only available for virtual test user.');
  }
  resetVirtualAttendanceSnapshot();
  sendSuccess(res, { message: 'Virtual test attendance reset successfully.', data: null });
});

export const checkOut = asyncHandler(async (req, res) => {
  rejectSuperAdmin(req);

  if (req.user.isVirtualTestUser) {
    const officeSettings = await OfficeSettings.getSingleton();
    const existing = getVirtualAttendanceSnapshot();
    attendanceService.canCheckOut(existing);
    const coords = requireValidCoords(req);
    const distance = attendanceService.calculateDistance(coords, officeSettings);
    const now = new Date();
    const breakMinutes = attendanceService.totalCompletedBreakMinutes(existing);
    const totalWorkingMinutes = attendanceService.calculateWorkingMinutes(existing.checkIn.timestamp, now, breakMinutes);
    const overtimeMinutes = attendanceService.calculateOvertime(totalWorkingMinutes, officeSettings);
    const status = attendanceService.deriveStatus(existing.lateMinutes, totalWorkingMinutes, officeSettings);
    const snapshot = setVirtualAttendanceSnapshot({
      ...existing,
      checkOut: { timestamp: now, latitude: coords.latitude, longitude: coords.longitude, distanceFromOffice: distance },
      breakMinutes,
      extraBreakMinutes: Math.max(0, breakMinutes - officeSettings.breakDurationMinutes),
      totalWorkingMinutes,
      overtimeMinutes,
      status,
    });
    return sendSuccess(res, { message: `Checked out successfully.${VIRTUAL_NOTE}`, data: snapshot });
  }

  const employeeId = requireEmployee(req);
  const attendance = await attendanceService.performCheckOut(employeeId, req.body);
  sendSuccess(res, { message: 'Checked out successfully.', data: attendance });
});

export const startBreak = asyncHandler(async (req, res) => {
  rejectSuperAdmin(req);

  if (req.user.isVirtualTestUser) {
    const existing = getVirtualAttendanceSnapshot();
    attendanceService.canStartBreak(existing);
    if (!Object.values(BREAK_TYPE).includes(req.body.type)) {
      throw ApiError.badRequest('Invalid break type.');
    }
    const now = new Date();
    const snapshot = setVirtualAttendanceSnapshot({
      ...existing,
      breaks: [...existing.breaks, { type: req.body.type, startTime: now, endTime: null, durationMinutes: 0 }],
    });
    return sendSuccess(res, { message: `Break started.${VIRTUAL_NOTE}`, data: snapshot });
  }

  const employeeId = requireEmployee(req);
  const attendance = await attendanceService.performStartBreak(employeeId, req.body.type);
  sendSuccess(res, { message: 'Break started.', data: attendance });
});

export const endBreak = asyncHandler(async (req, res) => {
  rejectSuperAdmin(req);

  if (req.user.isVirtualTestUser) {
    const existing = getVirtualAttendanceSnapshot();
    attendanceService.canEndBreak(existing);
    const activeBreak = attendanceService.getActiveBreak(existing);
    const now = new Date();
    const updatedBreaks = existing.breaks.map((b) =>
      b === activeBreak
        ? { ...b, endTime: now, durationMinutes: Math.max(0, Math.round((now.getTime() - new Date(b.startTime).getTime()) / 60000)) }
        : b
    );
    const snapshot = setVirtualAttendanceSnapshot({
      ...existing,
      breaks: updatedBreaks,
      breakMinutes: attendanceService.totalCompletedBreakMinutes({ breaks: updatedBreaks }),
    });
    return sendSuccess(res, { message: `Break ended.${VIRTUAL_NOTE}`, data: snapshot });
  }

  const employeeId = requireEmployee(req);
  const attendance = await attendanceService.performEndBreak(employeeId);
  sendSuccess(res, { message: 'Break ended.', data: attendance });
});

export const getMyAttendanceToday = asyncHandler(async (req, res) => {
  if (req.user.isVirtualTestUser) {
    const officeSettings = await OfficeSettings.getSingleton();
    return sendSuccess(res, { data: { attendance: getVirtualAttendanceSnapshot(), officeSettings } });
  }

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
  const { employeeId, departmentId, from, to, status, mode, page = 1, limit = 50 } = req.query;

  const filter = {};
  if (employeeId) filter.employeeId = employeeId;
  if (status) filter.status = status;
  // Records predating attendanceMode have no value and count as OFFICE.
  if (mode === ATTENDANCE_MODE.WFH) filter.attendanceMode = ATTENDANCE_MODE.WFH;
  if (mode === ATTENDANCE_MODE.OFFICE) filter.attendanceMode = { $ne: ATTENDANCE_MODE.WFH };
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
