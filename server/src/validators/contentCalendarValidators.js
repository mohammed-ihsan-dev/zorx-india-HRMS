import { z } from 'zod';
import { TASK_PRIORITY, CONTENT_CALENDAR_STATUS } from '../utils/constants.js';

export const createContentCalendarItemSchema = z.object({
  clientId: z.string().optional(),
  client: z.string().optional(),
  date: z.coerce.date(), // Assignment Date
  assignedEmployee: z.string().min(1, 'An assigned employee is required.'),
  work: z.string().min(1, 'Work description is required.'),
  assignmentRemark: z.string().optional().default(''),
  deadline: z.coerce.date(),
  // Required for every new item — existing legacy records predating this
  // field are handled separately (see ContentCalendarItem model comment).
  outputDate: z.coerce.date({ required_error: 'Output Date is required.', invalid_type_error: 'Output Date must be a valid date.' }),
  priority: z.enum(Object.values(TASK_PRIORITY)).default('MEDIUM'),
  workStatus: z.enum(Object.values(CONTENT_CALENDAR_STATUS)).default('REMAINING'),
  completionRemark: z.string().optional().default(''),
  clientFeedback: z.string().optional().default(''),
}).refine((data) => Boolean(data.clientId || data.client), {
  message: 'Client selection or name is required.',
  path: ['clientId'],
});

export const updateContentCalendarItemSchema = z.object({
  clientId: z.string().optional(),
  client: z.string().optional(),
  date: z.coerce.date().optional(), // Assignment Date
  assignedEmployee: z.string().min(1).optional(),
  work: z.string().min(1).optional(),
  assignmentRemark: z.string().optional(),
  deadline: z.coerce.date().optional(),
  // Optional on update so editing a legacy pre-outputDate record (or any
  // other field) never forces the caller to also supply an output date.
  outputDate: z.coerce.date().optional(),
  priority: z.enum(Object.values(TASK_PRIORITY)).optional(),
  workStatus: z.enum(Object.values(CONTENT_CALENDAR_STATUS)).optional(),
  completionRemark: z.string().optional(),
  clientFeedback: z.string().optional(),
});
