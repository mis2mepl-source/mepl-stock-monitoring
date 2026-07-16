import { createClient } from '@/lib/supabase/server';
import { redirect } from 'next/navigation';
import Link from 'next/link';
import NewProductForm from '@/components/inventory/NewProductForm';
import type { LocationRow } from '@/lib/types';

export const dynamic = 'force-dynamic';

export default async function NewProductPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const { data: profile } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .maybeSingle();

  if (profile?.role !== 'admin') {
    redirect('/inventory');
  }

  const { data: locations } = await supabase
    .from('locations')
    .select('*')
    .eq('is_active', true)
    .order('code');

  return (
    <div className="p-6 max-w-3xl">
      <Link href="/inventory" className="text-sm text-slate-500 hover:underline">
        ← Back to inventory
      </Link>
      <h1 className="text-2xl font-semibold mt-1">New product</h1>
      <p className="text-sm text-slate-500 mb-6">
        Add a new SKU. Opening stock is optional — you can also add it from the
        inventory page later.
      </p>
      <NewProductForm locations={(locations ?? []) as LocationRow[]} />
    </div>
  );
}
