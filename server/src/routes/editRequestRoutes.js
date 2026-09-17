import { Router } from 'express';
import * as editRequestController from '../controllers/editRequestController.js';
import { requireAuth } from '../middleware/auth.js';
import { requireRole } from '../middleware/rbac.js';
import { validateBody } from '../middleware/validate.js';
import { createEditRequestSchema, reviewEditRequestSchema } from '../validators/editRequestValidators.js';
import { BACK_OFFICE_ROLES } from '../utils/constants.js';

const router = Router();

router.use(requireAuth);

router.post('/', validateBody(createEditRequestSchema), editRequestController.createEditRequest);
router.get('/me', editRequestController.getMyEditRequests);
router.patch('/:id/cancel', editRequestController.cancelEditRequest);

router.get('/', requireRole(...BACK_OFFICE_ROLES), editRequestController.listEditRequests);
router.get('/:id', requireRole(...BACK_OFFICE_ROLES), editRequestController.getEditRequestById);
router.patch(
  '/:id/approve',
  requireRole(...BACK_OFFICE_ROLES),
  validateBody(reviewEditRequestSchema),
  editRequestController.approveEditRequest
);
router.patch(
  '/:id/reject',
  requireRole(...BACK_OFFICE_ROLES),
  validateBody(reviewEditRequestSchema),
  editRequestController.rejectEditRequest
);

export default router;
