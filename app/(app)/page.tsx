import { createClient } from '@/lib/supabase/server';
import Link from 'next/link';
import { formatDistanceToNow } from 'date-fns';

export const dynamic = 'force-dynamic';

export default async function DashboardPage() {
  const supabase = await createClient();

  const [
    { count: skuCount },
    { data: totals },
    { data: lowStock },
    { data: recent },
  ] = await Promise.all([
    supabase.from('products').select('*', { count: 'exact', head: true }).eq('is_active', true),
    supabase.from('v_sku_totals').select('total_quantity'),
    supabase.from('v_inventory')
      .select('product_id, location_id, mepl_code, part_name, location_code, quantity, reorder_level, stock_status')
      .eq('stock_status', 'low')
      .order('quantity', { ascending: true })
      .limit(10),
    supabase.from('stock_movements')
      .select('id, movement_type, quantity, performed_at, product_id, location_id, products(mepl_code, part_name), locations!stock_movements_location_id_fkey(code)')
      .order('performed_at', { ascending: false })
      .limit(8),
  ]);

  const totalOnHand = (totals ?? []).reduce((sum, r: any) => sum + Number(r.total_quantity), 0);

  return (
    <div className="p-6 space-y-6 max-w-6xl">
      <h1 className="text-2xl font-semibold">Dashboard</h1>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <KpiCard label="Active SKUs" value={skuCount ?? 0} />
        <KpiCard label="Total on hand" value={totalOnHand.toLocaleString('en-IN')} />
        <KpiCard label="Low stock alerts" value={(lowStock ?? []).length} accent={lowStock?.length ? 'amber' : undefined} />
        <KpiCard label="Recent movements" value={(recent ?? []).length} />
      </div>

      <section className="grid md:grid-cols-2 gap-4">
        <Card title="Low stock">
          {(lowStock ?? []).length === 0 ? (
            <p className="text-sm text-slate-500">Nothing under the reorder level.</p>
          ) : (
            <ul className="divide-y divide-slate-100 text-sm">
              {lowStock!.map((r: any) => (
                <li key={`${r.product_id}-${r.location_id}`} className="py-2 flex justify-between">
                  <Link href={`/products/${r.product_id}`} className="hover:underline">
                    <span className="font-medium">{r.mepl_code}</span>{' '}
                    <span className="text-slate-600">{r.part_name}</span>{' '}
                    <span className="text-slate-400">@ {r.location_code}</span>
                  </Link>
                  <span className="text-amber-700">{Number(r.quantity).toLocaleString('en-IN')} / {Number(r.reorder_level).toLocaleString('en-IN')}</span>
                </li>
              ))}
            </ul>
          )}
        </Card>

        <Card title="Recent movements">
          {(recent ?? []).length === 0 ? (
            <p className="text-sm text-slate-500">No movements yet.</p>
          ) : (
            <ul className="divide-y divide-slate-100 text-sm">
              {recent!.map((m: any) => (
                <li key={m.id} className="py-2 flex justify-between items-baseline">
                  <div>
                    <span className={`inline-block px-1.5 py-0.5 rounded text-xs font-medium mr-2 ${typeClass(m.movement_type)}`}>
                      {m.movement_type}
                    </span>
                    <span className="font-medium">{m.products?.mepl_code}</span>{' '}
                    <span className="text-slate-600">{m.products?.part_name}</span>{' '}
                    <span className="text-slate-400">@ {m.locations?.code}</span>
                  </div>
                  <div className="text-right">
                    <div>{Number(m.quantity).toLocaleString('en-IN')}</div>
                    <div className="text-xs text-slate-400">{formatDistanceToNow(new Date(m.performed_at), { addSuffix: true })}</div>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </section>
    </div>
  );
}

function KpiCard({ label, value, accent }: { label: string; value: number | string; accent?: 'amber' | 'red' }) {
  const tone =
    accent === 'amber' ? 'text-amber-700 bg-amber-50 border-amber-200'
    : accent === 'red' ? 'text-red-700 bg-red-50 border-red-200'
    : 'text-slate-900 bg-white border-slate-200';
  return (
    <div className={`rounded-lg border p-4 ${tone}`}>
      <div className="text-xs text-slate-500">{label}</div>
      <div className="text-2xl font-semibold mt-1">{value}</div>
    </div>
  );
}

function Card({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-lg border border-slate-200 bg-white p-4">
      <h2 className="text-sm font-semibold mb-3">{title}</h2>
      {children}
    </div>
  );
}

function typeClass(t: string) {
  return {
    IN: 'bg-emerald-100 text-emerald-700',
    OUT: 'bg-rose-100 text-rose-700',
    TRANSFER: 'bg-sky-100 text-sky-700',
    ADJUSTMENT: 'bg-amber-100 text-amber-700',
    OPENING: 'bg-slate-200 text-slate-700',
  }[t] ?? 'bg-slate-100 text-slate-700';
}
