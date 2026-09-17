import { Router } from 'express';
import * as employeeController from '../controllers/employeeController.js';
import { requireAuth } from '../middleware/auth.js';
import { requireRole } from '../middleware/rbac.js';
import { validateBody } from '../middleware/validate.js';
import {
  createEmployeeSchema,
  updateEmployeeSchema,
  updateOwnProfileSchema,
  updateStatusSchema,
} from '../validators/employeeValidators.js';
import { BACK_OFFICE_ROLES } from '../utils/constants.js';

const router = Router();

router.use(requireAuth);

router.get('/me/profile', employeeController.getMyProfile);
router.patch('/me/profile', validateBody(updateOwnProfileSchema), employeeController.updateMyProfile);

router.get('/', requireRole(...BACK_OFFICE_ROLES), employeeController.listEmployees);
router.post('/', requireRole(...BACK_OFFICE_ROLES), validateBody(createEmployeeSchema), employeeController.createEmployee);
router.get('/:id', requireRole(...BACK_OFFICE_ROLES), employeeController.getEmployeeById);
router.patch('/:id', requireRole(...BACK_OFFICE_ROLES), validateBody(updateEmployeeSchema), employeeController.updateEmployee);
router.patch(
  '/:id/status',
  requireRole(...BACK_OFFICE_ROLES),
  validateBody(updateStatusSchema),
  employeeController.updateEmployeeStatus
);
router.patch('/:id/approve-account', requireRole(...BACK_OFFICE_ROLES), employeeController.approveUserAccount);
router.patch('/:id/reject-account', requireRole(...BACK_OFFICE_ROLES), employeeController.rejectUserAccount);

export default router;
