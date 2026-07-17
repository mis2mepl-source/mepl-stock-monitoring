'use client';

import { useState, useTransition } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { toast } from 'sonner';
import { formatDistanceToNow } from 'date-fns';
import { Plus, Ban, RotateCcw, ShieldCheck } from 'lucide-react';
import { inviteUserSchema, type InviteUserInput } from '@/lib/schemas/users';
import { inviteUser, updateUserRole, toggleUserBan } from '@/lib/actions/users';
import type { UserRow } from '@/app/(app)/admin/users/page';

export default function UsersClient({
  initialRows,
  currentUserId,
}: {
  initialRows: UserRow[];
  currentUserId: string;
}) {
  return (
    <>
      <InviteForm />
      <div className="rounded-lg border border-slate-200 bg-white overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 border-b border-slate-200 text-left">
            <tr className="text-xs uppercase text-slate-500">
              <th className="px-3 py-2 font-medium">Email</th>
              <th className="px-3 py-2 font-medium">Name</th>
              <th className="px-3 py-2 font-medium">Role</th>
              <th className="px-3 py-2 font-medium">Last sign-in</th>
              <th className="px-3 py-2 font-medium">Status</th>
              <th className="px-3 py-2 font-medium text-right">Actions</th>
            </tr>
          </thead>
          <tbody>
            {initialRows.length === 0 && (
              <tr>
                <td colSpan={6} className="text-center py-6 text-slate-500">
                  No users yet.
                </td>
              </tr>
            )}
            {initialRows.map((u) => (
              <UserRowView key={u.id} row={u} isSelf={u.id === currentUserId} />
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}

function UserRowView({ row, isSelf }: { row: UserRow; isSelf: boolean }) {
  const [isPending, startTransition] = useTransition();
  const [role, setRole] = useState(row.role);

  const banned = !!row.banned_until && new Date(row.banned_until) > new Date();

  function changeRole(newRole: UserRow['role']) {
    if (newRole === role) return;
    startTransition(async () => {
      const res = await updateUserRole({ userId: row.id, role: newRole });
      if (res.ok) {
        toast.success('Role updated');
        setRole(newRole);
      } else {
        toast.error(res.error);
      }
    });
  }

  function toggleBan() {
    startTransition(async () => {
      const res = await toggleUserBan({ userId: row.id, ban: !banned });
      if (res.ok) toast.success(banned ? 'User reactivated' : 'User banned');
      else toast.error(res.error);
    });
  }

  return (
    <tr className="border-b border-slate-100 hover:bg-slate-50">
      <td className="px-3 py-2">
        {row.email}
        {isSelf && <span className="ml-2 text-xs text-slate-400">(you)</span>}
      </td>
      <td className="px-3 py-2 text-slate-600">{row.full_name ?? '—'}</td>
      <td className="px-3 py-2">
        <select
          value={role}
          onChange={(e) => changeRole(e.target.value as UserRow['role'])}
          disabled={isPending || (isSelf && role === 'admin') || banned}
          className="text-sm rounded-md border border-slate-300 px-2 py-1 bg-white disabled:bg-slate-50 disabled:text-slate-400"
        >
          <option value="admin">admin</option>
          <option value="operator">operator</option>
          <option value="viewer">viewer</option>
        </select>
      </td>
      <td className="px-3 py-2 text-xs text-slate-500 whitespace-nowrap">
        {row.last_sign_in_at
          ? formatDistanceToNow(new Date(row.last_sign_in_at), { addSuffix: true })
          : 'Never'}
      </td>
      <td className="px-3 py-2">
        {banned ? (
          <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-xs font-medium bg-rose-100 text-rose-700">
            <Ban className="h-3 w-3" /> Banned
          </span>
        ) : (
          <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-xs font-medium bg-emerald-100 text-emerald-700">
            <ShieldCheck className="h-3 w-3" /> Active
          </span>
        )}
      </td>
      <td className="px-3 py-2 text-right">
        {!isSelf && (
          <button
            onClick={toggleBan}
            disabled={isPending}
            className={`p-1 rounded ${
              banned
                ? 'hover:bg-emerald-100 text-emerald-700'
                : 'hover:bg-rose-100 text-rose-700'
            }`}
            title={banned ? 'Reactivate' : 'Ban'}
          >
            {banned ? <RotateCcw className="h-4 w-4" /> : <Ban className="h-4 w-4" />}
          </button>
        )}
      </td>
    </tr>
  );
}

function InviteForm() {
  const [open, setOpen] = useState(false);
  const [isPending, startTransition] = useTransition();
  const {
    register, handleSubmit, formState: { errors }, reset,
  } = useForm<InviteUserInput>({
    resolver: zodResolver(inviteUserSchema),
    defaultValues: { email: '', fullName: '', role: 'operator' },
  });

  function onSubmit(data: InviteUserInput) {
    startTransition(async () => {
      const res = await inviteUser(data);
      if (res.ok) {
        toast.success(res.message ?? 'User invited');
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
        <Plus className="h-4 w-4" /> Invite user
      </button>
    );
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="rounded-lg border border-slate-200 bg-white p-4 space-y-3">
      <div>
        <h2 className="text-sm font-semibold text-slate-700">Invite user</h2>
        <p className="text-xs text-slate-500 mt-0.5">
          Sends an invitation email with a magic sign-up link. They set their own password.
        </p>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        <div>
          <label className="text-xs font-medium text-slate-700">Email *</label>
          <input
            type="email"
            {...register('email')}
            autoFocus
            className="mt-1 w-full text-sm rounded-md border border-slate-300 px-2.5 py-1.5 focus:outline-none focus:ring-2 focus:ring-slate-400"
          />
          {errors.email && <p className="mt-1 text-xs text-red-600">{errors.email.message}</p>}
        </div>
        <div>
          <label className="text-xs font-medium text-slate-700">Full name</label>
          <input
            {...register('fullName')}
            className="mt-1 w-full text-sm rounded-md border border-slate-300 px-2.5 py-1.5 focus:outline-none focus:ring-2 focus:ring-slate-400"
          />
        </div>
        <div>
          <label className="text-xs font-medium text-slate-700">Role</label>
          <select
            {...register('role')}
            className="mt-1 w-full text-sm rounded-md border border-slate-300 px-2.5 py-1.5 bg-white"
          >
            <option value="viewer">viewer</option>
            <option value="operator">operator</option>
            <option value="admin">admin</option>
          </select>
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
          {isPending ? 'Inviting…' : 'Send invitation'}
        </button>
      </div>
    </form>
  );
}
