import { AuditLog } from '../models/AuditLog.js';

export async function recordAudit({ actorId, action, targetType, targetId = null, description = '', metadata = {} }) {
  return AuditLog.create({ actorId, action, targetType, targetId, description, metadata });
}
