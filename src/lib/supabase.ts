import { createServerClient, parseCookieHeader } from '@supabase/ssr';
import type { SupabaseClient, User } from '@supabase/supabase-js';
import type { AstroCookies } from 'astro';
import type { Database } from './database.types';

export type TypedSupabaseClient = SupabaseClient<Database>;

const SUPABASE_URL = import.meta.env.PUBLIC_SUPABASE_URL;
const SUPABASE_ANON_KEY = import.meta.env.PUBLIC_SUPABASE_ANON_KEY;

/** True when both public Supabase env vars are present. */
export const isSupabaseConfigured = Boolean(SUPABASE_URL && SUPABASE_ANON_KEY);

export const PROJECT_IMAGES_BUCKET = 'project-images';

interface CookieContext {
  request: Request;
  cookies: AstroCookies;
}

/**
 * Request-scoped client. Reads the auth session from request cookies and writes
 * refreshed tokens back through Astro's cookie API. Returns `null` when the
 * project has not been connected to Supabase yet, so pages can fall back gracefully.
 */
export function createSupabaseServerClient(context: CookieContext): TypedSupabaseClient | null {
  if (!SUPABASE_URL || !SUPABASE_ANON_KEY) return null;

  return createServerClient<Database>(SUPABASE_URL, SUPABASE_ANON_KEY, {
    cookies: {
      getAll() {
        return parseCookieHeader(context.request.headers.get('Cookie') ?? '').map(({ name, value }) => ({
          name,
          value: value ?? '',
        }));
      },
      setAll(cookiesToSet) {
        for (const { name, value, options } of cookiesToSet) {
          context.cookies.set(name, value, {
            ...options,
            sameSite: options.sameSite === true ? 'strict' : options.sameSite === false ? undefined : options.sameSite,
          });
        }
      },
    },
  });
}

/**
 * Resolve the signed-in user and whether they are on the admin allowlist.
 * Memoized on `locals` so middleware and actions share one auth round-trip.
 */
export function resolveAdmin(locals: App.Locals): Promise<{ user: User | null; isAdmin: boolean }> {
  if (!locals.adminCheck) {
    locals.adminCheck = (async () => {
      const supabase = locals.supabase;
      if (!supabase) return { user: null, isAdmin: false };

      // getUser() validates the JWT with Supabase Auth instead of trusting the cookie.
      const { data, error } = await supabase.auth.getUser();
      if (error || !data.user) return { user: null, isAdmin: false };

      const { data: isAdmin, error: rpcError } = await supabase.rpc('is_admin');
      return { user: data.user, isAdmin: !rpcError && isAdmin === true };
    })();
  }
  return locals.adminCheck;
}
