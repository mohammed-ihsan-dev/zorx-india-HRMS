import { Router } from 'express';
import * as attendanceController from '../controllers/attendanceController.js';
import { requireAuth } from '../middleware/auth.js';
import { requireRole } from '../middleware/rbac.js';
import { validateBody } from '../middleware/validate.js';
import { punchSchema, startBreakSchema } from '../validators/attendanceValidators.js';
import { BACK_OFFICE_ROLES, ROLES } from '../utils/constants.js';

const router = Router();

router.use(requireAuth);

router.post('/check-in', validateBody(punchSchema), attendanceController.checkIn);
router.post('/check-out', validateBody(punchSchema), attendanceController.checkOut);
router.post('/break/start', validateBody(startBreakSchema), attendanceController.startBreak);
router.post('/break/end', attendanceController.endBreak);
router.get('/me/today', attendanceController.getMyAttendanceToday);
router.get('/me', attendanceController.getMyAttendanceHistory);

router.get('/', requireRole(...BACK_OFFICE_ROLES, ROLES.MANAGER), attendanceController.listAttendance);
router.get('/:employeeId', requireRole(...BACK_OFFICE_ROLES, ROLES.MANAGER), attendanceController.getEmployeeAttendance);

export default router;
