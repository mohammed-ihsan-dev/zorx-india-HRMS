import { ROLES } from '../../utils/constants.js';

const idOf = (v) => String(v?._id || v || '');

/**
 * Who may approve or reject a leave request — mirrors the server rule
 * (leaveController.assertCanReviewLeave), which stays the authority:
 * nobody reviews their own request, and HR / Admin requests are reviewed only by
 * a Super Admin. Returns why the current user can't review it, or null.
 */
export function leaveReviewBlock(user, leave) {
  if (user?.employee?._id && idOf(leave?.employeeId) === idOf(user.employee._id)) return 'Your own request — a Super Admin reviews it.';
  if (user?.role !== ROLES.SUPER_ADMIN && [ROLES.ADMIN, ROLES.SUPER_ADMIN].includes(leave?.requesterRole)) return 'HR / Admin request — a Super Admin reviews it.';
  return null;
}
