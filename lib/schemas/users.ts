import { z } from 'zod';

const roleEnum = z.enum(['admin', 'operator', 'viewer']);

export const inviteUserSchema = z.object({
  email: z.string().trim().toLowerCase().email('Invalid email'),
  fullName: z.string().trim().max(200).optional().or(z.literal('')),
  role: roleEnum,
});
export type InviteUserInput = z.infer<typeof inviteUserSchema>;

export const updateRoleSchema = z.object({
  userId: z.string().uuid(),
  role: roleEnum,
});
export type UpdateRoleInput = z.infer<typeof updateRoleSchema>;

export const toggleUserBanSchema = z.object({
  userId: z.string().uuid(),
  ban: z.boolean(),
});
export type ToggleUserBanInput = z.infer<typeof toggleUserBanSchema>;
