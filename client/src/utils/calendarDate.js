export const WEEKDAY_LABELS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
export const MONTH_LABELS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

/**
 * Leave dates are created from plain "YYYY-MM-DD" <input type="date"> values,
 * which JS parses as UTC midnight. Extracting the UTC Y/M/D back out (rather
 * than local Y/M/D) recovers exactly the calendar date the user picked,
 * regardless of the viewer's own timezone offset.
 */
export function utcYMD(dateLike) {
  const d = new Date(dateLike);
  return { y: d.getUTCFullYear(), m: d.getUTCMonth(), d: d.getUTCDate() };
}

/** Integer day number (days since epoch) for a Y/M/D triple — safe for range comparisons. */
export function dayNumber(y, m, d) {
  return Math.floor(Date.UTC(y, m, d) / 86400000);
}

export function isSameDay(y1, m1, d1, y2, m2, d2) {
  return dayNumber(y1, m1, d1) === dayNumber(y2, m2, d2);
}

/**
 * Builds a Sunday-first calendar grid for the given month.
 * Returns an array of week-rows, each a 7-element array of cells that are
 * either null (padding before day 1 / after the last day) or
 * { year, month, day }.
 */
export function buildMonthGrid(year, month) {
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const firstWeekday = new Date(year, month, 1).getDay(); // 0 = Sunday

  const cells = [];
  for (let i = 0; i < firstWeekday; i += 1) cells.push(null);
  for (let day = 1; day <= daysInMonth; day += 1) cells.push({ year, month, day });
  while (cells.length % 7 !== 0) cells.push(null);

  const weeks = [];
  for (let i = 0; i < cells.length; i += 7) weeks.push(cells.slice(i, i + 7));
  return weeks;
}

/** "YYYY-MM-DD" for a local Y/M/D triple, suitable for an <input type="date"> value. */
export function toDateInputValue(year, month, day) {
  const mm = String(month + 1).padStart(2, '0');
  const dd = String(day).padStart(2, '0');
  return `${year}-${mm}-${dd}`;
}

/** Inclusive day count between two "YYYY-MM-DD" strings, using the same UTC-midnight logic as the backend. */
export function countDaysInclusive(startValue, endValue) {
  if (!startValue || !endValue) return 0;
  const start = utcYMD(startValue);
  const end = utcYMD(endValue);
  const diff = dayNumber(end.y, end.m, end.d) - dayNumber(start.y, start.m, start.d) + 1;
  return diff >= 1 ? diff : 0;
}
