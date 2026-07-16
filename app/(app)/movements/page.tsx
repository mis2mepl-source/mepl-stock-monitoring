import { createClient } from '@/lib/supabase/server';
import MovementsClient from '@/components/movements/MovementsClient';
import type { LocationRow } from '@/lib/types';

export const dynamic = 'force-dynamic';

type SearchParams = { [key: string]: string | string[] | undefined };

const MOVEMENT_TYPES = ['IN', 'OUT', 'TRANSFER', 'ADJUSTMENT', 'OPENING'] as const;
const MAX_ROWS = 500;

function firstOf(v: string | string[] | undefined): string | undefined {
  if (Array.isArray(v)) return v[0];
  return v;
}

export default async function MovementsPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const params = await searchParams;
  const from = firstOf(params.from);
  const to = firstOf(params.to);
  const type = firstOf(params.type);
  const locationId = firstOf(params.location);
  const search = firstOf(params.q);

  const supabase = await createClient();

  let query = supabase
    .from('stock_movements')
    .select(
      `
      id, movement_type, quantity, reference_no, notes, performed_at,
      product_id, location_id, to_location_id,
      products(mepl_code, part_name),
      locations!stock_movements_location_id_fkey(code),
      to_location:locations!stock_movements_to_location_id_fkey(code)
    `,
      { count: 'exact' },
    )
    .order('performed_at', { ascending: false })
    .limit(MAX_ROWS);

  if (from) query = query.gte('performed_at', `${from}T00:00:00`);
  if (to) query = query.lte('performed_at', `${to}T23:59:59`);
  if (type && MOVEMENT_TYPES.includes(type as (typeof MOVEMENT_TYPES)[number])) {
    query = query.eq('movement_type', type);
  }
  if (locationId) {
    query = query.or(`location_id.eq.${locationId},to_location_id.eq.${locationId}`);
  }

  const { data: rows, count } = await query;

  const { data: locations } = await supabase
    .from('locations')
    .select('*')
    .eq('is_active', true)
    .order('code');

  // Client-side product search filter (over what we fetched)
  const filtered = search
    ? (rows ?? []).filter((m: any) => {
        const q = search.toLowerCase();
        return (
          (m.products?.mepl_code ?? '').toLowerCase().includes(q) ||
          (m.products?.part_name ?? '').toLowerCase().includes(q) ||
          (m.reference_no ?? '').toLowerCase().includes(q)
        );
      })
    : rows ?? [];

  return (
    <div className="p-6 space-y-4">
      <div className="flex items-baseline justify-between">
        <h1 className="text-2xl font-semibold">Movements</h1>
        <p className="text-sm text-slate-500">
          {filtered.length} shown
          {typeof count === 'number' && count > MAX_ROWS && ` of ${count.toLocaleString('en-IN')} (refine filters to see more)`}
        </p>
      </div>
      <MovementsClient
        initialRows={filtered as unknown as MovementRow[]}
        locations={(locations ?? []) as LocationRow[]}
        currentFilters={{ from, to, type, locationId, search }}
      />
    </div>
  );
}

export type MovementRow = {
  id: string;
  movement_type: 'IN' | 'OUT' | 'TRANSFER' | 'ADJUSTMENT' | 'OPENING';
  quantity: number;
  reference_no: string | null;
  notes: string | null;
  performed_at: string;
  product_id: string;
  location_id: string;
  to_location_id: string | null;
  products: { mepl_code: string; part_name: string } | null;
  locations: { code: string } | null;
  to_location: { code: string } | null;
};
