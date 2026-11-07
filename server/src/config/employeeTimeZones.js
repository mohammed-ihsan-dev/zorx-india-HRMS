// Employees whose attendance times are SHOWN in another time zone on the
// admin side and in reports, by immutable Employee _id (never by name).
// Display only: attendance is still stored as exact instants, attendance days
// and every rule (late, overtime, schedule) keep using the office time zone.
import { env } from './env.js';

export const EMPLOYEE_DISPLAY_TIME_ZONES = Object.freeze({
  // MUHAMMED RIFAN (rifan@zorxmedia.com), UAE office — HR request 2026-11-07.
  '6adf17303c9ddd5f303eef7a': 'Asia/Dubai',
});

const LABELS = { 'Asia/Dubai': 'Dubai time', 'Asia/Kolkata': 'India time' };

/** The time zone to show this employee's clock times in (the office zone unless configured). */
export function displayTimeZoneFor(employeeId, fallback = env.timezone) {
  return (employeeId && EMPLOYEE_DISPLAY_TIME_ZONES[String(employeeId?._id || employeeId)]) || fallback;
}

/** "Dubai time" for a non-office zone, else null (office times need no label). */
export function timeZoneLabel(timeZone, officeZone = env.timezone) {
  return timeZone && timeZone !== officeZone ? LABELS[timeZone] || timeZone : null;
}
