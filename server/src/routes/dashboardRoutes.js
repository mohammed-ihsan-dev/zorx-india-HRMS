import { Router } from 'express';
import * as dashboardController from '../controllers/dashboardController.js';
import { requireAuth } from '../middleware/auth.js';
import { requireRole } from '../middleware/rbac.js';
import { BACK_OFFICE_ROLES } from '../utils/constants.js';

const router = Router();

router.use(requireAuth);
router.get('/admin', requireRole(...BACK_OFFICE_ROLES), dashboardController.getAdminDashboard);

export default router;
