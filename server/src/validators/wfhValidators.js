import { z } from 'zod';

// Plain calendar date only (what <input type="date"> sends). Accepting a full
// timestamp here would let the browser's timezone shift the requested day.
const calendarDate = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, 'Please select a valid WFH date.')
  .refine((value) => {
    const [y, m, d] = value.split('-').map(Number);
    const parsed = new Date(Date.UTC(y, m - 1, d));
    return parsed.getUTCFullYear() === y && parsed.getUTCMonth() === m - 1 && parsed.getUTCDate() === d;
  }, 'Please select a valid WFH date.');

export const createWfhSchema = z.object({
  date: calendarDate,
  reason: z.string().trim().min(3, 'Please provide a reason.').max(500, 'Reason is too long.'),
  workPlan: z.string().trim().min(3, 'Please describe your work plan.').max(1000, 'Work plan is too long.'),
  remark: z.string().trim().max(500, 'Remark is too long.').optional().default(''),
});

export const reviewWfhSchema = z.object({
  reviewNote: z.string().trim().max(500, 'Review note is too long.').optional().default(''),
});
