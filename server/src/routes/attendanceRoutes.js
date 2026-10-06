import { Router } from 'express';
import * as attendanceController from '../controllers/attendanceController.js';
import { requireAuth } from '../middleware/auth.js';
import { requireRole } from '../middleware/rbac.js';
import { validateBody } from '../middleware/validate.js';
import { punchSchema, startBreakSchema } from '../validators/attendanceValidators.js';
import { isDefaultWfhEmployee } from '../services/wfhService.js';
import { BACK_OFFICE_ROLES } from '../utils/constants.js';

const router = Router();

const validatePunch = validateBody(punchSchema);

// Permanent-WFH employees (per their stored Employee.workMode — never anything
// in the request) punch without coordinates, so the body is discarded.
// Everyone else gets exactly the existing coordinate validation.
async function validatePunchBody(req, res, next) {
  try {
    if (await isDefaultWfhEmployee(req.user.employeeId?._id)) {
      req.body = {};
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
router.get('/me', attendanceController.getMyAttendanceHistory);

router.get('/', requireRole(...BACK_OFFICE_ROLES), attendanceController.listAttendance);
router.get('/:employeeId', requireRole(...BACK_OFFICE_ROLES), attendanceController.getEmployeeAttendance);

export default router;
