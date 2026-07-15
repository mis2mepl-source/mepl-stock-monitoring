'use client';

import { useEffect, useState, useTransition } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { toast } from 'sonner';
import { addStockSchema, type AddStockInput } from '@/lib/schemas/movements';
import { addStock } from '@/lib/actions/movements';
import { createClient } from '@/lib/supabase/client';
import type { LocationRow, ProductRow } from '@/lib/types';
import { X } from 'lucide-react';

export default function AddStockDialog({
  open,
  onClose,
  initialProductId,
  initialLocationId,
  locations,
}: {
  open: boolean;
  onClose: () => void;
  initialProductId?: string;
  initialLocationId?: string;
  locations: LocationRow[];
}) {
  const [products, setProducts] = useState<ProductRow[]>([]);
  const [isPending, startTransition] = useTransition();

  const {
    register, handleSubmit, formState: { errors }, reset,
  } = useForm<AddStockInput>({
    resolver: zodResolver(addStockSchema),
    defaultValues: {
      productId: initialProductId ?? '',
      locationId: initialLocationId ?? '',
      quantity: undefined as unknown as number,
      referenceNo: '',
      notes: '',
    },
  });

  useEffect(() => {
    if (!open) return;
    const supabase = createClient();
    supabase
      .from('products')
      .select('id, mepl_code, part_name, description, dimensions, unit, reorder_level, is_active')
      .eq('is_active', true)
      .order('mepl_code')
      .then(({ data }) => setProducts((data ?? []) as ProductRow[]));
  }, [open]);

  useEffect(() => {
    reset({
      productId: initialProductId ?? '',
      locationId: initialLocationId ?? '',
      quantity: undefined as unknown as number,
      referenceNo: '',
      notes: '',
    });
  }, [initialProductId, initialLocationId, reset]);

  if (!open) return null;

  function onSubmit(data: AddStockInput) {
    startTransition(async () => {
      const res = await addStock(data);
      if (res.ok) {
        toast.success('Stock added');
        onClose();
      } else {
        toast.error(res.error);
      }
    });
  }

  return (
    <div className="fixed inset-0 z-50 bg-slate-900/50 flex items-start justify-center p-4 overflow-auto" onClick={onClose}>
      <div
        className="bg-white rounded-lg shadow-lg w-full max-w-md mt-16"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-5 py-3 border-b border-slate-200">
          <h2 className="font-semibold">Add stock</h2>
          <button onClick={onClose} className="p-1 hover:bg-slate-100 rounded"><X className="h-4 w-4" /></button>
        </div>
        <form onSubmit={handleSubmit(onSubmit)} className="p-5 space-y-3">
          <Field label="Product" error={errors.productId?.message}>
            <select {...register('productId')} className={input}>
              <option value="">Select…</option>
              {products.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.mepl_code} — {p.part_name}{p.dimensions ? ` (${p.dimensions})` : ''}
                </option>
              ))}
            </select>
          </Field>

          <Field label="Location" error={errors.locationId?.message}>
            <select {...register('locationId')} className={input}>
              <option value="">Select…</option>
              {locations.map((l) => (
                <option key={l.id} value={l.id}>{l.code}</option>
              ))}
            </select>
          </Field>

          <Field label="Quantity" error={errors.quantity?.message}>
            <input type="number" step="any" min="0" {...register('quantity')} className={input} />
          </Field>

          <Field label="Reference no. (optional)" error={errors.referenceNo?.message}>
            <input type="text" {...register('referenceNo')} className={input} placeholder="GRN / DC / WO" />
          </Field>

          <Field label="Notes (optional)" error={errors.notes?.message}>
            <textarea rows={2} {...register('notes')} className={input} />
          </Field>

          <div className="flex justify-end gap-2 pt-2">
            <button type="button" onClick={onClose} className="text-sm px-3 py-2 rounded-md border border-slate-300 hover:bg-slate-50">Cancel</button>
            <button
              type="submit"
              disabled={isPending}
              className="text-sm px-3 py-2 rounded-md bg-emerald-600 text-white hover:bg-emerald-700 disabled:opacity-50"
            >
              {isPending ? 'Saving…' : 'Add stock'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

const input = 'w-full text-sm rounded-md border border-slate-300 px-2.5 py-1.5 focus:outline-none focus:ring-2 focus:ring-slate-400 bg-white';

function Field({ label, error, children }: { label: string; error?: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="text-xs font-medium text-slate-700">{label}</label>
      <div className="mt-1">{children}</div>
      {error && <p className="mt-1 text-xs text-red-600">{error}</p>}
    </div>
  );
}
