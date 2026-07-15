import { z } from 'zod';

const uuid = z.string().uuid();
const qty  = z.coerce.number().positive({ message: 'Quantity must be greater than 0' });

export const addStockSchema = z.object({
  productId:   uuid,
  locationId:  uuid,
  quantity:    qty,
  referenceNo: z.string().max(64).optional().or(z.literal('')),
  notes:       z.string().max(500).optional().or(z.literal('')),
});
export type AddStockInput = z.infer<typeof addStockSchema>;

export const removeStockSchema = addStockSchema;
export type RemoveStockInput = z.infer<typeof removeStockSchema>;

export const transferStockSchema = z.object({
  productId:     uuid,
  fromLocationId: uuid,
  toLocationId:   uuid,
  quantity:      qty,
  referenceNo:   z.string().max(64).optional().or(z.literal('')),
  notes:         z.string().max(500).optional().or(z.literal('')),
}).refine((v) => v.fromLocationId !== v.toLocationId, {
  message: 'Source and destination must differ',
  path: ['toLocationId'],
});
export type TransferStockInput = z.infer<typeof transferStockSchema>;
