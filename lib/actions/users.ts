'use server';

import { revalidatePath } from 'next/cache';
import { createClient } from '@/lib/supabase/server';
import { createServiceClient } from '@/lib/supabase/service';
import {
  inviteUserSchema,
  updateRoleSchema,
  toggleUserBanSchema,
  type InviteUserInput,
  type UpdateRoleInput,
  type ToggleUserBanInput,
} from '@/lib/schemas/users';

type Result = { ok: true; message?: string } | { ok: false; error: string };

async function requireAdmin(): Promise<string> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error('Not authenticated');
  const { data: profile } = await supabase
    .from('profiles').select('role').eq('id', user.id).maybeSingle();
  if (profile?.role !== 'admin') throw new Error('Admin role required');
  return user.id;
}

export async function inviteUser(input: InviteUserInput): Promise<Result> {
  const parsed = inviteUserSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0].message };

  try {
    await requireAdmin();
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'Auth check failed' };
  }

  const service = createServiceClient();

  // 1. Invite (creates auth.users row and sends the invite email)
  const { data: invited, error: inviteErr } = await service.auth.admin.inviteUserByEmail(
    parsed.data.email,
    parsed.data.fullName ? { data: { full_name: parsed.data.fullName } } : undefined,
  );

  if (inviteErr) {
    // If email already exists, surface a clean message
    if (/already.*registered|already.*exist/i.test(inviteErr.message)) {
      return { ok: false, error: 'That email is already registered.' };
    }
    return { ok: false, error: inviteErr.message };
  }

  // 2. Set the role on the profile row (created by handle_new_user trigger)
  if (invited.user) {
    const { error: roleErr } = await service
      .from('profiles')
      .update({ role: parsed.data.role, full_name: parsed.data.fullName || null })
      .eq('id', invited.user.id);
    if (roleErr) {
      return {
        ok: false,
        error: `User invited but role not set: ${roleErr.message}. Set it manually below.`,
      };
    }
  }

  revalidatePath('/admin/users');
  return {
    ok: true,
    message: `Invitation email sent to ${parsed.data.email}`,
  };
}

export async function updateUserRole(input: UpdateRoleInput): Promise<Result> {
  const parsed = updateRoleSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0].message };

  let selfId: string;
  try {
    selfId = await requireAdmin();
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'Auth check failed' };
  }

  if (parsed.data.userId === selfId && parsed.data.role !== 'admin') {
    return { ok: false, error: 'You cannot demote yourself. Ask another admin.' };
  }

  const service = createServiceClient();
  const { error } = await service
    .from('profiles')
    .update({ role: parsed.data.role })
    .eq('id', parsed.data.userId);
  if (error) return { ok: false, error: error.message };

  revalidatePath('/admin/users');
  return { ok: true };
}

export async function toggleUserBan(input: ToggleUserBanInput): Promise<Result> {
  const parsed = toggleUserBanSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0].message };

  let selfId: string;
  try {
    selfId = await requireAdmin();
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'Auth check failed' };
  }

  if (parsed.data.userId === selfId && parsed.data.ban) {
    return { ok: false, error: 'You cannot ban yourself.' };
  }

  const service = createServiceClient();
  const banDuration = parsed.data.ban ? '876000h' : 'none'; // ~100 years or unbanned
  const { error } = await service.auth.admin.updateUserById(parsed.data.userId, {
    ban_duration: banDuration,
  });
  if (error) return { ok: false, error: error.message };

  revalidatePath('/admin/users');
  return { ok: true };
}
