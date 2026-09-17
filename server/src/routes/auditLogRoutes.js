import { Router } from 'express';
import * as auditLogController from '../controllers/auditLogController.js';
import { requireAuth } from '../middleware/auth.js';
import { requireRole } from '../middleware/rbac.js';
import { ROLES } from '../utils/constants.js';

const router = Router();

router.use(requireAuth, requireRole(ROLES.SUPER_ADMIN, ROLES.ADMIN, ROLES.HR));
router.get('/', auditLogController.listAuditLogs);

export default router;
