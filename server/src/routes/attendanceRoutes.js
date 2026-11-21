import { Router } from 'express';
import * as attendanceController from '../controllers/attendanceController.js';
import { requireAuth } from '../middleware/auth.js';
import { requireRole } from '../middleware/rbac.js';
import { validateBody } from '../middleware/validate.js';
import { punchSchema, startBreakSchema } from '../validators/attendanceValidators.js';
import { isDefaultWfhEmployee, resolveWfhSource } from '../services/wfhService.js';
import { isValidCoordinate } from '../utils/geo.js';
import { assignedLocationRules } from '../services/attendanceService.js';
import { OfficeSettings } from '../models/OfficeSettings.js';
import { Attendance } from '../models/Attendance.js';
import { approvedOnsiteFor } from '../services/onsiteWorkService.js';
import { getStartOfDayUTC } from '../utils/dateUtils.js';
import { BACK_OFFICE_ROLES, ATTENDANCE_VERIFICATION_MODE } from '../utils/constants.js';

const router = Router();

const validatePunch = validateBody(punchSchema);

// Coordinates are only used in GPS mode. Permanent-WFH employees (per their
// stored Employee.workMode) and everyone in Company Wi-Fi mode (per the
// server-side Office Settings) punch without them, so the body is discarded —
// nothing in the request can choose the mode. Otherwise: the existing
// coordinate validation, unchanged. An employee with their own active
// attendance site always sends GPS (validated against that site), even in Wi-Fi mode.
async function validatePunchBody(req, res, next) {
  try {
    const settings = await OfficeSettings.getSingleton();
    // Check-out needs today's record whatever the mode: start reading it now, in
    // parallel with the checks below (performCheckOut awaits this same promise).
    if (req.path === '/check-out' && req.user.employeeId?._id) {
      req.attendanceToday = Attendance.findOne({ employeeId: req.user.employeeId._id, date: getStartOfDayUTC(new Date(), settings.timezone) }).exec();
      req.attendanceToday.catch(() => {}); // awaited by the handler
    }
    // Approved Onsite Work today: GPS is always required and recorded.
    if (await approvedOnsiteFor(req.user.employeeId?._id, getStartOfDayUTC(new Date(), settings.timezone))) {
      return validatePunch(req, res, next);
    }
    const ownSite = Boolean(assignedLocationRules(req.user.employeeId));
    if (
      (settings.attendanceVerificationMode === ATTENDANCE_VERIFICATION_MODE.WIFI && !ownSite) ||
      (await isDefaultWfhEmployee(req.user.employeeId?._id, req.user.employeeId))
    ) {
      req.body = {};
      return next();
    }
    // Approved WFH for today (an APPROVED request for this exact day, or a recurring
    // policy day) — looked up on the server for the signed-in employee, never taken
    // from the request: GPS is optional. Valid coordinates are kept, anything else dropped.
    // Looked up once per request: check-in/out reuses this answer (req.wfhSourceToday).
    req.wfhSourceToday = resolveWfhSource(req.user.employeeId?._id, getStartOfDayUTC(new Date(), settings.timezone), { employee: req.user.employeeId });
    if (await req.wfhSourceToday) {
      const { latitude, longitude } = req.body || {};
      req.body = isValidCoordinate(latitude, longitude) ? { latitude, longitude } : {};
      return next();
    }
  } catch (err) {
    return next(err);
  }
  return validatePunch(req, res, next);
}

router.use(requireAuth);

router.post('/check-in', validatePunchBody, attendanceController.checkIn);
router.post('/check-out', validatePunchBody, attendanceController.checkOut);
router.post('/virtual/reset', attendanceController.resetVirtualAttendance);
router.post('/break/start', validateBody(startBreakSchema), attendanceController.startBreak);
router.post('/break/end', attendanceController.endBreak);
router.get('/me/today', attendanceController.getMyAttendanceToday);
router.get('/network-status', attendanceController.getNetworkStatus);
router.get('/me', attendanceController.getMyAttendanceHistory);

router.get('/', requireRole(...BACK_OFFICE_ROLES), attendanceController.listAttendance);
router.get('/:employeeId', requireRole(...BACK_OFFICE_ROLES), attendanceController.getEmployeeAttendance);

export default router;
