import { createClient } from '@/lib/supabase/server';
import { redirect } from 'next/navigation';
import ImportClient from '@/components/admin/ImportClient';

export const dynamic = 'force-dynamic';

export default async function ImportPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const { data: profile } = await supabase
    .from('profiles').select('role').eq('id', user.id).maybeSingle();
  if (profile?.role !== 'admin') redirect('/inventory');

  return (
    <div className="p-6 space-y-4 max-w-6xl">
      <div>
        <h1 className="text-2xl font-semibold">Import from Excel</h1>
        <p className="text-sm text-slate-500">
          Upload an .xlsx with sheets <code className="text-xs bg-slate-100 px-1 rounded">MEPL 2</code> and{' '}
          <code className="text-xs bg-slate-100 px-1 rounded">ShaftStub</code>. Preview before committing.
          Every committed row becomes an OPENING movement — it <em>adds</em> to existing stock, doesn't replace it.
        </p>
      </div>
      <ImportClient />
    </div>
  );
}
