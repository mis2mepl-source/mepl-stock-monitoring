'use server';

import { revalidatePath } from 'next/cache';
import { createClient } from '@/lib/supabase/server';
import {
  createLocationSchema,
  updateLocationSchema,
  toggleLocationSchema,
  type CreateLocationInput,
  type UpdateLocationInput,
  type ToggleLocationInput,
} from '@/lib/schemas/locations';

type Result = { ok: true } | { ok: false; error: string };

async function requireAdmin(): Promise<void> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error('Not authenticated');
  const { data: profile } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .maybeSingle();
  if (profile?.role !== 'admin') throw new Error('Admin role required');
}

export async function createLocation(input: CreateLocationInput): Promise<Result> {
  const parsed = createLocationSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0].message };

  try {
    await requireAdmin();
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'Auth check failed' };
  }

  const supabase = await createClient();
  const { error } = await supabase.from('locations').insert({
    code: parsed.data.code.toUpperCase(),
    description: parsed.data.description || null,
  });

  if (error) {
    if (error.code === '23505') return { ok: false, error: `Location "${parsed.data.code}" already exists.` };
    return { ok: false, error: error.message };
  }

  revalidatePath('/locations');
  revalidatePath('/inventory');
  return { ok: true };
}

export async function updateLocation(input: UpdateLocationInput): Promise<Result> {
  const parsed = updateLocationSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0].message };

  try {
    await requireAdmin();
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'Auth check failed' };
  }

  const supabase = await createClient();
  const { error } = await supabase
    .from('locations')
    .update({ description: parsed.data.description || null })
    .eq('id', parsed.data.id);

  if (error) return { ok: false, error: error.message };
  revalidatePath('/locations');
  return { ok: true };
}

export async function toggleLocationActive(input: ToggleLocationInput): Promise<Result> {
  const parsed = toggleLocationSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0].message };

  try {
    await requireAdmin();
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'Auth check failed' };
  }

  const supabase = await createClient();

  // Safety: don't allow deactivating a location that still has non-zero stock
  if (!parsed.data.isActive) {
    const { data: balances } = await supabase
      .from('inventory_balances')
      .select('quantity')
      .eq('location_id', parsed.data.id)
      .gt('quantity', 0)
      .limit(1);
    if (balances && balances.length > 0) {
      return {
        ok: false,
        error: 'Cannot deactivate — this location still has stock. Transfer or remove it first.',
      };
    }
  }

  const { error } = await supabase
    .from('locations')
    .update({ is_active: parsed.data.isActive })
    .eq('id', parsed.data.id);

  if (error) return { ok: false, error: error.message };
  revalidatePath('/locations');
  revalidatePath('/inventory');
  return { ok: true };
}
