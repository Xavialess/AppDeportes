import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import type { Database } from '@appdeportes/supabase';

// Use in Server Components, Server Actions, and Route Handlers.
// Must be called per-request — do NOT create a module-level singleton.
// cookies() is async in Next.js 15; always await it.
export async function createClient() {
  const cookieStore = await cookies();

  return createServerClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options),
            );
          } catch {
            // Swallowed intentionally: Server Components cannot set cookies.
            // The middleware is responsible for refreshing the session cookie.
          }
        },
      },
    },
  );
}
