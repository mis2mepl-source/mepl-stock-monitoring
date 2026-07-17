import { createClient } from '@/lib/supabase/server';
import { createServiceClient } from '@/lib/supabase/service';
import { redirect } from 'next/navigation';
import UsersClient from '@/components/admin/UsersClient';

export const dynamic = 'force-dynamic';

export type UserRow = {
  id: string;
  email: string;
  full_name: string | null;
  role: 'admin' | 'operator' | 'viewer';
  last_sign_in_at: string | null;
  created_at: string;
  banned_until: string | null;
};

export default async function UsersPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const { data: profile } = await supabase
    .from('profiles').select('role').eq('id', user.id).maybeSingle();
  if (profile?.role !== 'admin') redirect('/inventory');

  const service = createServiceClient();

  // Combined list: auth.users (email, last sign-in, banned) + profiles (role, full name)
  const [authList, { data: profiles }] = await Promise.all([
    service.auth.admin.listUsers({ page: 1, perPage: 200 }),
    service.from('profiles').select('id, full_name, role'),
  ]);

  const profileById = new Map((profiles ?? []).map((p) => [p.id, p]));

  const rows: UserRow[] = (authList.data.users ?? []).map((u) => {
    const p = profileById.get(u.id);
    return {
      id: u.id,
      email: u.email ?? '',
      full_name: (p?.full_name as string | null) ?? null,
      role: ((p?.role as UserRow['role']) ?? 'viewer'),
      last_sign_in_at: u.last_sign_in_at ?? null,
      created_at: u.created_at,
      banned_until: (u as any).banned_until ?? null,
    };
  }).sort((a, b) => a.email.localeCompare(b.email));

  return (
    <div className="p-6 space-y-4 max-w-5xl">
      <div>
        <h1 className="text-2xl font-semibold">Users</h1>
        <p className="text-sm text-slate-500">Manage access. Admin only.</p>
      </div>
      <UsersClient initialRows={rows} currentUserId={user.id} />
    </div>
  );
}
