import { z } from 'zod';

const ymd = z.string().regex(/^\d{4}-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/, 'Please choose a valid date.');

export const createHolidaySchema = z.object({
  date: ymd,
  name: z.string().trim().min(2, 'Please enter the holiday name.').max(80),
});

export const listHolidaysQuerySchema = z.object({
  from: ymd.optional(),
  to: ymd.optional(),
});
