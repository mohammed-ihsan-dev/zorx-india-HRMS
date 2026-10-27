import { titleCase } from '../../utils/formatters.js';

// Leave records without `duration` were created before half days existed: Full Day.
export const isHalfDay = (leave) => leave?.duration === 'HALF_DAY';

/** "Half Day (Morning)" | "Full Day". */
export function leaveDurationLabel(leave) {
  if (!isHalfDay(leave)) return 'Full Day';
  return leave.halfDaySession ? `Half Day (${titleCase(leave.halfDaySession)})` : 'Half Day';
}

/** "Casual Leave — Half Day (Morning)". */
export const leaveTitle = (leave) => `${titleCase(leave?.leaveType || '')} Leave — ${leaveDurationLabel(leave)}`;

/** 0.5 → "0.5 day", 1 → "1 day", 3 → "3 days". */
export const formatLeaveDays = (days) => `${days} day${days > 1 ? 's' : ''}`;
