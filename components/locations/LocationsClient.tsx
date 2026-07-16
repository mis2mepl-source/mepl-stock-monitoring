'use client';

import { useState, useTransition } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { toast } from 'sonner';
import { Plus, Check, X, Edit2, Power } from 'lucide-react';
import { createLocationSchema, type CreateLocationInput } from '@/lib/schemas/locations';
import { createLocation, updateLocation, toggleLocationActive } from '@/lib/actions/locations';
import type { LocationWithStats } from '@/app/(app)/locations/page';

export default function LocationsClient({ initialRows }: { initialRows: LocationWithStats[] }) {
  const [showActive, setShowActive] = useState(true);
  const [showInactive, setShowInactive] = useState(false);
  const filtered = initialRows.filter((r) => (r.is_active ? showActive : showInactive));

  return (
    <>
      <NewLocationForm />

      <div className="rounded-lg border border-slate-200 bg-white p-3 flex gap-4 text-sm">
        <label className="flex items-center gap-1.5">
          <input type="checkbox" checked={showActive} onChange={(e) => setShowActive(e.target.checked)} />
          Active ({initialRows.filter((r) => r.is_active).length})
        </label>
        <label className="flex items-center gap-1.5">
          <input type="checkbox" checked={showInactive} onChange={(e) => setShowInactive(e.target.checked)} />
          Inactive ({initialRows.filter((r) => !r.is_active).length})
        </label>
      </div>

      <div className="rounded-lg border border-slate-200 bg-white overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 border-b border-slate-200 text-left">
            <tr className="text-xs uppercase text-slate-500">
              <th className="px-3 py-2 font-medium">Code</th>
              <th className="px-3 py-2 font-medium">Zone</th>
              <th className="px-3 py-2 font-medium">Description</th>
              <th className="px-3 py-2 font-medium text-right">SKUs</th>
              <th className="px-3 py-2 font-medium text-right">Total qty</th>
              <th className="px-3 py-2 font-medium">Status</th>
              <th className="px-3 py-2 font-medium text-right">Actions</th>
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 && (
              <tr>
                <td colSpan={7} className="text-center py-6 text-slate-500">
                  No locations to show.
                </td>
              </tr>
            )}
            {filtered.map((r) => (
              <LocationRow key={r.id} row={r} />
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}

function LocationRow({ row }: { row: LocationWithStats }) {
  const [editing, setEditing] = useState(false);
  const [desc, setDesc] = useState(row.description ?? '');
  const [isPending, startTransition] = useTransition();

  function save() {
    startTransition(async () => {
      const res = await updateLocation({ id: row.id, description: desc });
      if (res.ok) {
        toast.success('Updated');
        setEditing(false);
      } else {
        toast.error(res.error);
      }
    });
  }

  function toggle() {
    startTransition(async () => {
      const res = await toggleLocationActive({ id: row.id, isActive: !row.is_active });
      if (res.ok) toast.success(row.is_active ? 'Deactivated' : 'Activated');
      else toast.error(res.error);
    });
  }

  return (
    <tr className="border-b border-slate-100 hover:bg-slate-50">
      <td className="px-3 py-2 font-mono text-xs">{row.code}</td>
      <td className="px-3 py-2 text-slate-500 text-xs">{row.zone ?? '—'}</td>
      <td className="px-3 py-2">
        {editing ? (
          <div className="flex gap-1">
            <input
              value={desc}
              onChange={(e) => setDesc(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') save();
                if (e.key === 'Escape') { setEditing(false); setDesc(row.description ?? ''); }
              }}
              autoFocus
              className="flex-1 text-sm rounded-md border border-slate-300 px-2 py-1 focus:outline-none focus:ring-2 focus:ring-slate-400"
            />
            <button onClick={save} disabled={isPending} className="p-1 rounded hover:bg-emerald-100 text-emerald-700" title="Save">
              <Check className="h-4 w-4" />
            </button>
            <button
              onClick={() => { setEditing(false); setDesc(row.description ?? ''); }}
              className="p-1 rounded hover:bg-slate-200 text-slate-600"
              title="Cancel"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        ) : (
          <span className="text-slate-600">{row.description || '—'}</span>
        )}
      </td>
      <td className="px-3 py-2 text-right tabular-nums text-slate-500">{row.product_count}</td>
      <td className="px-3 py-2 text-right tabular-nums text-slate-500">
        {row.total_quantity.toLocaleString('en-IN')}
      </td>
      <td className="px-3 py-2">
        <span
          className={`inline-block px-1.5 py-0.5 rounded text-xs font-medium ${
            row.is_active ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-200 text-slate-600'
          }`}
        >
          {row.is_active ? 'Active' : 'Inactive'}
        </span>
      </td>
      <td className="px-3 py-2 text-right">
        <div className="inline-flex gap-1">
          {!editing && (
            <button
              onClick={() => setEditing(true)}
              className="p-1 rounded hover:bg-slate-100 text-slate-600"
              title="Edit description"
            >
              <Edit2 className="h-4 w-4" />
            </button>
          )}
          <button
            onClick={toggle}
            disabled={isPending}
            className={`p-1 rounded ${
              row.is_active ? 'hover:bg-rose-100 text-rose-700' : 'hover:bg-emerald-100 text-emerald-700'
            }`}
            title={row.is_active ? 'Deactivate' : 'Activate'}
          >
            <Power className="h-4 w-4" />
          </button>
        </div>
      </td>
    </tr>
  );
}

function NewLocationForm() {
  const [isPending, startTransition] = useTransition();
  const [open, setOpen] = useState(false);
  const {
    register,
    handleSubmit,
    formState: { errors },
    reset,
  } = useForm<CreateLocationInput>({
    resolver: zodResolver(createLocationSchema),
    defaultValues: { code: '', description: '' },
  });

  function onSubmit(data: CreateLocationInput) {
    startTransition(async () => {
      const res = await createLocation(data);
      if (res.ok) {
        toast.success('Location added');
        reset();
        setOpen(false);
      } else {
        toast.error(res.error);
      }
    });
  }

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="inline-flex items-center gap-1.5 rounded-md bg-slate-900 text-white text-sm px-3 py-2 hover:bg-slate-800"
      >
        <Plus className="h-4 w-4" /> New location
      </button>
    );
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="rounded-lg border border-slate-200 bg-white p-4 space-y-3">
      <h2 className="text-sm font-semibold text-slate-700">New location</h2>
      <div className="grid grid-cols-3 gap-3">
        <div>
          <label className="text-xs font-medium text-slate-700">Code *</label>
          <input
            {...register('code')}
            placeholder="A34"
            autoFocus
            className="mt-1 w-full text-sm rounded-md border border-slate-300 px-2.5 py-1.5 focus:outline-none focus:ring-2 focus:ring-slate-400"
          />
          {errors.code && <p className="mt-1 text-xs text-red-600">{errors.code.message}</p>}
        </div>
        <div className="col-span-2">
          <label className="text-xs font-medium text-slate-700">Description</label>
          <input
            {...register('description')}
            placeholder="e.g. Row A, rack 34"
            className="mt-1 w-full text-sm rounded-md border border-slate-300 px-2.5 py-1.5 focus:outline-none focus:ring-2 focus:ring-slate-400"
          />
          {errors.description && <p className="mt-1 text-xs text-red-600">{errors.description.message}</p>}
        </div>
      </div>
      <div className="flex justify-end gap-2">
        <button
          type="button"
          onClick={() => { reset(); setOpen(false); }}
          className="text-sm px-3 py-1.5 rounded-md border border-slate-300 hover:bg-slate-50"
        >
          Cancel
        </button>
        <button
          type="submit"
          disabled={isPending}
          className="text-sm px-3 py-1.5 rounded-md bg-slate-900 text-white hover:bg-slate-800 disabled:opacity-50"
        >
          {isPending ? 'Adding…' : 'Add location'}
        </button>
      </div>
    </form>
  );
}
