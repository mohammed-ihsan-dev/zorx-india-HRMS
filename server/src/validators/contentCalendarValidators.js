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
  // Optional for new items — defaults to null if not provided, empty, or null.
  outputDate: z
    .preprocess((val) => (val === '' || val === null || val === undefined ? null : val), z.coerce.date().nullable().optional())
    .default(null),
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
  // Optional on update — omitting leaves existing untouched, while null or '' explicitly clears it.
  outputDate: z.preprocess((val) => (val === '' || val === null ? null : val), z.coerce.date().nullable().optional()),
  priority: z.enum(Object.values(TASK_PRIORITY)).optional(),
  workStatus: z.enum(Object.values(CONTENT_CALENDAR_STATUS)).optional(),
  completionRemark: z.string().optional(),
  clientFeedback: z.string().optional(),
});
