import { Router } from 'express';
import * as leaveController from '../controllers/leaveController.js';
import { requireAuth } from '../middleware/auth.js';
import { requireRole } from '../middleware/rbac.js';
import { validateBody } from '../middleware/validate.js';
import { createLeaveSchema, reviewLeaveSchema } from '../validators/leaveValidators.js';
import { BACK_OFFICE_ROLES } from '../utils/constants.js';

const router = Router();

router.use(requireAuth);

router.post('/', validateBody(createLeaveSchema), leaveController.createLeave);
router.get('/me', leaveController.getMyLeaves);
router.patch('/:id/cancel', leaveController.cancelLeave);

router.get('/', requireRole(...BACK_OFFICE_ROLES), leaveController.listLeaves);
router.patch('/:id/approve', requireRole(...BACK_OFFICE_ROLES), validateBody(reviewLeaveSchema), leaveController.approveLeave);
router.patch('/:id/reject', requireRole(...BACK_OFFICE_ROLES), validateBody(reviewLeaveSchema), leaveController.rejectLeave);

export default router;
