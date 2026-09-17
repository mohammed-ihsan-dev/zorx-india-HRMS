import { LeaveBalance } from '../models/LeaveBalance.js';
import { Leave } from '../models/Leave.js';
import { LEAVE_TYPE, LEAVE_STATUS } from '../utils/constants.js';
import { ApiError } from '../utils/ApiError.js';

const DEFAULT_BALANCES = {
  [LEAVE_TYPE.CASUAL]: 0,
  [LEAVE_TYPE.SICK]: 1,
  [LEAVE_TYPE.EARNED]: 1,
};

export async function getOrCreateLeaveBalance(employeeId, year = new Date().getFullYear()) {
  let balance = await LeaveBalance.findOne({ employeeId, year });
  if (!balance) {
    balance = await LeaveBalance.create({
      employeeId,
      year,
      balances: DEFAULT_BALANCES,
      used: { [LEAVE_TYPE.CASUAL]: 0, [LEAVE_TYPE.SICK]: 0, [LEAVE_TYPE.EARNED]: 0 },
    });
  }
  return balance;
}

export function calculateLeaveDays(startDate, endDate) {
  const start = new Date(startDate);
  const end = new Date(endDate);
  const diffMs = end.setHours(0, 0, 0, 0) - start.setHours(0, 0, 0, 0);
  const days = diffMs / (1000 * 60 * 60 * 24) + 1;
  if (days < 1) {
    throw ApiError.badRequest('Leave end date must be on or after the start date.');
  }
  return days;
}

/**
 * Throws if the employee already has a pending or approved leave request that
 * overlaps the given date range. Rejected/cancelled requests never block a
 * new request for the same dates.
 */
export async function assertNoOverlap(employeeId, startDate, endDate, excludeLeaveId = null) {
  const filter = {
    employeeId,
    status: { $in: [LEAVE_STATUS.PENDING, LEAVE_STATUS.APPROVED] },
    startDate: { $lte: endDate },
    endDate: { $gte: startDate },
  };
  if (excludeLeaveId) filter._id = { $ne: excludeLeaveId };

  const overlapping = await Leave.findOne(filter);
  if (overlapping) {
    throw ApiError.badRequest('This date range overlaps with an existing leave request.');
  }
}

export async function deductLeaveBalance(employeeId, leaveType, days, year) {
  if (leaveType === LEAVE_TYPE.UNPAID) return; // unpaid leave does not draw from balance
  const balance = await getOrCreateLeaveBalance(employeeId, year);
  
  // Casual leave has 0 company balance allowance, but employees can take it at their own risk
  if (leaveType !== LEAVE_TYPE.CASUAL) {
    const available = balance.balances[leaveType] - balance.used[leaveType];
    if (days > available) {
      throw ApiError.badRequest(`Insufficient ${leaveType.toLowerCase()} leave balance. Available: ${available} day(s).`);
    }
  }

  balance.used[leaveType] += days;
  await balance.save();
  return balance;
}

export async function restoreLeaveBalance(employeeId, leaveType, days, year) {
  if (leaveType === LEAVE_TYPE.UNPAID) return;
  const balance = await getOrCreateLeaveBalance(employeeId, year);
  balance.used[leaveType] = Math.max(0, balance.used[leaveType] - days);
  await balance.save();
  return balance;
}
