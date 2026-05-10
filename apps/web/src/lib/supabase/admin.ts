import { createClient } from '@supabase/supabase-js';
import type { Database } from '@appdeportes/supabase';

// Service-role client — bypasses RLS.
// Only import from Server Actions, Route Handlers, or Edge Functions.
// NEVER import in Client Components or expose to the browser.
export function createAdminClient() {
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!serviceRoleKey) throw new Error('SUPABASE_SERVICE_ROLE_KEY is not set');

  return createClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    serviceRoleKey,
    {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
    },
  );
}
