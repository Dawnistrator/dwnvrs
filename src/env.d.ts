/// <reference types="astro/client" />

interface ImportMetaEnv {
  readonly PUBLIC_SUPABASE_URL?: string;
  readonly PUBLIC_SUPABASE_ANON_KEY?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}

declare namespace App {
  interface Locals {
    /** Request-scoped Supabase client carrying the visitor's auth cookies. `null` when env vars are missing. */
    supabase: import('./lib/supabase').TypedSupabaseClient | null;
    /** Signed-in user, resolved only on admin routes and admin actions. */
    user: import('@supabase/supabase-js').User | null;
    /** True when `user` is listed in `public.admins`. */
    isAdmin: boolean;
    /** Memoized admin lookup so middleware and actions share one auth round-trip. */
    adminCheck?: Promise<{ user: import('@supabase/supabase-js').User | null; isAdmin: boolean }>;
  }
}
