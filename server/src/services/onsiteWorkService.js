import { OnsiteWorkRequest } from '../models/OnsiteWorkRequest.js';
import { ONSITE_WORK_EMPLOYEE_IDS } from '../config/onsiteWorkPolicies.js';
import { ONSITE_STATUS } from '../utils/constants.js';

/** Whether this employee may use Onsite Work Requests at all (config/onsiteWorkPolicies.js). */
export function isOnsiteWorkEligible(employeeId, allowed = ONSITE_WORK_EMPLOYEE_IDS) {
  return Boolean(employeeId) && allowed.includes(String(employeeId));
}

/**
 * The APPROVED onsite request for this employee on this exact attendance day,
 * or null. The single decision used by check-in/check-out: pending, rejected
 * and cancelled requests — and approvals for any other day — never count.
 */
export async function approvedOnsiteFor(employeeId, dateKey) {
  if (!isOnsiteWorkEligible(employeeId) || !dateKey) return null;
  return OnsiteWorkRequest.findOne({ employeeId, date: dateKey, status: ONSITE_STATUS.APPROVED }).lean();
}
