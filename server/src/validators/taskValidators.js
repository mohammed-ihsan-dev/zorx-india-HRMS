import { z } from 'zod';
import { TASK_STATUS, TASK_PRIORITY } from '../utils/constants.js';

export const createTaskSchema = z.object({
  title: z.string().min(1),
  description: z.string().optional().default(''),
  assignedTo: z.string().min(1, 'An assignee is required.'),
  priority: z.enum(Object.values(TASK_PRIORITY)).default('MEDIUM'),
  startDate: z.coerce.date().optional(),
  dueDate: z.coerce.date().optional(),
});

export const updateTaskSchema = z.object({
  title: z.string().min(1).optional(),
  description: z.string().optional(),
  assignedTo: z.string().optional(),
  priority: z.enum(Object.values(TASK_PRIORITY)).optional(),
  startDate: z.coerce.date().optional(),
  dueDate: z.coerce.date().optional(),
});

export const updateTaskStatusSchema = z.object({
  status: z.enum(Object.values(TASK_STATUS)),
});
