import { env } from '../config/env.js';

/**
 * Returns { year, month, day, hour, minute, second } for a given Date,
 * as observed in the configured office timezone (default Asia/Kolkata).
 */
export function getZonedParts(date = new Date(), timeZone = env.timezone) {
  const formatter = new Intl.DateTimeFormat('en-US', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  });
  const parts = Object.fromEntries(formatter.formatToParts(date).map((p) => [p.type, p.value]));
  return {
    year: Number(parts.year),
    month: Number(parts.month),
    day: Number(parts.day),
    // "24" is returned by Intl for midnight in some environments; normalize to 0.
    hour: Number(parts.hour) % 24,
    minute: Number(parts.minute),
    second: Number(parts.second),
  };
}

/**
 * Midnight (00:00:00.000 UTC) representing the calendar date of `date`
 * as observed in the office timezone. Used as the stable "date" key for
 * an attendance record, regardless of what time the server runs in.
 */
export function getStartOfDayUTC(date = new Date(), timeZone = env.timezone) {
  const { year, month, day } = getZonedParts(date, timeZone);
  return new Date(Date.UTC(year, month - 1, day, 0, 0, 0, 0));
}

/** Minutes since local midnight, e.g. 09:45 -> 585. */
export function minutesSinceMidnight(date = new Date(), timeZone = env.timezone) {
  const { hour, minute } = getZonedParts(date, timeZone);
  return hour * 60 + minute;
}

/** Parses "HH:mm" into minutes since midnight. */
export function parseTimeToMinutes(hhmm) {
  const [h, m] = hhmm.split(':').map(Number);
  return h * 60 + m;
}

export function formatMinutesAsHM(totalMinutes) {
  const sign = totalMinutes < 0 ? '-' : '';
  const abs = Math.abs(Math.round(totalMinutes));
  const h = Math.floor(abs / 60);
  const m = abs % 60;
  return `${sign}${h}h ${m}m`;
}
