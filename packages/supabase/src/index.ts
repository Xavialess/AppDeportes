import { createClient, type SupportedStorage } from '@supabase/supabase-js';
import type { Database } from './database.types';

export type { Database };
export type { SupabaseClient, SupportedStorage } from '@supabase/supabase-js';

export function createSupabaseClient(url: string, anonKey: string, storage?: SupportedStorage) {
  return createClient<Database>(url, anonKey, {
    auth: {
      autoRefreshToken: true,
      persistSession: true,
      storage,
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
