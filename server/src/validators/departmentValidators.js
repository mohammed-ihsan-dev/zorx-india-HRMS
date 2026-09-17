import { z } from 'zod';

export const createDepartmentSchema = z.object({
  name: z.string().min(1),
  description: z.string().optional().default(''),
  managerId: z.string().nullable().optional(),
});

export const updateDepartmentSchema = z.object({
  name: z.string().min(1).optional(),
  description: z.string().optional(),
  managerId: z.string().nullable().optional(),
  status: z.enum(['ACTIVE', 'INACTIVE']).optional(),
});
