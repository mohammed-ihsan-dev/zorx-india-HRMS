import { z } from 'zod';

export const updateOfficeSettingsSchema = z.object({
  officeName: z.string().min(1).optional(),
  latitude: z.number().min(-90).max(90).optional(),
  longitude: z.number().min(-180).max(180).optional(),
  attendanceRadius: z.number().min(10).optional(),
  workingStartTime: z
    .string()
    .regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'Use HH:mm format, e.g. 09:30')
    .optional(),
  workingEndTime: z
    .string()
    .regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'Use HH:mm format, e.g. 18:00')
    .optional(),
  breakDurationMinutes: z.number().min(0).optional(),
  timezone: z.string().optional(),
  lateThresholdMinutes: z.number().min(0).optional(),
  halfDayThresholdMinutes: z.number().min(0).optional(),
  overtimeEnabled: z.boolean().optional(),
});
