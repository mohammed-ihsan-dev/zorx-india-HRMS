import { Router } from 'express';
import * as announcementController from '../controllers/announcementController.js';
import { requireAuth } from '../middleware/auth.js';
import { requireRole } from '../middleware/rbac.js';
import { validateBody } from '../middleware/validate.js';
import { createAnnouncementSchema, updateAnnouncementSchema } from '../validators/announcementValidators.js';
import { BACK_OFFICE_ROLES } from '../utils/constants.js';

const router = Router();

router.use(requireAuth);

router.get('/', announcementController.listAnnouncements);
router.get('/all', requireRole(...BACK_OFFICE_ROLES), announcementController.listAllAnnouncements);
router.post('/', requireRole(...BACK_OFFICE_ROLES), validateBody(createAnnouncementSchema), announcementController.createAnnouncement);
router.patch('/:id', requireRole(...BACK_OFFICE_ROLES), validateBody(updateAnnouncementSchema), announcementController.updateAnnouncement);
router.delete('/:id', requireRole(...BACK_OFFICE_ROLES), announcementController.deleteAnnouncement);

export default router;
