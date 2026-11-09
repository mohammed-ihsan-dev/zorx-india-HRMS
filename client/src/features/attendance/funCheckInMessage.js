/**
 * One-off fun message (temporary): Aysha Hiba checked in by mistake on Sunday
 * 8 Nov 2026, so on Monday 9 Nov her first successful check-in gets a joke.
 * Decided from the SERVER's check-in record (its employee and its India-time
 * day), so no other user and no other day ever sees it. Inert after 9 Nov.
 */
const AYSHA_HIBA_EMPLOYEE_ID = '6ac4a5099df7babccffd6ef4';
const FUN_DAY = '2026-11-09';
export const FUN_CHECK_IN_MESSAGE = 'INN SUNDAY ALLALLO LLE 😊?';

export function funCheckInMessage(record) {
  if (!record?.checkIn?.timestamp || !record?.date) return null;
  const employeeId = String(record.employeeId?._id || record.employeeId || '');
  const dayKey = new Date(record.date).toISOString().slice(0, 10); // attendance day = UTC midnight of the India day
  return employeeId === AYSHA_HIBA_EMPLOYEE_ID && dayKey === FUN_DAY ? FUN_CHECK_IN_MESSAGE : null;
}
