import { Attendance } from '../models/Attendance.js';
import { OfficeSettings } from '../models/OfficeSettings.js';
import { Employee } from '../models/Employee.js';
import { ApiError } from '../utils/ApiError.js';
import { haversineDistanceMeters, isValidCoordinate } from '../utils/geo.js';
import {
  getStartOfDayUTC,
  minutesSinceMidnight,
  parseTimeToMinutes,
} from '../utils/dateUtils.js';
import { ATTENDANCE_STATUS, ATTENDANCE_MODE, BREAK_TYPE } from '../utils/constants.js';
import { resolveWfhSource, WFH_SOURCE } from './wfhService.js';

/**
 * Distance in meters between a device coordinate and the configured office.
 */
export function calculateDistance(coords, officeSettings) {
  return haversineDistanceMeters(
    { latitude: coords.latitude, longitude: coords.longitude },
    { latitude: officeSettings.latitude, longitude: officeSettings.longitude }
  );
}

/**
 * Validates a device-reported coordinate against the office radius.
 * Throws ApiError if the coordinate is malformed or outside the allowed radius.
 * This is the backend's final authority — the frontend's own radius check is
 * only a UX convenience and must never be trusted on its own.
 */
export function validateLocation(coords, officeSettings) {
  if (!coords || !isValidCoordinate(coords.latitude, coords.longitude)) {
    throw ApiError.badRequest('Invalid location coordinates were received.');
  }

  const distance = calculateDistance(coords, officeSettings);

  if (distance > officeSettings.attendanceRadius) {
    throw ApiError.forbidden(
      `You are outside the ${officeSettings.officeName} attendance area. ` +
        `You are ${distance}m away; you must be within ${officeSettings.attendanceRadius}m.`
    );
  }

  return distance;
}

const NO_LOCATION = Object.freeze({ latitude: null, longitude: null, distanceFromOffice: null });

/**
 * The only place WFH changes attendance behavior, decided from trusted server
 * data only (never the request body):
 * - permanent WFH (Employee.workMode): no location is used or stored at all;
 * - APPROVED WFH request for this day: coordinates are still required and
 *   recorded, only the office-radius check is skipped;
 * - otherwise: exactly validateLocation, as before.
 */
async function resolvePunchLocation(employeeId, coords, officeSettings, dateKey) {
  const source = await resolveWfhSource(employeeId, dateKey);
  if (source === WFH_SOURCE.DEFAULT) {
    return { isWfh: true, location: NO_LOCATION };
  }
  if (!source) {
    const distanceFromOffice = validateLocation(coords, officeSettings);
    return { isWfh: false, location: { latitude: coords.latitude, longitude: coords.longitude, distanceFromOffice } };
  }
  if (!coords || !isValidCoordinate(coords.latitude, coords.longitude)) {
    throw ApiError.badRequest('Invalid location coordinates were received.');
  }
  const distanceFromOffice = calculateDistance(coords, officeSettings);
  return { isWfh: true, location: { latitude: coords.latitude, longitude: coords.longitude, distanceFromOffice } };
}

export async function getTodayAttendance(employeeId, referenceDate = new Date()) {
  const dateKey = getStartOfDayUTC(referenceDate);
  return Attendance.findOne({ employeeId, date: dateKey });
}

export function canCheckIn(existingAttendance) {
  if (existingAttendance?.checkIn) {
    throw ApiError.conflict('You have already checked in today.');
  }
}

export function getActiveBreak(existingAttendance) {
  if (!existingAttendance?.breaks?.length) return null;
  const last = existingAttendance.breaks[existingAttendance.breaks.length - 1];
  return last && !last.endTime ? last : null;
}

export function canCheckOut(existingAttendance) {
  if (!existingAttendance || !existingAttendance.checkIn) {
    throw ApiError.badRequest('You cannot check out before checking in.');
  }
  if (existingAttendance.checkOut) {
    throw ApiError.conflict('You have already checked out today.');
  }
  if (getActiveBreak(existingAttendance)) {
    throw ApiError.badRequest('Please end your current break before checking out.');
  }
}

