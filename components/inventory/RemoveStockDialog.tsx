'use client';

import { useTransition } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { toast } from 'sonner';
import { removeStockSchema, type RemoveStockInput } from '@/lib/schemas/movements';
import { removeStock } from '@/lib/actions/movements';
import type { InventoryRow } from '@/lib/types';
import { X } from 'lucide-react';

export default function RemoveStockDialog({
  open,
  onClose,
  row,
}: {
  open: boolean;
  onClose: () => void;
  row: InventoryRow;
}) {
  const [isPending, startTransition] = useTransition();

  const {
    register, handleSubmit, formState: { errors },
  } = useForm<RemoveStockInput>({
    resolver: zodResolver(removeStockSchema),
    defaultValues: {
      productId: row.product_id,
      locationId: row.location_id,
      quantity: undefined as unknown as number,
      referenceNo: '',
      notes: '',
    },
  });

  if (!open) return null;

  function onSubmit(data: RemoveStockInput) {
    startTransition(async () => {
      const res = await removeStock(data);
      if (res.ok) {
        toast.success('Stock removed');
        onClose();
      } else {
        toast.error(res.error);
      }
    });
  }

  return (
    <div className="fixed inset-0 z-50 bg-slate-900/50 flex items-start justify-center p-4" onClick={onClose}>
      <div className="bg-white rounded-lg shadow-lg w-full max-w-md mt-16" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between px-5 py-3 border-b border-slate-200">
          <h2 className="font-semibold">Remove stock</h2>
          <button onClick={onClose} className="p-1 hover:bg-slate-100 rounded"><X className="h-4 w-4" /></button>
        </div>
        <form onSubmit={handleSubmit(onSubmit)} className="p-5 space-y-3">
          <div className="rounded-md bg-slate-50 border border-slate-200 p-3 text-sm">
            <div><span className="font-mono text-xs">{row.mepl_code}</span> {row.part_name}</div>
            <div className="text-slate-500 text-xs mt-0.5">
              At <span className="font-mono">{row.location_code}</span> · Available: <span className="font-semibold text-slate-900">{Number(row.quantity).toLocaleString('en-IN')} {row.unit}</span>
            </div>
          </div>

          <input type="hidden" {...register('productId')} />
          <input type="hidden" {...register('locationId')} />

          <Field label="Quantity to remove" error={errors.quantity?.message}>
            <input type="number" step="any" min="0" max={row.quantity} {...register('quantity')} className={input} autoFocus />
          </Field>

          <Field label="Reference no. (optional)" error={errors.referenceNo?.message}>
            <input type="text" {...register('referenceNo')} className={input} placeholder="Issue slip / WO" />
          </Field>

          <Field label="Notes (optional)" error={errors.notes?.message}>
            <textarea rows={2} {...register('notes')} className={input} />
          </Field>

          <div className="flex justify-end gap-2 pt-2">
            <button type="button" onClick={onClose} className="text-sm px-3 py-2 rounded-md border border-slate-300 hover:bg-slate-50">Cancel</button>
            <button
              type="submit"
              disabled={isPending}
              className="text-sm px-3 py-2 rounded-md bg-rose-600 text-white hover:bg-rose-700 disabled:opacity-50"
            >
              {isPending ? 'Saving…' : 'Remove stock'}
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
