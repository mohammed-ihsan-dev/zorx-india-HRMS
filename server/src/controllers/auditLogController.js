import { AuditLog } from '../models/AuditLog.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { sendSuccess } from '../utils/ApiResponse.js';

export const listAuditLogs = asyncHandler(async (req, res) => {
  const { page = 1, limit = 50 } = req.query;
  const pageNum = Number(page) || 1;
  const limitNum = Number(limit) || 50;

  const [logs, total] = await Promise.all([
    AuditLog.find()
      .populate('actorId', 'email role')
      .sort({ createdAt: -1 })
      .skip((pageNum - 1) * limitNum)
      .limit(limitNum),
    AuditLog.countDocuments(),
  ]);

  sendSuccess(res, { data: logs, meta: { total, page: pageNum, limit: limitNum } });
});
