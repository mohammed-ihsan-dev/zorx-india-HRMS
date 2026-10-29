import { WorkFromHome } from '../models/WorkFromHome.js';
import { Employee } from '../models/Employee.js';
import { WFH_STATUS, WORK_MODE } from '../utils/constants.js';
import { RECURRING_WFH_POLICIES, RECURRING_WFH_RULE } from '../config/wfhPolicies.js';

export const WFH_SOURCE = Object.freeze({
  DEFAULT: 'DEFAULT_WFH',
  APPROVED_REQUEST: 'APPROVED_WFH',
  RECURRING_POLICY: 'RECURRING_WFH',
});

/** Second Saturday of its month (day 8–14), for a UTC-midnight day key. */
export function isSecondSaturday(dateKey) {
  const d = new Date(dateKey);
  return d.getUTCDay() === 6 && d.getUTCDate() >= 8 && d.getUTCDate() <= 14;
}

const RULE_MATCHES = { [RECURRING_WFH_RULE.SECOND_SATURDAY]: isSecondSaturday };

/** The recurring WFH policy that applies to this employee on this day, or null. */
export function recurringWfhPolicyFor(employeeId, dateKey, policies = RECURRING_WFH_POLICIES) {
  if (!employeeId || !dateKey) return null;
  const id = String(employeeId);
  return policies.find((p) => p.employeeId === id && RULE_MATCHES[p.rule]?.(dateKey)) || null;
}

/** The recurring rule configured for an employee at all (for the calendar), or null. */
export const recurringWfhRuleFor = (employeeId, policies = RECURRING_WFH_POLICIES) =>
  policies.find((p) => p.employeeId === String(employeeId))?.rule || null;

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
  // A recurring policy day behaves exactly like an approved WFH request for that day.
  if (recurringWfhPolicyFor(employeeId, dateKey)) return WFH_SOURCE.RECURRING_POLICY;
  const approved = await WorkFromHome.exists({ employeeId, date: dateKey, status: WFH_STATUS.APPROVED });
  return approved ? WFH_SOURCE.APPROVED_REQUEST : null;
}
