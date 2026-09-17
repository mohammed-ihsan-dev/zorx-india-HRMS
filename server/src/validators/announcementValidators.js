import { z } from 'zod';
import { ANNOUNCEMENT_PRIORITY, ANNOUNCEMENT_AUDIENCE } from '../utils/constants.js';

export const createAnnouncementSchema = z.object({
  title: z.string().min(1),
  content: z.string().min(1),
  priority: z.enum(Object.values(ANNOUNCEMENT_PRIORITY)).default('NORMAL'),
  audience: z.enum(Object.values(ANNOUNCEMENT_AUDIENCE)).default('ALL'),
  departmentId: z.string().nullable().optional(),
  publishDate: z.coerce.date().optional(),
  expiryDate: z.coerce.date().nullable().optional(),
});

export const updateAnnouncementSchema = createAnnouncementSchema.partial();
