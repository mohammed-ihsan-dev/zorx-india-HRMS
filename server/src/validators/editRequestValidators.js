import { z } from 'zod';
import { EDIT_REQUEST_FIELD } from '../utils/constants.js';

export const createEditRequestSchema = z.object({
  field: z.enum(Object.values(EDIT_REQUEST_FIELD)),
  currentValue: z.string().optional().default(''),
  requestedValue: z.string().min(1, 'Please provide the requested value.'),
  reason: z.string().min(3, 'Please provide a reason for this request.'),
});

export const reviewEditRequestSchema = z.object({
  reviewComment: z.string().optional().default(''),
});
