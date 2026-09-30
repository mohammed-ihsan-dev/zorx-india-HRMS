import { AuditLog } from '../models/AuditLog.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { sendSuccess } from '../utils/ApiResponse.js';

export const listAuditLogs = asyncHandler(async (req, res) => {
  const { page = 1, limit = 10 } = req.query;
  const pageNum = Math.max(1, Number(page) || 1);
  const limitNum = Math.max(1, Number(limit) || 10);

  const [logs, total] = await Promise.all([
    AuditLog.find()
      .populate('actorId', 'email role')
      .sort({ createdAt: -1 })
      .skip((pageNum - 1) * limitNum)
      .limit(limitNum),
    AuditLog.countDocuments(),
  ]);

  const pages = Math.ceil(total / limitNum) || 1;

  sendSuccess(res, { data: logs, meta: { total, page: pageNum, limit: limitNum, pages } });
});
