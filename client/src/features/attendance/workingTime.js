// Pure working-time math for the dashboard's Working Hours card. Mirrors the
// backend (attendanceService.calculateWorkingMinutes): net working time is
// check-in → check-out (or now) minus the ACTUAL recorded break time, never
// the configured allowance, so breaks are deducted exactly once.
import { parseTimeToMinutes } from '../../utils/formatters.js';

const toMs = (value) => {
  if (!value) return null;
  const ms = new Date(value).getTime();
  return Number.isFinite(ms) ? ms : null;
};

/** Minutes spent on recorded breaks; an open break counts up to `nowMs`. */
export function breakMinutesSoFar(breaks, nowMs) {
  let ms = 0;
  for (const b of breaks || []) {
    const start = toMs(b?.startTime);
    if (start === null) continue;
    const end = b.endTime ? toMs(b.endTime) : nowMs;
    if (end === null) continue;
    ms += Math.max(0, end - start);
  }
  return ms / 60000;
}

/**
 * Net working minutes for today's attendance record.
 * - No record / no check-in → 0.
 * - Checked out → the backend's stored totalWorkingMinutes (already net of breaks).
 * - Still checked in → elapsed since check-in minus breaks so far (incl. an active one).
 */
export function netWorkedMinutes(record, nowMs = Date.now()) {
  const checkInMs = toMs(record?.checkIn?.timestamp);
  if (checkInMs === null) return 0;

  if (record.checkOut) {
    if (Number.isFinite(record.totalWorkingMinutes)) return Math.max(0, record.totalWorkingMinutes);
    const checkOutMs = toMs(record.checkOut.timestamp);
    if (checkOutMs === null) return 0;
    return Math.max(0, (checkOutMs - checkInMs) / 60000 - breakMinutesSoFar(record.breaks, checkOutMs));
  }

  return Math.max(0, (nowMs - checkInMs) / 60000 - breakMinutesSoFar(record.breaks, nowMs));
}

/** Daily required net working time: office hours minus the break allowance (09:30–18:00, 60 min → 450). */
export function requiredWorkingMinutes(officeSettings) {
  if (!officeSettings) return null;
  const raw =
    parseTimeToMinutes(officeSettings.workingEndTime) -
    parseTimeToMinutes(officeSettings.workingStartTime) -
    (officeSettings.breakDurationMinutes || 0);
  return Number.isFinite(raw) ? Math.max(0, raw) : null;
}

/** Progress toward the target, clamped to 0–100. */
export function progressPercent(workedMinutes, requiredMinutes) {
  if (!requiredMinutes || !Number.isFinite(workedMinutes)) return 0;
  return Math.min(100, Math.max(0, (workedMinutes / requiredMinutes) * 100));
}

/** Minutes the zone `timeZone` is ahead of UTC at instant `ms` (e.g. Asia/Kolkata → 330). */
function zoneOffsetMinutes(timeZone, ms) {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat('en-US', { timeZone, hourCycle: 'h23', year: 'numeric', month: 'numeric', day: 'numeric', hour: 'numeric', minute: 'numeric' })
      .formatToParts(new Date(ms))
      .map((p) => [p.type, p.value])
  );
  return Math.round((Date.UTC(+parts.year, +parts.month - 1, +parts.day, +parts.hour % 24, +parts.minute) - ms) / 60000);
}

/**
 * An office-timezone "HH:mm" (how schedules are stored) shown in the viewer's
 * own timezone, as "hh:mm am" — 11:30 IST reads "10:00 am" on a phone in Dubai
 * and "11:30 am" in India. `localTimeZone` defaults to the device's.
 */
export function officeClockToLocal(hhmm, officeTimeZone = 'Asia/Kolkata', now = new Date(), localTimeZone = undefined) {
  const [h, m] = String(hhmm || '').split(':').map(Number);
  if (!Number.isFinite(h) || !Number.isFinite(m)) return '';
  const day = Object.fromEntries(
    new Intl.DateTimeFormat('en-US', { timeZone: officeTimeZone, year: 'numeric', month: 'numeric', day: 'numeric' }).formatToParts(now).map((p) => [p.type, p.value])
  );
  const guess = Date.UTC(+day.year, +day.month - 1, +day.day, h, m);
  const instant = guess - zoneOffsetMinutes(officeTimeZone, guess) * 60000;
  return new Date(instant)
    .toLocaleTimeString('en-US', { timeZone: localTimeZone, hour: '2-digit', minute: '2-digit', hour12: true })
    .toLowerCase();
}
