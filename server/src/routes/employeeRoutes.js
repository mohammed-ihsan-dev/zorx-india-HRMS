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
import { profilePictureUpload } from '../services/fileStorageService.js';
import { ApiError } from '../utils/ApiError.js';
import { BACK_OFFICE_ROLES } from '../utils/constants.js';

const router = Router();

router.use(requireAuth);

function handleProfilePictureUpload(req, res, next) {
  profilePictureUpload(req, res, (err) => {
    if (err) {
      if (err instanceof ApiError) return next(err);
      if (err.code === 'LIMIT_FILE_SIZE') return next(ApiError.badRequest('Image size exceeds the allowed limit of 2MB.'));
      return next(ApiError.badRequest(err.message || 'Could not process the uploaded image.'));
    }
    next();
  });
}

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
router.post(
  '/:id/profile-picture',
  requireRole(...BACK_OFFICE_ROLES),
  handleProfilePictureUpload,
  employeeController.uploadProfilePicture
);

export default router;
