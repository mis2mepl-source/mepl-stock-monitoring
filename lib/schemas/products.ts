import { z } from 'zod';

export const createProductSchema = z
  .object({
    meplCode: z.string().trim().min(1, 'MEPL code required').max(64),
    partName: z.string().trim().min(1, 'Part name required').max(200),
    description: z.string().trim().max(500).optional().or(z.literal('')),
    dimensions: z.string().trim().max(100).optional().or(z.literal('')),
    unit: z.string().trim().min(1, 'Unit required').max(20).default('nos'),
    reorderLevel: z.coerce.number().min(0, 'Must be ≥ 0').default(0),
    openingLocationId: z
      .string()
      .uuid('Pick a location')
      .optional()
      .or(z.literal('')),
    openingQuantity: z.coerce.number().min(0).optional(),
    openingReferenceNo: z.string().max(64).optional().or(z.literal('')),
    openingNotes: z.string().max(500).optional().or(z.literal('')),
  })
  .refine(
    (v) => {
      const hasLoc = !!v.openingLocationId && v.openingLocationId !== '';
      const hasQty = v.openingQuantity !== undefined && v.openingQuantity > 0;
      // Either both provided, or neither
      return (hasLoc && hasQty) || (!hasLoc && !hasQty);
    },
    {
      message: 'Provide both location and quantity for opening stock, or leave both blank',
      path: ['openingQuantity'],
    },
  );

export type CreateProductInput = z.infer<typeof createProductSchema>;
