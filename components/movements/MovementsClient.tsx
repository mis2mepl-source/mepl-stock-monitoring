'use client';

import { useRouter, usePathname } from 'next/navigation';
import { useState, useTransition } from 'react';
import Link from 'next/link';
import { format } from 'date-fns';
import { Download, Search, X } from 'lucide-react';
import { toast } from 'sonner';
import type { LocationRow } from '@/lib/types';
import type { MovementRow } from '@/app/(app)/movements/page';
import { exportMovementsCsv } from '@/lib/actions/movements-export';

type Filters = {
  from?: string;
  to?: string;
  type?: string;
  locationId?: string;
  search?: string;
};

export default function MovementsClient({
  initialRows,
  locations,
  currentFilters,
}: {
  initialRows: MovementRow[];
  locations: LocationRow[];
  currentFilters: Filters;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const [isExporting, startExport] = useTransition();

  // Local state for form inputs; commit to URL on Apply
  const [from, setFrom] = useState(currentFilters.from ?? '');
  const [to, setTo] = useState(currentFilters.to ?? '');
  const [type, setType] = useState(currentFilters.type ?? '');
  const [locationId, setLocationId] = useState(currentFilters.locationId ?? '');
  const [search, setSearch] = useState(currentFilters.search ?? '');

  function applyFilters() {
    const params = new URLSearchParams();
    if (from) params.set('from', from);
    if (to) params.set('to', to);
    if (type) params.set('type', type);
    if (locationId) params.set('location', locationId);
    if (search) params.set('q', search);
    const qs = params.toString();
    router.push(qs ? `${pathname}?${qs}` : pathname);
  }

  function clearFilters() {
    setFrom('');
    setTo('');
    setType('');
    setLocationId('');
    setSearch('');
    router.push(pathname);
  }

  function handleExport() {
    startExport(async () => {
      const res = await exportMovementsCsv({ from, to, type, locationId, search });
      if (!res.ok) {
        toast.error(res.error);
        return;
      }
      const blob = new Blob([res.csv], { type: 'text/csv;charset=utf-8;' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `movements-${format(new Date(), 'yyyy-MM-dd-HHmm')}.csv`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      toast.success(`Exported ${res.count} rows`);
    });
  }

  const hasFilters = !!(from || to || type || locationId || search);

  return (
    <>
      <div className="rounded-lg border border-slate-200 bg-white p-4 space-y-3">
        <div className="grid grid-cols-2 md:grid-cols-6 gap-2 items-end">
          <Field label="From">
            <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className={input} />
          </Field>
          <Field label="To">
            <input type="date" value={to} onChange={(e) => setTo(e.target.value)} className={input} />
          </Field>
          <Field label="Type">
            <select value={type} onChange={(e) => setType(e.target.value)} className={input}>
              <option value="">All</option>
              <option value="IN">IN</option>
              <option value="OUT">OUT</option>
              <option value="TRANSFER">TRANSFER</option>
              <option value="ADJUSTMENT">ADJUSTMENT</option>
              <option value="OPENING">OPENING</option>
            </select>
          </Field>
          <Field label="Location">
            <select value={locationId} onChange={(e) => setLocationId(e.target.value)} className={input}>
              <option value="">All</option>
              {locations.map((l) => (
                <option key={l.id} value={l.id}>{l.code}</option>
              ))}
            </select>
          </Field>
          <Field label="Product or reference">
            <div className="relative">
              <Search className="absolute left-2 top-1.5 h-4 w-4 text-slate-400" />
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && applyFilters()}
                placeholder="Code, part, ref"
                className={`${input} pl-7`}
              />
            </div>
          </Field>
          <div className="flex gap-1">
            <button
              onClick={applyFilters}
              className="flex-1 rounded-md bg-slate-900 text-white text-sm px-3 py-1.5 hover:bg-slate-800"
            >
              Apply
            </button>
            {hasFilters && (
              <button
                onClick={clearFilters}
                title="Clear filters"
                className="rounded-md border border-slate-300 px-2 py-1.5 hover:bg-slate-50"
              >
                <X className="h-4 w-4" />
              </button>
            )}
          </div>
        </div>
        <div className="flex justify-end">
          <button
            onClick={handleExport}
            disabled={isExporting}
            className="inline-flex items-center gap-1.5 rounded-md border border-slate-300 bg-white text-sm px-3 py-1.5 hover:bg-slate-50 disabled:opacity-50"
          >
            <Download className="h-4 w-4" />
            {isExporting ? 'Exporting…' : 'Export CSV'}
          </button>
        </div>
      </div>

      <div className="rounded-lg border border-slate-200 bg-white overflow-hidden">
        <div className="max-h-[70vh] overflow-auto">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 sticky top-0 border-b border-slate-200 text-left">
              <tr className="text-xs uppercase text-slate-500">
                <th className="px-3 py-2 font-medium">When</th>
                <th className="px-3 py-2 font-medium">Type</th>
                <th className="px-3 py-2 font-medium">Code</th>
                <th className="px-3 py-2 font-medium">Part name</th>
                <th className="px-3 py-2 font-medium">Location</th>
                <th className="px-3 py-2 font-medium text-right">Qty</th>
                <th className="px-3 py-2 font-medium">Reference</th>
                <th className="px-3 py-2 font-medium">Notes</th>
              </tr>
            </thead>
            <tbody>
              {initialRows.length === 0 && (
                <tr>
                  <td colSpan={8} className="text-center py-8 text-slate-500">
                    No movements match your filters.
                  </td>
                </tr>
              )}
              {initialRows.map((m) => (
                <tr key={m.id} className="border-b border-slate-100 hover:bg-slate-50">
                  <td className="px-3 py-2 text-xs text-slate-500 whitespace-nowrap">
                    {format(new Date(m.performed_at), 'dd MMM yy HH:mm')}
                  </td>
                  <td className="px-3 py-2">
                    <span className={`inline-block px-1.5 py-0.5 rounded text-xs font-medium ${typeClass(m.movement_type)}`}>
                      {m.movement_type}
                    </span>
                  </td>
                  <td className="px-3 py-2 font-mono text-xs">{m.products?.mepl_code ?? '—'}</td>
                  <td className="px-3 py-2">
                    <Link href={`/products/${m.product_id}`} className="hover:underline">
                      {m.products?.part_name ?? '—'}
                    </Link>
                  </td>
                  <td className="px-3 py-2 font-mono text-xs">
                    {m.locations?.code}
                    {m.to_location?.code && <> → {m.to_location.code}</>}
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums">
                    {Number(m.quantity).toLocaleString('en-IN')}
                  </td>
                  <td className="px-3 py-2 text-slate-500 text-xs">{m.reference_no || '—'}</td>
                  <td className="px-3 py-2 text-slate-500 text-xs max-w-xs truncate">{m.notes || ''}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </>
  );
}

const input =
  'w-full text-sm rounded-md border border-slate-300 px-2 py-1.5 focus:outline-none focus:ring-2 focus:ring-slate-400 bg-white';

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="text-xs font-medium text-slate-600">{label}</label>
      <div className="mt-0.5">{children}</div>
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
