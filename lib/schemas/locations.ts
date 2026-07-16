import { z } from 'zod';

export const createLocationSchema = z.object({
  code: z
    .string()
    .trim()
    .min(1, 'Code required')
    .max(32, 'Code too long')
    .regex(/^[A-Za-z0-9\-_.]+$/, 'Use letters, numbers, dash, underscore, dot only'),
  description: z.string().trim().max(200).optional().or(z.literal('')),
});
export type CreateLocationInput = z.infer<typeof createLocationSchema>;

export const updateLocationSchema = z.object({
  id: z.string().uuid(),
  description: z.string().trim().max(200).optional().or(z.literal('')),
});
export type UpdateLocationInput = z.infer<typeof updateLocationSchema>;

export const toggleLocationSchema = z.object({
  id: z.string().uuid(),
  isActive: z.boolean(),
});
export type ToggleLocationInput = z.infer<typeof toggleLocationSchema>;
