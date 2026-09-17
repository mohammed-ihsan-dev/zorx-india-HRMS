import { z } from 'zod';
import { LEAVE_TYPE } from '../utils/constants.js';

export const createLeaveSchema = z.object({
  leaveType: z.enum(Object.values(LEAVE_TYPE)),
  startDate: z.coerce.date(),
  endDate: z.coerce.date(),
  reason: z.string().min(3, 'Please provide a reason for your leave.'),
  supportingDocumentId: z.string().nullable().optional(),
});

export const reviewLeaveSchema = z.object({
  reviewNote: z.string().optional().default(''),
});
