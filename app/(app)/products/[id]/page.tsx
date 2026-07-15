import { createClient } from '@/lib/supabase/server';
import { notFound } from 'next/navigation';
import Link from 'next/link';
import { format } from 'date-fns';

export const dynamic = 'force-dynamic';

export default async function ProductDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = await createClient();

  const [{ data: product }, { data: balances }, { data: movements }] = await Promise.all([
    supabase.from('products').select('*').eq('id', id).maybeSingle(),
    supabase.from('v_inventory').select('*').eq('product_id', id).order('location_code'),
    supabase
      .from('stock_movements')
      .select('id, movement_type, quantity, performed_at, reference_no, notes, location_id, to_location_id, locations!stock_movements_location_id_fkey(code), to_location:locations!stock_movements_to_location_id_fkey(code)')
      .eq('product_id', id)
      .order('performed_at', { ascending: false })
      .limit(200),
  ]);

  if (!product) notFound();

  const total = (balances ?? []).reduce((s, b: any) => s + Number(b.quantity), 0);

  return (
    <div className="p-6 space-y-6 max-w-5xl">
      <div>
        <Link href="/inventory" className="text-sm text-slate-500 hover:underline">← Back to inventory</Link>
        <h1 className="text-2xl font-semibold mt-1">
          <span className="font-mono text-slate-500">{product.mepl_code}</span> {product.part_name}
        </h1>
        <div className="text-sm text-slate-500 mt-1">
          {product.description && <span>{product.description}</span>}
          {product.dimensions && <span> · {product.dimensions}</span>}
          <span> · Unit: {product.unit}</span>
          {product.reorder_level > 0 && <span> · Reorder at {product.reorder_level}</span>}
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Kpi label="Total on hand" value={total.toLocaleString('en-IN')} />
        <Kpi label="Locations" value={(balances ?? []).filter((b: any) => Number(b.quantity) > 0).length} />
        <Kpi label="Reorder level" value={Number(product.reorder_level).toLocaleString('en-IN')} />
      </div>

      <section>
        <h2 className="text-sm font-semibold mb-2">Per-location balance</h2>
        <div className="rounded-lg border border-slate-200 bg-white overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 border-b border-slate-200 text-xs uppercase text-slate-500 text-left">
              <tr>
                <th className="px-3 py-2 font-medium">Location</th>
                <th className="px-3 py-2 font-medium text-right">Quantity</th>
                <th className="px-3 py-2 font-medium">Updated</th>
              </tr>
            </thead>
            <tbody>
              {(balances ?? []).map((b: any) => (
                <tr key={b.location_id} className="border-b border-slate-100">
                  <td className="px-3 py-2 font-mono text-xs">{b.location_code}</td>
                  <td className="px-3 py-2 text-right tabular-nums">{Number(b.quantity).toLocaleString('en-IN')}</td>
                  <td className="px-3 py-2 text-slate-500 text-xs">{format(new Date(b.updated_at), 'dd MMM yyyy, HH:mm')}</td>
                </tr>
              ))}
              {(balances ?? []).length === 0 && (
                <tr><td colSpan={3} className="text-center py-6 text-slate-500">No stock at any location.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </section>

      <section>
        <h2 className="text-sm font-semibold mb-2">Movement history</h2>
        <div className="rounded-lg border border-slate-200 bg-white overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 border-b border-slate-200 text-xs uppercase text-slate-500 text-left">
              <tr>
                <th className="px-3 py-2 font-medium">When</th>
                <th className="px-3 py-2 font-medium">Type</th>
                <th className="px-3 py-2 font-medium">Location</th>
                <th className="px-3 py-2 font-medium text-right">Qty</th>
                <th className="px-3 py-2 font-medium">Reference</th>
                <th className="px-3 py-2 font-medium">Notes</th>
              </tr>
            </thead>
            <tbody>
              {(movements ?? []).map((m: any) => (
                <tr key={m.id} className="border-b border-slate-100">
                  <td className="px-3 py-2 text-slate-500 text-xs whitespace-nowrap">
                    {format(new Date(m.performed_at), 'dd MMM yy HH:mm')}
                  </td>
                  <td className="px-3 py-2">
                    <span className={`inline-block px-1.5 py-0.5 rounded text-xs font-medium ${typeClass(m.movement_type)}`}>
                      {m.movement_type}
                    </span>
                  </td>
                  <td className="px-3 py-2 font-mono text-xs">
                    {m.locations?.code}
                    {m.to_location?.code && <> → {m.to_location.code}</>}
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums">{Number(m.quantity).toLocaleString('en-IN')}</td>
                  <td className="px-3 py-2 text-slate-500 text-xs">{m.reference_no || '—'}</td>
                  <td className="px-3 py-2 text-slate-500 text-xs">{m.notes || ''}</td>
                </tr>
              ))}
              {(movements ?? []).length === 0 && (
                <tr><td colSpan={6} className="text-center py-6 text-slate-500">No movements yet.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}

function Kpi({ label, value }: { label: string; value: number | string }) {
  return (
    <div className="rounded-lg border border-slate-200 bg-white p-4">
      <div className="text-xs text-slate-500">{label}</div>
      <div className="text-xl font-semibold mt-1">{value}</div>
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
