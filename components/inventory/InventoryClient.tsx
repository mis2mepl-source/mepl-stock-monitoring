'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import type { InventoryRow, LocationRow } from '@/lib/types';
import AddStockDialog from './AddStockDialog';
import RemoveStockDialog from './RemoveStockDialog';
import TransferStockDialog from './TransferStockDialog';
import { Plus, Minus, ArrowRightLeft, Search } from 'lucide-react';

type ActionKind = 'add' | 'remove' | 'transfer' | null;

export default function InventoryClient({
  initialRows,
  locations,
}: {
  initialRows: InventoryRow[];
  locations: LocationRow[];
}) {
  const [query, setQuery] = useState('');
  const [zone, setZone] = useState<string>('all');
  const [lowOnly, setLowOnly] = useState(false);
  const [hideZero, setHideZero] = useState(true);

  const [action, setAction] = useState<ActionKind>(null);
  const [activeRow, setActiveRow] = useState<InventoryRow | null>(null);

  const zones = useMemo(() => {
    const set = new Set(initialRows.map((r) => r.zone).filter(Boolean));
    return ['all', ...[...set].sort()];
  }, [initialRows]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return initialRows.filter((r) => {
      if (hideZero && Number(r.quantity) === 0) return false;
      if (lowOnly && r.stock_status === 'ok') return false;
      if (zone !== 'all' && r.zone !== zone) return false;
      if (!q) return true;
      return (
        r.mepl_code.toLowerCase().includes(q) ||
        r.part_name.toLowerCase().includes(q) ||
        (r.description ?? '').toLowerCase().includes(q) ||
        r.location_code.toLowerCase().includes(q)
      );
    });
  }, [initialRows, query, zone, lowOnly, hideZero]);

  function openAction(kind: ActionKind, row: InventoryRow) {
    setActiveRow(row);
    setAction(kind);
  }

  return (
    <>
      <div className="flex flex-wrap gap-2 items-center">
        <div className="relative flex-1 min-w-[240px] max-w-md">
          <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-slate-400" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search code, part, description, location…"
            className="w-full pl-8 pr-3 py-2 text-sm rounded-md border border-slate-300 focus:outline-none focus:ring-2 focus:ring-slate-400"
          />
        </div>
        <select
          value={zone}
          onChange={(e) => setZone(e.target.value)}
          className="text-sm rounded-md border border-slate-300 px-2 py-2 bg-white"
        >
          {zones.map((z) => (
            <option key={z} value={z}>{z === 'all' ? 'All zones' : `Zone ${z}`}</option>
          ))}
        </select>
        <label className="text-sm flex items-center gap-1.5">
          <input type="checkbox" checked={lowOnly} onChange={(e) => setLowOnly(e.target.checked)} />
          Low stock only
        </label>
        <label className="text-sm flex items-center gap-1.5">
          <input type="checkbox" checked={hideZero} onChange={(e) => setHideZero(e.target.checked)} />
          Hide zero
        </label>
        <div className="ml-auto">
          <button
            onClick={() => { setActiveRow(null); setAction('add'); }}
            className="inline-flex items-center gap-1.5 rounded-md bg-slate-900 text-white text-sm px-3 py-2 hover:bg-slate-800"
          >
            <Plus className="h-4 w-4" /> Add stock
          </button>
        </div>
      </div>

      <div className="rounded-lg border border-slate-200 bg-white overflow-hidden">
        <div className="max-h-[70vh] overflow-auto">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 sticky top-0 border-b border-slate-200 text-left">
              <tr className="text-xs uppercase text-slate-500">
                <th className="px-3 py-2 font-medium">Code</th>
                <th className="px-3 py-2 font-medium">Part name</th>
                <th className="px-3 py-2 font-medium">Description</th>
                <th className="px-3 py-2 font-medium">Location</th>
                <th className="px-3 py-2 font-medium text-right">On hand</th>
                <th className="px-3 py-2 font-medium text-right">Reorder</th>
                <th className="px-3 py-2 font-medium">Status</th>
                <th className="px-3 py-2 font-medium sticky right-0 bg-slate-50">Actions</th>
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 && (
                <tr><td colSpan={8} className="text-center py-8 text-slate-500">No rows match your filters.</td></tr>
              )}
              {filtered.map((r) => (
                <tr key={`${r.product_id}-${r.location_id}`} className="border-b border-slate-100 hover:bg-slate-50">
                  <td className="px-3 py-2 font-mono text-xs">{r.mepl_code}</td>
                  <td className="px-3 py-2">
                    <Link href={`/products/${r.product_id}`} className="hover:underline">
                      {r.part_name}
                    </Link>
                  </td>
                  <td className="px-3 py-2 text-slate-500">{r.description || '—'}</td>
                  <td className="px-3 py-2 font-mono text-xs">{r.location_code}</td>
                  <td className="px-3 py-2 text-right tabular-nums">{Number(r.quantity).toLocaleString('en-IN')}</td>
                  <td className="px-3 py-2 text-right tabular-nums text-slate-400">
                    {r.reorder_level > 0 ? Number(r.reorder_level).toLocaleString('en-IN') : '—'}
                  </td>
                  <td className="px-3 py-2">
                    <StatusBadge status={r.stock_status} />
                  </td>
                  <td className="px-3 py-2 sticky right-0 bg-white">
                    <div className="flex gap-1">
                      <button
                        title="Add"
                        onClick={() => openAction('add', r)}
                        className="p-1 rounded hover:bg-emerald-100 text-emerald-700"
                      ><Plus className="h-4 w-4" /></button>
                      <button
                        title="Remove"
                        onClick={() => openAction('remove', r)}
                        className="p-1 rounded hover:bg-rose-100 text-rose-700"
                      ><Minus className="h-4 w-4" /></button>
                      <button
                        title="Transfer"
                        onClick={() => openAction('transfer', r)}
                        className="p-1 rounded hover:bg-sky-100 text-sky-700"
                      ><ArrowRightLeft className="h-4 w-4" /></button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {action === 'add' && (
        <AddStockDialog
          open
          onClose={() => setAction(null)}
          initialProductId={activeRow?.product_id}
          initialLocationId={activeRow?.location_id}
          locations={locations}
        />
      )}
      {action === 'remove' && activeRow && (
        <RemoveStockDialog
          open
          onClose={() => setAction(null)}
          row={activeRow}
        />
      )}
      {action === 'transfer' && activeRow && (
        <TransferStockDialog
          open
          onClose={() => setAction(null)}
          row={activeRow}
          locations={locations}
        />
      )}
    </>
  );
}

function StatusBadge({ status }: { status: 'ok' | 'low' | 'out' }) {
  const cls = status === 'out'
    ? 'bg-red-100 text-red-700'
    : status === 'low'
      ? 'bg-amber-100 text-amber-700'
      : 'bg-emerald-100 text-emerald-700';
  const label = status === 'out' ? 'Out' : status === 'low' ? 'Low' : 'OK';
  return <span className={`inline-block px-1.5 py-0.5 rounded text-xs font-medium ${cls}`}>{label}</span>;
}
