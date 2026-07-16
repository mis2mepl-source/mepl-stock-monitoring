import { createClient } from '@/lib/supabase/server';
import { redirect } from 'next/navigation';
import LocationsClient from '@/components/locations/LocationsClient';

export const dynamic = 'force-dynamic';

export type LocationWithStats = {
  id: string;
  code: string;
  zone: string | null;
  description: string | null;
  is_active: boolean;
  product_count: number;
  total_quantity: number;
};

export default async function LocationsPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const { data: profile } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .maybeSingle();
  if (profile?.role !== 'admin') redirect('/inventory');

  const { data: locations } = await supabase.from('locations').select('*').order('code');

  // Aggregate stats per location: product count and total quantity
  const { data: balances } = await supabase
    .from('inventory_balances')
    .select('location_id, quantity')
    .gt('quantity', 0);

  const statsByLocation = new Map<string, { count: number; total: number }>();
  for (const b of balances ?? []) {
    const prev = statsByLocation.get(b.location_id as string) ?? { count: 0, total: 0 };
    prev.count += 1;
    prev.total += Number(b.quantity);
    statsByLocation.set(b.location_id as string, prev);
  }

  const rows: LocationWithStats[] = (locations ?? []).map((l) => {
    const stats = statsByLocation.get(l.id) ?? { count: 0, total: 0 };
    return {
      id: l.id,
      code: l.code,
      zone: l.zone,
      description: l.description,
      is_active: l.is_active,
      product_count: stats.count,
      total_quantity: stats.total,
    };
  });

  return (
    <div className="p-6 space-y-4 max-w-5xl">
      <div>
        <h1 className="text-2xl font-semibold">Locations</h1>
        <p className="text-sm text-slate-500">Bins, shelves, pallets. Admin only.</p>
      </div>
      <LocationsClient initialRows={rows} />
    </div>
  );
}
