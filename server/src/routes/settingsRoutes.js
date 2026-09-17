import { Router } from 'express';
import * as settingsController from '../controllers/settingsController.js';
import { requireAuth } from '../middleware/auth.js';
import { requireRole } from '../middleware/rbac.js';
import { validateBody } from '../middleware/validate.js';
import { updateOfficeSettingsSchema } from '../validators/settingsValidators.js';
import { ROLES } from '../utils/constants.js';

const router = Router();

router.use(requireAuth);

router.get('/office', settingsController.getOfficeSettings);
router.patch(
  '/office',
  requireRole(ROLES.SUPER_ADMIN, ROLES.ADMIN),
  validateBody(updateOfficeSettingsSchema),
  settingsController.updateOfficeSettings
);

export default router;
