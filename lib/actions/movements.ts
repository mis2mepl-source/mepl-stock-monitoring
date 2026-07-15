'use server';

import { revalidatePath } from 'next/cache';
import { createClient } from '@/lib/supabase/server';
import {
  addStockSchema,
  removeStockSchema,
  transferStockSchema,
  type AddStockInput,
  type RemoveStockInput,
  type TransferStockInput,
} from '@/lib/schemas/movements';

type Result = { ok: true } | { ok: false; error: string };

async function currentUserId(): Promise<string> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error('Not authenticated');
  return user.id;
}

function humanizeError(msg: string): string {
  if (/quantity.*non-negative|quantity_check|check constraint/i.test(msg)) {
    return 'That would leave stock below zero. Check the current balance.';
  }
  return msg;
}

export async function addStock(input: AddStockInput): Promise<Result> {
  const parsed = addStockSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0].message };

  const supabase = await createClient();
  const performedBy = await currentUserId();

  const { error } = await supabase.from('stock_movements').insert({
    product_id:   parsed.data.productId,
    location_id:  parsed.data.locationId,
    movement_type: 'IN',
    quantity:     parsed.data.quantity,
    reference_no: parsed.data.referenceNo || null,
    notes:        parsed.data.notes || null,
    performed_by: performedBy,
  });
  if (error) return { ok: false, error: humanizeError(error.message) };

  revalidatePath('/inventory');
  revalidatePath(`/products/${parsed.data.productId}`);
  revalidatePath('/movements');
  return { ok: true };
}

export async function removeStock(input: RemoveStockInput): Promise<Result> {
  const parsed = removeStockSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0].message };

  const supabase = await createClient();
  const performedBy = await currentUserId();

  const { data: balance } = await supabase
    .from('inventory_balances')
    .select('quantity')
    .eq('product_id',  parsed.data.productId)
    .eq('location_id', parsed.data.locationId)
    .maybeSingle();

  const available = Number(balance?.quantity ?? 0);
  if (available < parsed.data.quantity) {
    return {
      ok: false,
      error: `Only ${available} available at this location — cannot remove ${parsed.data.quantity}.`,
    };
  }

  const { error } = await supabase.from('stock_movements').insert({
    product_id:   parsed.data.productId,
    location_id:  parsed.data.locationId,
    movement_type: 'OUT',
    quantity:     parsed.data.quantity,
    reference_no: parsed.data.referenceNo || null,
    notes:        parsed.data.notes || null,
    performed_by: performedBy,
  });
  if (error) return { ok: false, error: humanizeError(error.message) };

  revalidatePath('/inventory');
  revalidatePath(`/products/${parsed.data.productId}`);
  revalidatePath('/movements');
  return { ok: true };
}

export async function transferStock(input: TransferStockInput): Promise<Result> {
  const parsed = transferStockSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0].message };

  const supabase = await createClient();
  const performedBy = await currentUserId();

  const { data: balance } = await supabase
    .from('inventory_balances')
    .select('quantity')
    .eq('product_id',  parsed.data.productId)
    .eq('location_id', parsed.data.fromLocationId)
    .maybeSingle();

  const available = Number(balance?.quantity ?? 0);
  if (available < parsed.data.quantity) {
    return {
      ok: false,
      error: `Only ${available} available at source location — cannot transfer ${parsed.data.quantity}.`,
    };
  }

  const { error } = await supabase.from('stock_movements').insert({
    product_id:      parsed.data.productId,
    location_id:     parsed.data.fromLocationId,
    to_location_id:  parsed.data.toLocationId,
    movement_type:   'TRANSFER',
    quantity:        parsed.data.quantity,
    reference_no:    parsed.data.referenceNo || null,
    notes:           parsed.data.notes || null,
    performed_by:    performedBy,
  });
  if (error) return { ok: false, error: humanizeError(error.message) };

  revalidatePath('/inventory');
  revalidatePath(`/products/${parsed.data.productId}`);
  revalidatePath('/movements');
  return { ok: true };
}
