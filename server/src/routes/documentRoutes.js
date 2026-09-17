import { Router } from 'express';
import * as documentController from '../controllers/documentController.js';
import { requireAuth } from '../middleware/auth.js';
import { requireRole } from '../middleware/rbac.js';
import { documentUpload } from '../services/fileStorageService.js';
import { ApiError } from '../utils/ApiError.js';
import { BACK_OFFICE_ROLES } from '../utils/constants.js';

const router = Router();

router.use(requireAuth);

function handleUpload(req, res, next) {
  documentUpload(req, res, (err) => {
    if (err) {
      if (err instanceof ApiError) return next(err);
      if (err.code === 'LIMIT_FILE_SIZE') return next(ApiError.badRequest('File size exceeds the allowed limit.'));
      return next(ApiError.badRequest(err.message || 'Could not process the uploaded file.'));
    }
    next();
  });
}

router.post('/', handleUpload, documentController.uploadDocument);
router.get('/me', documentController.listMyDocuments);
router.get('/employee/:employeeId', requireRole(...BACK_OFFICE_ROLES), documentController.listDocumentsForEmployee);
router.get('/:id/download', documentController.downloadDocument);

export default router;