export function canStartBreak(existingAttendance) {
  if (!existingAttendance || !existingAttendance.checkIn) {
    throw ApiError.badRequest('You must check in before starting a break.');
  }
  if (existingAttendance.checkOut) {
    throw ApiError.badRequest('You have already checked out for today.');
  }
  if (getActiveBreak(existingAttendance)) {
    throw ApiError.conflict('You already have an active break. Please end it before starting another.');
  }
}

export function canEndBreak(existingAttendance) {
  if (!existingAttendance || !getActiveBreak(existingAttendance)) {
    throw ApiError.badRequest('There is no active break to end.');
  }
}

/** Sum of completed break durations for the day, in minutes. */
export function totalCompletedBreakMinutes(attendance) {
  return (attendance.breaks || []).filter((b) => b.endTime).reduce((sum, b) => sum + b.durationMinutes, 0);
}

/**
 * Office settings for the late check only, with the employee's own official
 * check-in time (Employee.workingStartTime) in place of the office's when set.
 * The grace period, working hours, overtime and half-day rules stay the office's.
 */
async function lateRulesFor(employeeId, officeSettings) {
  const employee = await Employee.findById(employeeId).select('workingStartTime').lean();
  if (!employee?.workingStartTime) return officeSettings;
  return { ...(officeSettings.toObject?.() ?? officeSettings), workingStartTime: employee.workingStartTime };
}

/** Minutes late relative to the configured working start time, 0 if on time. */
export function calculateLateMinutes(checkInTime, officeSettings) {
  const startMinutes = parseTimeToMinutes(officeSettings.workingStartTime);
  const checkInMinutes = minutesSinceMidnight(checkInTime, officeSettings.timezone);
  const diff = checkInMinutes - startMinutes - officeSettings.lateThresholdMinutes;
  return diff > 0 ? diff : 0;
}

/** Effective working minutes between check-in and check-out, net of break time. */
export function calculateWorkingMinutes(checkInTime, checkOutTime, breakMinutes) {
  const rawMinutes = Math.max(0, (checkOutTime.getTime() - checkInTime.getTime()) / 60000);
  return Math.max(0, Math.round(rawMinutes - breakMinutes));
}

export function calculateOvertime(totalWorkingMinutes, officeSettings) {
  if (!officeSettings.overtimeEnabled) return 0;
  const startMinutes = parseTimeToMinutes(officeSettings.workingStartTime);
  const endMinutes = parseTimeToMinutes(officeSettings.workingEndTime);
  const expectedMinutes = Math.max(0, endMinutes - startMinutes - officeSettings.breakDurationMinutes);
  const overtime = totalWorkingMinutes - expectedMinutes;
  return overtime > 0 ? Math.round(overtime) : 0;
}

export function deriveStatus(lateMinutes, totalWorkingMinutes, officeSettings) {
  if (totalWorkingMinutes > 0 && totalWorkingMinutes < officeSettings.halfDayThresholdMinutes) {
    return ATTENDANCE_STATUS.HALF_DAY;
  }
  return lateMinutes > 0 ? ATTENDANCE_STATUS.LATE : ATTENDANCE_STATUS.PRESENT;
}

