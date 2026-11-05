import { Router } from 'express';
import * as onsiteController from '../controllers/onsiteWorkController.js';
import { requireAuth } from '../middleware/auth.js';
import { requirePermission } from '../middleware/rbac.js';
import { validateBody } from '../middleware/validate.js';
import { createOnsiteSchema, updateOnsiteSchema, approveOnsiteSchema, rejectOnsiteSchema } from '../validators/onsiteWorkValidators.js';
import { blockVirtualUserWrite } from '../utils/virtualTestUser.js';
import { PERMISSIONS } from '../utils/constants.js';

const router = Router();
const canReview = requirePermission(PERMISSIONS.ONSITE_WORK_REVIEW);

router.use(requireAuth);

// Employee (eligible employees only — checked in the controller from the session).
router.post('/', blockVirtualUserWrite, validateBody(createOnsiteSchema), onsiteController.createOnsite);
router.get('/my', onsiteController.getMyOnsite);
router.get('/my/today', onsiteController.getMyOnsiteToday);
router.patch('/my/:id', blockVirtualUserWrite, validateBody(updateOnsiteSchema), onsiteController.updateOnsite);
router.patch('/my/:id/cancel', blockVirtualUserWrite, onsiteController.cancelOnsite);

// Reviewers: Super Admins, or users explicitly granted ONSITE_WORK_REVIEW.
router.get('/', canReview, onsiteController.listOnsite);
router.get('/:id', canReview, onsiteController.getOnsiteById);
router.patch('/:id/approve', canReview, validateBody(approveOnsiteSchema), onsiteController.approveOnsite);
router.patch('/:id/reject', canReview, validateBody(rejectOnsiteSchema), onsiteController.rejectOnsite);

export default router;
