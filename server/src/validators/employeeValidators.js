import { z } from 'zod';
import { ROLE_VALUES, EMPLOYMENT_TYPE, WORK_MODE } from '../utils/constants.js';

export const createEmployeeSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8),
  role: z.enum(ROLE_VALUES).default('EMPLOYEE'),
  firstName: z.string().min(1),
  lastName: z.string().optional().default(''),
  phone: z.string().optional().default(''),
  departmentId: z.string().nullable().optional(),
  designation: z.string().optional().default(''),
  joiningDate: z.coerce.date(),
  employmentType: z.enum(Object.values(EMPLOYMENT_TYPE)).default('FULL_TIME'),
  workMode: z.enum(Object.values(WORK_MODE)).default(WORK_MODE.OFFICE),
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
  email: z.string().email().optional(),
  employeeCode: z.string().optional(),
  firstName: z.string().min(1).optional(),
  lastName: z.string().optional(),
  phone: z.string().optional(),
  departmentId: z.string().nullable().optional(),
  designation: z.string().optional(),
  joiningDate: z.coerce.date().optional(),
  dateOfBirth: z.coerce.date().nullable().optional(),
  employmentType: z.enum(Object.values(EMPLOYMENT_TYPE)).optional(),
  workMode: z.enum(Object.values(WORK_MODE)).optional(),
  // Empty string / null clears the override (back to the office start time).
  workingStartTime: z
    .union([z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'Use HH:mm, e.g. 10:00'), z.literal(''), z.null()])
    .transform((v) => v || null)
    .optional(),
  // Personal schedule overrides (office timezone, HH:mm); empty/null = office default.
  workingEndTime: z
    .union([z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'Use HH:mm, e.g. 18:00'), z.literal(''), z.null()])
    .transform((v) => v || null)
    .optional(),
  overtimeCutoffTime: z
    .union([z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'Use HH:mm, e.g. 19:00'), z.literal(''), z.null()])
    .transform((v) => v || null)
    .optional(),
  dailyTargetMinutes: z
    .union([z.coerce.number().int().min(60, 'At least 1 hour.').max(720, 'At most 12 hours.'), z.literal(''), z.null()])
    .transform((v) => (v === '' ? null : v))
    .optional(),
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
  // HR/Admin only (this schema is only used on the back-office route); null removes it.
  attendanceLocation: z
    .object({
      name: z.string().trim().min(2, 'Enter a location name.').max(120),
      latitude: z.coerce.number().min(-90).max(90),
      longitude: z.coerce.number().min(-180).max(180),
      radiusMeters: z.coerce.number().int().min(20, 'Radius must be at least 20 m.').max(5000, 'Radius can be at most 5000 m.'),
      active: z.boolean().default(true),
    })
    .nullable()
    .optional(),
});

// Note: attendanceLocation is deliberately absent here — employees can never set their own site.
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
