import { createClient } from '@supabase/supabase-js';

/**
 * Service-role Supabase client. Bypasses RLS. Use ONLY in server actions,
 * NEVER in components or code that runs in the browser.
 *
 * Every action that uses this must first verify the caller is an admin.
 */
export function createServiceClient() {
  const url = process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    throw new Error('Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY');
  }
  return createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}
