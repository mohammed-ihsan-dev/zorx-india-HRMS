import { Router } from 'express';
import * as wfhController from '../controllers/wfhController.js';
import { requireAuth } from '../middleware/auth.js';
import { requireRole } from '../middleware/rbac.js';
import { validateBody } from '../middleware/validate.js';
import { createWfhSchema, reviewWfhSchema } from '../validators/wfhValidators.js';
import { blockVirtualUserWrite } from '../utils/virtualTestUser.js';
import { BACK_OFFICE_ROLES } from '../utils/constants.js';

const router = Router();

router.use(requireAuth);

router.post('/', blockVirtualUserWrite, validateBody(createWfhSchema), wfhController.createWfh);
router.get('/my', wfhController.getMyWfh);
router.get('/my/today', wfhController.getMyWfhToday);

router.get('/', requireRole(...BACK_OFFICE_ROLES), wfhController.listWfh);
router.get('/summary', requireRole(...BACK_OFFICE_ROLES), wfhController.getWfhSummary);
router.patch('/:id/approve', requireRole(...BACK_OFFICE_ROLES), validateBody(reviewWfhSchema), wfhController.approveWfh);
router.patch('/:id/reject', requireRole(...BACK_OFFICE_ROLES), validateBody(reviewWfhSchema), wfhController.rejectWfh);

router.get('/:id', wfhController.getWfhById);

export default router;
