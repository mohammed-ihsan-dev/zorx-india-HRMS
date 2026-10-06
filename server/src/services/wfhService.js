import { WorkFromHome } from '../models/WorkFromHome.js';
import { Employee } from '../models/Employee.js';
import { WFH_STATUS, WORK_MODE } from '../utils/constants.js';

export const WFH_SOURCE = Object.freeze({
  DEFAULT: 'DEFAULT_WFH',
  APPROVED_REQUEST: 'APPROVED_WFH',
});

/** "YYYY-MM-DD" -> the same UTC-midnight day key Attendance.date uses (see getStartOfDayUTC). */
export function dateKeyFromInput(value) {
  const [y, m, d] = value.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d));
}

export async function isDefaultWfhEmployee(employeeId) {
  if (!employeeId) return false;
  const match = await Employee.exists({ _id: employeeId, workMode: WORK_MODE.WFH });
  return Boolean(match);
}

/**
 * The single decision for whether a given day counts as WFH for an employee,
 * read only from trusted server-side data: the employee's own workMode, or an
 * APPROVED request for that exact day. Returns null for a normal office day.
 */
export async function resolveWfhSource(employeeId, dateKey) {
  if (!employeeId) return null;
  if (await isDefaultWfhEmployee(employeeId)) return WFH_SOURCE.DEFAULT;
  const approved = await WorkFromHome.exists({ employeeId, date: dateKey, status: WFH_STATUS.APPROVED });
  return approved ? WFH_SOURCE.APPROVED_REQUEST : null;
}
