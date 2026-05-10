import { createClient } from '@supabase/supabase-js';
import type { Database } from './database.types';

export type { Database };
export type { SupabaseClient } from '@supabase/supabase-js';

export function createSupabaseClient(url: string, anonKey: string) {
  return createClient<Database>(url, anonKey, {
    auth: {
      autoRefreshToken: true,
      persistSession: true,
    },
  });
}

// Server-side client with service role — only use in Edge Functions / server code
export function createSupabaseServiceClient(url: string, serviceRoleKey: string) {
  return createClient<Database>(url, serviceRoleKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });
}
