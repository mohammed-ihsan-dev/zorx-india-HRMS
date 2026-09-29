import { z } from 'zod';
import { TASK_PRIORITY, CONTENT_CALENDAR_STATUS } from '../utils/constants.js';

export const createContentCalendarItemSchema = z.object({
  client: z.string().min(1, 'Client is required.'),
  date: z.coerce.date(),
  assignedEmployee: z.string().min(1, 'An assigned employee is required.'),
  work: z.string().min(1, 'Work description is required.'),
  assignmentRemark: z.string().optional().default(''),
  deadline: z.coerce.date(),
  priority: z.enum(Object.values(TASK_PRIORITY)).default('MEDIUM'),
  workStatus: z.enum(Object.values(CONTENT_CALENDAR_STATUS)).default('REMAINING'),
  completionRemark: z.string().optional().default(''),
  clientFeedback: z.string().optional().default(''),
});

export const updateContentCalendarItemSchema = z.object({
  client: z.string().min(1).optional(),
  date: z.coerce.date().optional(),
  assignedEmployee: z.string().min(1).optional(),
  work: z.string().min(1).optional(),
  assignmentRemark: z.string().optional(),
  deadline: z.coerce.date().optional(),
  priority: z.enum(Object.values(TASK_PRIORITY)).optional(),
  workStatus: z.enum(Object.values(CONTENT_CALENDAR_STATUS)).optional(),
  completionRemark: z.string().optional(),
  clientFeedback: z.string().optional(),
});
