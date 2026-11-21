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
import { ATTENDANCE_STATUS, ATTENDANCE_MODE, ATTENDANCE_VERIFICATION_MODE, BREAK_TYPE } from '../utils/constants.js';
import { env } from '../config/env.js';
import { parseAllowlist, isIpAllowed } from '../utils/networkAllowlist.js';
import { resolveWfhSource, WFH_SOURCE, recurringWfhPolicyFor } from './wfhService.js';
import { overtimeForRecord, overtimeRuleFor } from './overtimeService.js';
import { approvedOnsiteFor } from './onsiteWorkService.js';

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

/** The Admin-selected verification mode; anything missing/unknown fails closed. */
export function getVerificationMode(officeSettings) {
  const mode = officeSettings?.attendanceVerificationMode ?? ATTENDANCE_VERIFICATION_MODE.GPS;
  if (!Object.values(ATTENDANCE_VERIFICATION_MODE).includes(mode)) {
    throw new ApiError(503, 'The attendance verification setting is invalid. Please contact HR/Admin.');
  }
  return mode;
}

/**
 * Company Wi-Fi check: the request's source IP — derived by Express from the
 * trusted proxy chain (TRUST_PROXY), never from anything the client sends —
 * must be inside the server-side allowlist. Misconfiguration fails closed.
 */
export function verifyCompanyNetwork(clientIp) {
  const allowlist = parseAllowlist(env.attendanceNetwork.allowedIps);
  if (!allowlist.ok) {
    throw new ApiError(503, 'Company Wi-Fi attendance is not configured correctly. Please contact HR/Admin.');
  }
  if (!isIpAllowed(clientIp, allowlist)) {
    throw ApiError.forbidden('Your company network could not be verified. Please connect to the office Wi-Fi and try again.');
  }
}

/**
 * The single place attendance verification is decided, from trusted server
 * data only (never the request body):
 * - permanent WFH (Employee.workMode): no location or network check at all;
 * - Company Wi-Fi mode: office employees must come from the company network;
 *   approved-WFH employees (not in the office) skip it; no location is stored;
 * - GPS mode, APPROVED WFH for this day (request or recurring policy): no GPS
 *   needed and no office-radius check (coordinates kept only if sent);
 * - GPS mode otherwise: exactly validateLocation, as before.
 */
/**
 * The employee's own attendance site as office-settings-shaped rules for
 * validateLocation (same Haversine check, their own centre and radius), or
 * null when they use the main office.
 */
export function assignedLocationRules(employee) {
  const loc = employee?.attendanceLocation;
  if (!loc || loc.active === false || !isValidCoordinate(loc.latitude, loc.longitude) || !(loc.radiusMeters > 0)) return null;
  return { officeName: loc.name, latitude: loc.latitude, longitude: loc.longitude, attendanceRadius: loc.radiusMeters };
}

// `employee`: the signed-in employee's record already loaded for this request
// (req.user.employeeId) — used instead of re-reading it; read here only when absent.
const sameEmployee = (employee, employeeId) => Boolean(employee) && String(employee._id) === String(employeeId);
const loadAttendanceLocation = (employeeId, employee) =>
  sameEmployee(employee, employeeId) ? employee : Employee.findById(employeeId).select('attendanceLocation').lean();

