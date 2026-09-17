import { z } from 'zod';
import { ROLE_VALUES, EMPLOYMENT_TYPE } from '../utils/constants.js';

export const createEmployeeSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8),
  role: z.enum(ROLE_VALUES).default('EMPLOYEE'),
  firstName: z.string().min(1),
  lastName: z.string().min(1),
  phone: z.string().optional().default(''),
  departmentId: z.string().nullable().optional(),
  designation: z.string().optional().default(''),
  joiningDate: z.coerce.date(),
  employmentType: z.enum(Object.values(EMPLOYMENT_TYPE)).default('FULL_TIME'),
  managerId: z.string().nullable().optional(),
  address: z.string().optional().default(''),
  emergencyContact: z
    .object({
      name: z.string().optional().default(''),
      phone: z.string().optional().default(''),
      relation: z.string().optional().default(''),
    })
    .optional(),
});

export const updateEmployeeSchema = z.object({
  firstName: z.string().min(1).optional(),
  lastName: z.string().min(1).optional(),
  phone: z.string().optional(),
  departmentId: z.string().nullable().optional(),
  designation: z.string().optional(),
  employmentType: z.enum(Object.values(EMPLOYMENT_TYPE)).optional(),
  managerId: z.string().nullable().optional(),
  address: z.string().optional(),
  emergencyContact: z
    .object({
      name: z.string().optional(),
      phone: z.string().optional(),
      relation: z.string().optional(),
    })
    .optional(),
  profileImage: z.string().optional(),
});

export const updateOwnProfileSchema = z.object({
  phone: z.string().optional(),
  address: z.string().optional(),
  emergencyContact: z
    .object({
      name: z.string().optional(),
      phone: z.string().optional(),
      relation: z.string().optional(),
    })
    .optional(),
  profileImage: z.string().optional(),
});

export const updateStatusSchema = z.object({
  status: z.enum(['ACTIVE', 'INACTIVE']),
});
