import { Router } from 'express';
import mongoose from 'mongoose';
import * as holidayController from '../controllers/holidayController.js';
import { requireAuth } from '../middleware/auth.js';
import { requireRole } from '../middleware/rbac.js';
import { validateBody, validateQuery } from '../middleware/validate.js';
import { createHolidaySchema, listHolidaysQuerySchema } from '../validators/holidayValidators.js';
import { blockVirtualUserWrite } from '../utils/virtualTestUser.js';
import { ApiError } from '../utils/ApiError.js';
import { BACK_OFFICE_ROLES } from '../utils/constants.js';

const router = Router();

router.use(requireAuth);

const validId = (req, res, next) => (mongoose.isValidObjectId(req.params.id) ? next() : next(ApiError.notFound('Holiday not found.')));

router.get('/', validateQuery(listHolidaysQuerySchema), holidayController.listHolidays);
router.post('/', requireRole(...BACK_OFFICE_ROLES), blockVirtualUserWrite, validateBody(createHolidaySchema), holidayController.createHoliday);
router.delete('/:id', requireRole(...BACK_OFFICE_ROLES), blockVirtualUserWrite, validId, holidayController.deleteHoliday);

export default router;
