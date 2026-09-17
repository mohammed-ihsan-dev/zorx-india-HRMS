import { Router } from 'express';
import * as reportController from '../controllers/reportController.js';
import { requireAuth } from '../middleware/auth.js';
import { requireRole } from '../middleware/rbac.js';
import { BACK_OFFICE_ROLES } from '../utils/constants.js';

const router = Router();

router.use(requireAuth, requireRole(...BACK_OFFICE_ROLES));

router.get('/attendance', reportController.attendanceReport);
router.get('/leave', reportController.leaveReport);
router.get('/employees', reportController.employeeReport);
router.get('/tasks', reportController.taskReport);

export default router;
