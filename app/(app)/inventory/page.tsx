import { createClient } from '@/lib/supabase/server';
import InventoryClient from '@/components/inventory/InventoryClient';
import type { InventoryRow, LocationRow } from '@/lib/types';

export const dynamic = 'force-dynamic';

export default async function InventoryPage() {
  const supabase = await createClient();

  const [{ data: rows }, { data: locations }] = await Promise.all([
    supabase.from('v_inventory').select('*').order('mepl_code').order('location_code'),
    supabase.from('locations').select('*').eq('is_active', true).order('code'),
  ]);

  return (
    <div className="p-6 space-y-4">
      <div className="flex items-baseline justify-between">
        <h1 className="text-2xl font-semibold">Inventory</h1>
        <p className="text-sm text-slate-500">{(rows ?? []).length} rows</p>
      </div>
      <InventoryClient
        initialRows={(rows ?? []) as InventoryRow[]}
        locations={(locations ?? []) as LocationRow[]}
      />
    </div>
  );
}
