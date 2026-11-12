import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import { asyncHandler } from '../utils/asyncHandler.js';
import { ApiError } from '../utils/ApiError.js';
import { env } from '../config/env.js';
import { requirePersonalManagerToken } from '../middleware/personalManagerIntegrationAuth.js';
import { getAttendanceForIntegration, parseDayKey, MAX_RANGE_DAYS } from '../services/personalManagerIntegrationService.js';

// GET /api/integrations/personal-manager/v1/attendance?from=YYYY-MM-DD&to=YYYY-MM-DD
// Read-only. Authenticated by a dedicated bearer token bound to one employee.
const router = Router();

router.use(
  rateLimit({
    windowMs: 15 * 60 * 1000,
    limit: 120,
    skip: () => env.nodeEnv === 'test',
    standardHeaders: true,
    legacyHeaders: false,
  })
);
router.use(requirePersonalManagerToken);

router.get(
  '/attendance',
  asyncHandler(async (req, res) => {
    const from = parseDayKey(req.query.from);
    const to = parseDayKey(req.query.to);
    if (!from || !to) throw ApiError.badRequest('from and to must be valid dates in YYYY-MM-DD format.');
    if (to < from) throw ApiError.badRequest('to must not be before from.');
    if ((to - from) / 86_400_000 + 1 > MAX_RANGE_DAYS) {
      throw ApiError.badRequest(`The date range may cover at most ${MAX_RANGE_DAYS} days.`);
    }

    const result = await getAttendanceForIntegration(req.integrationEmployeeId, from, to);
    if (!result) throw new ApiError(503, 'The employee linked to this integration no longer exists.');

    res.json({
      success: true,
      version: 'v1',
      timezone: result.timezone,
      from: req.query.from,
      to: req.query.to,
      generatedAt: new Date().toISOString(),
      employee: result.employee,
      records: result.records,
    });
  })
);

export default router;
