import { z } from 'zod';

// Plain calendar date only (what <input type="date"> sends), so the browser's
// timezone can never shift the requested day (same rule as WFH requests).
const calendarDate = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, 'Please select a valid date.')
  .refine((value) => {
    const [y, m, d] = value.split('-').map(Number);
    const parsed = new Date(Date.UTC(y, m - 1, d));
    return parsed.getUTCFullYear() === y && parsed.getUTCMonth() === m - 1 && parsed.getUTCDate() === d;
  }, 'Please select a valid date.');

const fields = {
  date: calendarDate,
  reason: z.string().trim().min(2, 'Please provide a reason.').max(200, 'Reason is too long.'),
  workLocation: z.string().trim().min(2, 'Please enter the onsite work location.').max(300, 'Work location is too long.'),
  description: z.string().trim().max(1000, 'Notes are too long.').optional().default(''),
};

export const createOnsiteSchema = z.object(fields).strict();

export const updateOnsiteSchema = z
  .object({ date: fields.date.optional(), reason: fields.reason.optional(), workLocation: fields.workLocation.optional(), description: z.string().trim().max(1000, 'Notes are too long.').optional() })
  .strict()
  .refine((v) => Object.keys(v).length > 0, 'Nothing to update.');

export const approveOnsiteSchema = z.object({
  comment: z.string().trim().max(500, 'Comment is too long.').optional().default(''),
});

export const rejectOnsiteSchema = z.object({
  comment: z.string().trim().min(3, 'Please give a reason for the rejection.').max(500, 'Comment is too long.'),
});