export async function performCheckIn(employeeId, coords) {
  const officeSettings = await OfficeSettings.getSingleton();
  const now = new Date();
  const dateKey = getStartOfDayUTC(now, officeSettings.timezone);
  const { isWfh, location } = await resolvePunchLocation(employeeId, coords, officeSettings, dateKey);
  const attendanceMode = isWfh ? ATTENDANCE_MODE.WFH : ATTENDANCE_MODE.OFFICE;

  const existing = await Attendance.findOne({ employeeId, date: dateKey });
  canCheckIn(existing);

  const lateMinutes = calculateLateMinutes(now, await lateRulesFor(employeeId, officeSettings));
  const status = lateMinutes > 0 ? ATTENDANCE_STATUS.LATE : ATTENDANCE_STATUS.PRESENT;

  const checkInPunch = { timestamp: now, ...location };

  if (existing) {
    existing.checkIn = checkInPunch;
    existing.lateMinutes = lateMinutes;
    existing.status = status;
    existing.attendanceMode = attendanceMode;
    await existing.save();
    return existing;
  }

  return Attendance.create({
    employeeId,
    date: dateKey,
    checkIn: checkInPunch,
    lateMinutes,
    status,
    attendanceMode,
  });
}

export async function performCheckOut(employeeId, coords) {
  const officeSettings = await OfficeSettings.getSingleton();
  const now = new Date();
  const dateKey = getStartOfDayUTC(now, officeSettings.timezone);
  const { location } = await resolvePunchLocation(employeeId, coords, officeSettings, dateKey);

  const existing = await Attendance.findOne({ employeeId, date: dateKey });
  canCheckOut(existing);

  // Effective working time is net of ACTUAL recorded break time, not the configured
  // allowance — the allowance is only used below to flag any excess.
  const breakMinutes = totalCompletedBreakMinutes(existing);
  const totalWorkingMinutes = calculateWorkingMinutes(existing.checkIn.timestamp, now, breakMinutes);
  const overtimeMinutes = calculateOvertime(totalWorkingMinutes, officeSettings);
  const status = deriveStatus(existing.lateMinutes, totalWorkingMinutes, officeSettings);

  existing.checkOut = { timestamp: now, ...location };
  existing.breakMinutes = breakMinutes;
  existing.extraBreakMinutes = Math.max(0, breakMinutes - officeSettings.breakDurationMinutes);
  existing.totalWorkingMinutes = totalWorkingMinutes;
  existing.overtimeMinutes = overtimeMinutes;
  existing.status = status;

  await existing.save();
  return existing;
}

export async function performStartBreak(employeeId, breakType) {
  if (!Object.values(BREAK_TYPE).includes(breakType)) {
    throw ApiError.badRequest('Invalid break type.');
  }

  const officeSettings = await OfficeSettings.getSingleton();
  const now = new Date();
  const dateKey = getStartOfDayUTC(now, officeSettings.timezone);

  // Atomic at the database level: the filter only matches a document with no active
  // break, so two near-simultaneous "start break" requests (e.g. a double-click) can
  // never both push a break — the second findOneAndUpdate simply matches nothing.
  const updated = await Attendance.findOneAndUpdate(
    {
      employeeId,
      date: dateKey,
      checkIn: { $ne: null },
      checkOut: null,
      $expr: {
        $or: [
          { $eq: [{ $size: '$breaks' }, 0] },
          { $ne: [{ $arrayElemAt: ['$breaks.endTime', -1] }, null] },
        ],
      },
    },
    { $push: { breaks: { type: breakType, startTime: now, endTime: null, durationMinutes: 0 } } },
    { new: true }
  );

  if (updated) return updated;

  // The atomic update matched nothing — re-fetch to report the precise reason why.
  const existing = await Attendance.findOne({ employeeId, date: dateKey });
  canStartBreak(existing);
  throw ApiError.badRequest('Could not start break. Please try again.');
}

export async function performEndBreak(employeeId) {
  const officeSettings = await OfficeSettings.getSingleton();
  const now = new Date();
  const dateKey = getStartOfDayUTC(now, officeSettings.timezone);

  const existing = await Attendance.findOne({ employeeId, date: dateKey });
  canEndBreak(existing);

  const activeBreak = getActiveBreak(existing);
  activeBreak.endTime = now;
  activeBreak.durationMinutes = Math.max(0, Math.round((now.getTime() - activeBreak.startTime.getTime()) / 60000));
  existing.breakMinutes = totalCompletedBreakMinutes(existing);

  await existing.save();
  return existing;
}
