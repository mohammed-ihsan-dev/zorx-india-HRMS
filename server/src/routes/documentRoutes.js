import { Router } from 'express';
import * as documentController from '../controllers/documentController.js';
import * as payslipController from '../controllers/payslipController.js';
import { requireAuth } from '../middleware/auth.js';
import { requireRole } from '../middleware/rbac.js';
import { documentUpload, payslipUpload } from '../services/fileStorageService.js';
import { ApiError } from '../utils/ApiError.js';
import { blockVirtualUserWrite } from '../utils/virtualTestUser.js';
import { BACK_OFFICE_ROLES } from '../utils/constants.js';

const router = Router();

router.use(requireAuth);

const handleUpload = withUploadErrors(documentUpload);
const handlePayslipUpload = withUploadErrors(payslipUpload);

function withUploadErrors(upload) {
  return (req, res, next) => upload(req, res, (err) => {
    if (err) {
      if (err instanceof ApiError) return next(err);
      if (err.code === 'LIMIT_FILE_SIZE') return next(ApiError.badRequest('File size exceeds the allowed limit.'));
      return next(ApiError.badRequest(err.message || 'Could not process the uploaded file.'));
    }
    next();
  });
}

router.post('/', blockVirtualUserWrite, handleUpload, documentController.uploadDocument);
router.get('/me', documentController.listMyDocuments);
// Payslips: employees read only their own; only back office can list all or upload.
router.get('/payslips/me', payslipController.listMyPayslips);
router.get('/payslips', requireRole(...BACK_OFFICE_ROLES), payslipController.listPayslips);
router.post('/payslips', requireRole(...BACK_OFFICE_ROLES), blockVirtualUserWrite, handlePayslipUpload, payslipController.uploadPayslip);
router.get('/admin/all', requireRole(...BACK_OFFICE_ROLES), documentController.listAllDocuments);
router.get('/employee/:employeeId', requireRole(...BACK_OFFICE_ROLES), documentController.listDocumentsForEmployee);
router.get('/:id/download', documentController.downloadDocument);
router.patch('/:id/approve', requireRole(...BACK_OFFICE_ROLES), documentController.approveDocument);
router.patch('/:id/reject', requireRole(...BACK_OFFICE_ROLES), documentController.rejectDocument);

export default router;
