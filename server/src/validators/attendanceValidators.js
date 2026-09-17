import { z } from 'zod';
import { BREAK_TYPE } from '../utils/constants.js';

export const punchSchema = z.object({
  latitude: z.number().min(-90).max(90),
  longitude: z.number().min(-180).max(180),
});

export const startBreakSchema = z.object({
  type: z.enum(Object.values(BREAK_TYPE)),
});
