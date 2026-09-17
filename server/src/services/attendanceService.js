import { Attendance } from '../models/Attendance.js';
import { OfficeSettings } from '../models/OfficeSettings.js';
import { ApiError } from '../utils/ApiError.js';
import { haversineDistanceMeters, isValidCoordinate } from '../utils/geo.js';
import {
  getStartOfDayUTC,
  minutesSinceMidnight,
  parseTimeToMinutes,
} from '../utils/dateUtils.js';
import { ATTENDANCE_STATUS, BREAK_TYPE } from '../utils/constants.js';

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

function deriveStatus(lateMinutes, totalWorkingMinutes, officeSettings) {
  if (totalWorkingMinutes > 0 && totalWorkingMinutes < officeSettings.halfDayThresholdMinutes) {
    return ATTENDANCE_STATUS.HALF_DAY;
  }
  return lateMinutes > 0 ? ATTENDANCE_STATUS.LATE : ATTENDANCE_STATUS.PRESENT;
}

export async function performCheckIn(employeeId, coords) {
  const officeSettings = await OfficeSettings.getSingleton();
  const distance = validateLocation(coords, officeSettings);

  const now = new Date();
  const dateKey = getStartOfDayUTC(now, officeSettings.timezone);

  const existing = await Attendance.findOne({ employeeId, date: dateKey });
  canCheckIn(existing);

  const lateMinutes = calculateLateMinutes(now, officeSettings);
  const status = lateMinutes > 0 ? ATTENDANCE_STATUS.LATE : ATTENDANCE_STATUS.PRESENT;

  const checkInPunch = {
    timestamp: now,
    latitude: coords.latitude,
    longitude: coords.longitude,
    distanceFromOffice: distance,
  };

  if (existing) {
    existing.checkIn = checkInPunch;
    existing.lateMinutes = lateMinutes;
    existing.status = status;
    await existing.save();
    return existing;
  }

  return Attendance.create({
    employeeId,
    date: dateKey,
    checkIn: checkInPunch,
    lateMinutes,
    status,
  });
}

export async function performCheckOut(employeeId, coords) {
  const officeSettings = await OfficeSettings.getSingleton();
  const distance = validateLocation(coords, officeSettings);

  const now = new Date();
  const dateKey = getStartOfDayUTC(now, officeSettings.timezone);

  const existing = await Attendance.findOne({ employeeId, date: dateKey });
  canCheckOut(existing);

  // Effective working time is net of ACTUAL recorded break time, not the configured
  // allowance — the allowance is only used below to flag any excess.
  const breakMinutes = totalCompletedBreakMinutes(existing);
  const totalWorkingMinutes = calculateWorkingMinutes(existing.checkIn.timestamp, now, breakMinutes);
  const overtimeMinutes = calculateOvertime(totalWorkingMinutes, officeSettings);
  const status = deriveStatus(existing.lateMinutes, totalWorkingMinutes, officeSettings);

  existing.checkOut = {
    timestamp: now,
    latitude: coords.latitude,
    longitude: coords.longitude,
    distanceFromOffice: distance,
  };
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

  await existing.save();
  return existing;
}
