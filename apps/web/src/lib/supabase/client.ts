'use client';

import { createBrowserClient } from '@supabase/ssr';
import type { Database } from '@appdeportes/supabase';

// Use in Client Components only. Creates one instance per browser session.
export function createClient() {
  return createBrowserClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  );
}
