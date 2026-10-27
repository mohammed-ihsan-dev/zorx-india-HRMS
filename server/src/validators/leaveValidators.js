import { z } from 'zod';
import { REQUESTABLE_LEAVE_TYPES, LEAVE_DURATION, HALF_DAY_SESSION } from '../utils/constants.js';

export const createLeaveSchema = z
  .object({
    leaveType: z.enum(REQUESTABLE_LEAVE_TYPES),
    startDate: z.coerce.date(),
    endDate: z.coerce.date(),
    reason: z.string().min(3, 'Please provide a reason for your leave.'),
    supportingDocumentId: z.string().nullable().optional(),
    // Omitted = FULL_DAY, so existing clients keep working unchanged.
    duration: z.enum(Object.values(LEAVE_DURATION)).optional().default(LEAVE_DURATION.FULL_DAY),
    halfDaySession: z.enum(Object.values(HALF_DAY_SESSION)).nullable().optional(),
  })
  .superRefine((v, ctx) => {
    if (v.duration === LEAVE_DURATION.HALF_DAY) {
      if (!v.halfDaySession) ctx.addIssue({ code: 'custom', path: ['halfDaySession'], message: 'Please choose Morning or Evening for a half-day leave.' });
      if (v.startDate.getTime() !== v.endDate.getTime()) ctx.addIssue({ code: 'custom', path: ['endDate'], message: 'A half-day leave must start and end on the same date.' });
    } else if (v.halfDaySession) {
      ctx.addIssue({ code: 'custom', path: ['halfDaySession'], message: 'A session can only be chosen for a half-day leave.' });
    }
  });

export const reviewLeaveSchema = z.object({
  reviewNote: z.string().optional().default(''),
});
