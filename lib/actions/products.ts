'use server';

import { revalidatePath } from 'next/cache';
import { createClient } from '@/lib/supabase/server';
import { createProductSchema, type CreateProductInput } from '@/lib/schemas/products';

type Result = { ok: true; productId: string } | { ok: false; error: string };

async function requireAdmin(): Promise<string> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error('Not authenticated');
  const { data: profile } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .maybeSingle();
  if (profile?.role !== 'admin') throw new Error('Admin role required to create products');
  return user.id;
}

export async function createProduct(input: CreateProductInput): Promise<Result> {
  const parsed = createProductSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0].message };

  let userId: string;
  try {
    userId = await requireAdmin();
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'Auth check failed' };
  }

  const supabase = await createClient();
  const d = parsed.data;

  const { data: product, error: prodErr } = await supabase
    .from('products')
    .insert({
      mepl_code: d.meplCode.toUpperCase(),
      part_name: d.partName,
      description: d.description || null,
      dimensions: d.dimensions || null,
      unit: d.unit,
      reorder_level: d.reorderLevel,
    })
    .select('id')
    .single();

  if (prodErr) {
    if (prodErr.code === '23505') {
      return {
        ok: false,
        error: 'A product with this code, part name, and dimensions already exists.',
      };
    }
    return { ok: false, error: prodErr.message };
  }

  // Optional opening stock — post as OPENING movement, trigger updates balance
  if (d.openingLocationId && d.openingQuantity && d.openingQuantity > 0) {
    const { error: moveErr } = await supabase.from('stock_movements').insert({
      product_id: product.id,
      location_id: d.openingLocationId,
      movement_type: 'OPENING',
      quantity: d.openingQuantity,
      reference_no: d.openingReferenceNo || null,
      notes: d.openingNotes || 'Initial stock at product creation',
      performed_by: userId,
    });
    if (moveErr) {
      // Product was created; only the opening movement failed. Surface that clearly.
      return {
        ok: false,
        error: `Product created, but opening stock failed: ${moveErr.message}. Add stock manually from the inventory page.`,
      };
    }
  }

  revalidatePath('/inventory');
  revalidatePath('/');
  return { ok: true, productId: product.id };
}
