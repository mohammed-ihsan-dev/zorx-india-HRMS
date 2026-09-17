import { Router } from 'express';
import * as taskController from '../controllers/taskController.js';
import { requireAuth } from '../middleware/auth.js';
import { requireRole } from '../middleware/rbac.js';
import { validateBody } from '../middleware/validate.js';
import { createTaskSchema, updateTaskSchema, updateTaskStatusSchema } from '../validators/taskValidators.js';
import { BACK_OFFICE_ROLES } from '../utils/constants.js';

const router = Router();

router.use(requireAuth);

const canAssign = requireRole(...BACK_OFFICE_ROLES);

router.get('/me', taskController.getMyTasks);
router.post('/', canAssign, validateBody(createTaskSchema), taskController.createTask);
router.get('/', canAssign, taskController.listTasks);
router.get('/:id', taskController.getTaskById);
router.patch('/:id', canAssign, validateBody(updateTaskSchema), taskController.updateTask);
router.patch('/:id/status', validateBody(updateTaskStatusSchema), taskController.updateTaskStatus);

export default router;
