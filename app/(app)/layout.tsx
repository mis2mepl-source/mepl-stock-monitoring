import Link from 'next/link';
import { createClient } from '@/lib/supabase/server';
import { redirect } from 'next/navigation';
import {
  LayoutDashboard,
  Package,
  ArrowRightLeft,
  MapPin,
  Users,
  Upload,
  LogOut,
} from 'lucide-react';
import SignOutButton from '@/components/common/SignOutButton';

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const { data: profile } = await supabase
    .from('profiles')
    .select('full_name, role')
    .eq('id', user.id)
    .maybeSingle();

  const isAdmin = profile?.role === 'admin';

  const baseNav = [
    { href: '/', label: 'Dashboard', icon: LayoutDashboard },
    { href: '/inventory', label: 'Inventory', icon: Package },
    { href: '/movements', label: 'Movements', icon: ArrowRightLeft },
  ];

  const adminNav = [
    { href: '/locations', label: 'Locations', icon: MapPin },
    { href: '/admin/users', label: 'Users', icon: Users },
    { href: '/admin/import', label: 'Import', icon: Upload },
  ];

  return (
    <div className="min-h-screen flex">
      <aside className="hidden md:flex md:w-60 shrink-0 flex-col border-r border-slate-200 bg-white">
        <div className="px-5 py-4 border-b border-slate-200">
          <div className="font-semibold text-sm">MEPL Stock</div>
          <div className="text-xs text-slate-500 mt-0.5">Location-wise inventory</div>
        </div>
        <nav className="flex-1 p-2 space-y-0.5">
          {baseNav.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className="flex items-center gap-2 px-3 py-2 text-sm rounded-md text-slate-700 hover:bg-slate-100"
            >
              <item.icon className="h-4 w-4" />
              {item.label}
            </Link>
          ))}
          {isAdmin && (
            <>
              <div className="px-3 pt-4 pb-1 text-[10px] font-semibold uppercase tracking-wider text-slate-400">
                Admin
              </div>
              {adminNav.map((item) => (
                <Link
                  key={item.href}
                  href={item.href}
                  className="flex items-center gap-2 px-3 py-2 text-sm rounded-md text-slate-700 hover:bg-slate-100"
                >
                  <item.icon className="h-4 w-4" />
                  {item.label}
                </Link>
              ))}
            </>
          )}
        </nav>
        <div className="p-3 border-t border-slate-200 text-xs">
          <div className="font-medium text-slate-700 truncate">{profile?.full_name ?? user.email}</div>
          <div className="text-slate-500 capitalize">{profile?.role ?? 'viewer'}</div>
          <SignOutButton className="mt-2 flex items-center gap-1 text-slate-500 hover:text-slate-900">
            <LogOut className="h-3 w-3" /> Sign out
          </SignOutButton>
        </div>
      </aside>
      <main className="flex-1 min-w-0">{children}</main>
    </div>
  );
}
