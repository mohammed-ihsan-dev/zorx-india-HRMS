import { Router } from 'express';
import * as departmentController from '../controllers/departmentController.js';
import { requireAuth } from '../middleware/auth.js';
import { requireRole } from '../middleware/rbac.js';
import { validateBody } from '../middleware/validate.js';
import { createDepartmentSchema, updateDepartmentSchema } from '../validators/departmentValidators.js';
import { BACK_OFFICE_ROLES } from '../utils/constants.js';

const router = Router();

router.use(requireAuth);

router.get('/', departmentController.listDepartments);
router.post('/', requireRole(...BACK_OFFICE_ROLES), validateBody(createDepartmentSchema), departmentController.createDepartment);
router.patch('/:id', requireRole(...BACK_OFFICE_ROLES), validateBody(updateDepartmentSchema), departmentController.updateDepartment);
router.delete('/:id', requireRole(...BACK_OFFICE_ROLES), departmentController.deleteDepartment);

export default router;
