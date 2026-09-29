import { Router } from 'express';
import * as contentCalendarController from '../controllers/contentCalendarController.js';
import { requireAuth } from '../middleware/auth.js';
import { requirePermission } from '../middleware/rbac.js';
import { validateBody } from '../middleware/validate.js';
import { createContentCalendarItemSchema, updateContentCalendarItemSchema } from '../validators/contentCalendarValidators.js';
import { PERMISSIONS } from '../utils/constants.js';

const router = Router();

router.use(requireAuth);

const canView = requirePermission(PERMISSIONS.CONTENT_CALENDAR_VIEW);
const canManage = requirePermission(PERMISSIONS.CONTENT_CALENDAR_MANAGE);

router.get('/', canView, contentCalendarController.listItems);
router.get('/employees', canView, contentCalendarController.listAssignableEmployees);
router.get('/:id', canView, contentCalendarController.getItemById);
router.post('/', canManage, validateBody(createContentCalendarItemSchema), contentCalendarController.createItem);
router.patch('/:id', canManage, validateBody(updateContentCalendarItemSchema), contentCalendarController.updateItem);
router.delete('/:id', canManage, contentCalendarController.deleteItem);

export default router;
