'use client';

import { useTransition } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import Link from 'next/link';
import { createProductSchema, type CreateProductInput } from '@/lib/schemas/products';
import { createProduct } from '@/lib/actions/products';
import type { LocationRow } from '@/lib/types';

export default function NewProductForm({ locations }: { locations: LocationRow[] }) {
  const [isPending, startTransition] = useTransition();
  const router = useRouter();

  const {
    register,
    handleSubmit,
    formState: { errors },
    watch,
  } = useForm<CreateProductInput>({
    resolver: zodResolver(createProductSchema),
    defaultValues: {
      meplCode: '',
      partName: '',
      description: '',
      dimensions: '',
      unit: 'nos',
      reorderLevel: 0,
      openingLocationId: '',
      openingReferenceNo: '',
      openingNotes: '',
    },
  });

  const openingLoc = watch('openingLocationId');
  const openingEnabled = !!openingLoc && openingLoc !== '';

  function onSubmit(data: CreateProductInput) {
    startTransition(async () => {
      const res = await createProduct(data);
      if (res.ok) {
        toast.success('Product created');
        router.push(`/products/${res.productId}`);
      } else {
        toast.error(res.error);
      }
    });
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
      <section className="rounded-lg border border-slate-200 bg-white p-5 space-y-3">
        <h2 className="text-sm font-semibold text-slate-700">Product details</h2>

        <div className="grid grid-cols-2 gap-3">
          <Field label="MEPL code *" error={errors.meplCode?.message}>
            <input {...register('meplCode')} className={input} placeholder="B352" autoFocus />
          </Field>
          <Field label="Part name *" error={errors.partName?.message}>
            <input {...register('partName')} className={input} placeholder="Yellow plate" />
          </Field>
        </div>

        <Field label="Description" error={errors.description?.message}>
          <input {...register('description')} className={input} placeholder="Shaft, plate, pin…" />
        </Field>

        <div className="grid grid-cols-3 gap-3">
          <Field label="Dimensions" error={errors.dimensions?.message}>
            <input {...register('dimensions')} className={input} placeholder="144 × 250" />
          </Field>
          <Field label="Unit" error={errors.unit?.message}>
            <input {...register('unit')} className={input} placeholder="nos" />
          </Field>
          <Field label="Reorder level" error={errors.reorderLevel?.message}>
            <input
              type="number"
              step="any"
              min="0"
              {...register('reorderLevel')}
              className={input}
            />
          </Field>
        </div>
      </section>

      <section className="rounded-lg border border-slate-200 bg-white p-5 space-y-3">
        <div>
          <h2 className="text-sm font-semibold text-slate-700">Opening stock (optional)</h2>
          <p className="text-xs text-slate-500 mt-0.5">
            Place initial quantity at a location. Leave the location blank to create
            the product with zero stock.
          </p>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <Field label="Location" error={errors.openingLocationId?.message}>
            <select {...register('openingLocationId')} className={input}>
              <option value="">— none —</option>
              {locations.map((l) => (
                <option key={l.id} value={l.id}>
                  {l.code}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Quantity" error={errors.openingQuantity?.message}>
            <input
              type="number"
              step="any"
              min="0"
              {...register('openingQuantity')}
              className={input}
              disabled={!openingEnabled}
            />
          </Field>
        </div>

        <Field label="Reference no." error={errors.openingReferenceNo?.message}>
          <input
            {...register('openingReferenceNo')}
            className={input}
            placeholder="GRN / opening balance"
            disabled={!openingEnabled}
          />
        </Field>

        <Field label="Notes" error={errors.openingNotes?.message}>
          <textarea
            rows={2}
            {...register('openingNotes')}
            className={input}
            disabled={!openingEnabled}
          />
        </Field>
      </section>

      <div className="flex justify-end gap-2">
        <Link
          href="/inventory"
          className="text-sm px-3 py-2 rounded-md border border-slate-300 hover:bg-slate-50"
        >
          Cancel
        </Link>
        <button
          type="submit"
          disabled={isPending}
          className="text-sm px-3 py-2 rounded-md bg-slate-900 text-white hover:bg-slate-800 disabled:opacity-50"
        >
          {isPending ? 'Creating…' : 'Create product'}
        </button>
      </div>
    </form>
  );
}

const input =
  'w-full text-sm rounded-md border border-slate-300 px-2.5 py-1.5 focus:outline-none focus:ring-2 focus:ring-slate-400 bg-white disabled:bg-slate-50 disabled:text-slate-400';

function Field({
  label,
  error,
  children,
}: {
  label: string;
  error?: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <label className="text-xs font-medium text-slate-700">{label}</label>
      <div className="mt-1">{children}</div>
      {error && <p className="mt-1 text-xs text-red-600">{error}</p>}
    </div>
  );
}