async function resolvePunchLocation(employeeId, coords, officeSettings, dateKey, clientIp, employee = null, wfhSource = undefined) {
  // APPROVED Onsite Work for this exact day (eligible employees only): GPS is
  // still required and the real coordinates are recorded — only the assigned
  // site / office radius check is skipped. Pending, rejected or cancelled
  // requests, and approvals for other days, never reach this branch.
  if (await approvedOnsiteFor(employeeId, dateKey)) {
    if (!coords || !isValidCoordinate(coords.latitude, coords.longitude)) {
      throw ApiError.badRequest('Invalid location coordinates were received.');
    }
    const site = assignedLocationRules(await loadAttendanceLocation(employeeId, employee)) || officeSettings;
    const distanceFromOffice = calculateDistance(coords, site);
    return { isWfh: false, isOnsite: true, location: { latitude: coords.latitude, longitude: coords.longitude, distanceFromOffice } };
  }
  // Already decided for this request by the punch pre-check (attendanceRoutes), or look it up.
  const source = wfhSource !== undefined ? await wfhSource : await resolveWfhSource(employeeId, dateKey, { employee });
  if (source === WFH_SOURCE.DEFAULT) {
    return { isWfh: true, location: NO_LOCATION };
  }
  // An employee with their own active site is always GPS-checked against it
  // (never the main office, never the office Wi-Fi), on normal working days.
  const own = source ? null : assignedLocationRules(await loadAttendanceLocation(employeeId, employee));
  if (own) {
    const distanceFromOffice = validateLocation(coords, own);
    return { isWfh: false, location: { latitude: coords.latitude, longitude: coords.longitude, distanceFromOffice } };
  }
  if (getVerificationMode(officeSettings) === ATTENDANCE_VERIFICATION_MODE.WIFI) {
    if (!source) verifyCompanyNetwork(clientIp);
    return { isWfh: Boolean(source), location: NO_LOCATION };
  }
  if (!source) {
    const distanceFromOffice = validateLocation(coords, officeSettings);
    return { isWfh: false, location: { latitude: coords.latitude, longitude: coords.longitude, distanceFromOffice } };
  }
  // Approved WFH for this exact day (request or recurring policy), decided above from
  // server data only: no GPS is needed and no office geofence applies. If valid
  // coordinates happen to be sent they are kept for the record; otherwise none are stored.
  if (!coords || !isValidCoordinate(coords.latitude, coords.longitude)) {
    return { isWfh: true, location: NO_LOCATION };
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
async function lateRulesFor(employeeId, officeSettings, dateKey = null, loadedEmployee = null) {
  // A recurring WFH policy day uses that policy's scheduled start.
  const policy = recurringWfhPolicyFor(employeeId, dateKey);
  const employee = policy
    ? null
    : sameEmployee(loadedEmployee, employeeId)
      ? loadedEmployee
      : await Employee.findById(employeeId).select('workingStartTime').lean();
  const start = policy?.workingStartTime || employee?.workingStartTime;
  if (!start) return officeSettings;
  return { ...(officeSettings.toObject?.() ?? officeSettings), workingStartTime: start };
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

/**
 * The schedule that applies to one employee: their personal overrides where set,
 * otherwise the office's. Times are HH:mm in the office timezone.
 */
export function effectiveSchedule(employee, officeSettings) {
  const start = employee?.workingStartTime || officeSettings.workingStartTime;
  const end = employee?.workingEndTime || officeSettings.workingEndTime;
  const officeTarget = Math.max(0, parseTimeToMinutes(officeSettings.workingEndTime) - parseTimeToMinutes(officeSettings.workingStartTime) - (officeSettings.breakDurationMinutes || 0));
  return {
    workingStartTime: start,
    workingEndTime: end,
    dailyTargetMinutes: employee?.dailyTargetMinutes || officeTarget,
    // The overtime rule's pair: counted from `overtimeStartTime` once check-out passes `overtimeCutoffTime`.
    overtimeCutoffTime: overtimeRuleFor(employee).threshold,
    overtimeStartTime: overtimeRuleFor(employee).start,
    personal: Boolean(employee?.workingStartTime || employee?.workingEndTime || employee?.dailyTargetMinutes || employee?.overtimeCutoffTime),
  };
}


export function deriveStatus(lateMinutes, totalWorkingMinutes, officeSettings) {
  if (totalWorkingMinutes > 0 && totalWorkingMinutes < officeSettings.halfDayThresholdMinutes) {
    return ATTENDANCE_STATUS.HALF_DAY;
  }
  return lateMinutes > 0 ? ATTENDANCE_STATUS.LATE : ATTENDANCE_STATUS.PRESENT;
}

export async function performCheckIn(employeeId, coords, { clientIp, employee = null, wfhSource } = {}) {
  const officeSettings = await OfficeSettings.getSingleton();
  const now = new Date();
  const dateKey = getStartOfDayUTC(now, officeSettings.timezone);
  const [{ isWfh, isOnsite, location }, lateRules] = await Promise.all([
    resolvePunchLocation(employeeId, coords, officeSettings, dateKey, clientIp, employee, wfhSource),
    lateRulesFor(employeeId, officeSettings, dateKey, employee),
  ]);
  const attendanceMode = isOnsite ? ATTENDANCE_MODE.ONSITE : isWfh ? ATTENDANCE_MODE.WFH : ATTENDANCE_MODE.OFFICE;

  const lateMinutes = calculateLateMinutes(now, lateRules);
  const status = lateMinutes > 0 ? ATTENDANCE_STATUS.LATE : ATTENDANCE_STATUS.PRESENT;

  const checkInPunch = { timestamp: now, ...location };

  // One atomic write: creates today's record, or fills in a record that exists
  // without a check-in. If today already has a check-in the filter matches nothing,
  // the upsert collides with the unique (employeeId, date) index, and the request is
  // refused — so a double tap or a retried request can never record a second check-in.
  try {
    return await Attendance.findOneAndUpdate(
      { employeeId, date: dateKey, checkIn: null },
      { $set: { checkIn: checkInPunch, lateMinutes, status, attendanceMode } },
      { new: true, upsert: true, runValidators: true, setDefaultsOnInsert: true }
    );
  } catch (err) {
    if (err?.code === 11000) throw ApiError.conflict('You have already checked in today.');
    throw err;
  }
}

export async function performCheckOut(employeeId, coords, { clientIp, employee = null, wfhSource, attendanceToday } = {}) {
  const officeSettings = await OfficeSettings.getSingleton();
  const now = new Date();
  const dateKey = getStartOfDayUTC(now, officeSettings.timezone);
  // Independent reads in parallel; a location/network refusal is still reported first.
  const [{ isOnsite, location }, existing, personal] = await Promise.all([
    resolvePunchLocation(employeeId, coords, officeSettings, dateKey, clientIp, employee, wfhSource),
    attendanceToday || Attendance.findOne({ employeeId, date: dateKey }),
    sameEmployee(employee, employeeId) ? employee : Employee.findById(employeeId).select('workingEndTime overtimeCutoffTime').lean(),
  ]);
  canCheckOut(existing);

  // Effective working time is net of ACTUAL recorded break time, not the configured
  // allowance — the allowance is only used below to flag any excess.
  const breakMinutes = totalCompletedBreakMinutes(existing);
  const totalWorkingMinutes = calculateWorkingMinutes(existing.checkIn.timestamp, now, breakMinutes);
  // The app's one overtime rule (7 PM eligibility, counted from 6 PM; or the employee's own pair).
  const overtimeMinutes = overtimeForRecord({ date: existing.date, checkOut: { timestamp: now } }, personal, officeSettings) ?? 0;
  const status = deriveStatus(existing.lateMinutes, totalWorkingMinutes, officeSettings);

  // Atomic: only a record that is still checked in, with the same breaks we
  // computed from, is checked out — a duplicate request (double tap, a retry after
  // a lost response) can never overwrite the first check-out time.
  const updated = await Attendance.findOneAndUpdate(
    { _id: existing._id, checkOut: null, breaks: { $size: existing.breaks.length } },
    {
      $set: {
        checkOut: { timestamp: now, ...location },
        breakMinutes,
        extraBreakMinutes: Math.max(0, breakMinutes - officeSettings.breakDurationMinutes),
        totalWorkingMinutes,
        overtimeMinutes,
        status,
        // Approved after an in-office check-in: the day still counts as Onsite Work.
        ...(isOnsite ? { attendanceMode: ATTENDANCE_MODE.ONSITE } : {}),
      },
    },
    { new: true }
  );
  if (!updated) {
    const now2 = await Attendance.findById(existing._id);
    canCheckOut(now2); // the specific reason (already checked out / break started meanwhile)
    throw ApiError.conflict('Your attendance changed while checking out. Please try again.');
  }
  return updated;
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
