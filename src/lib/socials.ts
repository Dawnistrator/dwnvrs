import type { SocialLinkRow } from './database.types';
import type { TypedSupabaseClient } from './supabase';

export type SocialsResult =
  | { status: 'ok'; socials: SocialLinkRow[] }
  | { status: 'not-configured'; socials: [] }
  | { status: 'error'; socials: []; message: string };

/** Published social media links ordered by sort_order, then creation time. */
export async function getPublishedSocials(supabase: TypedSupabaseClient | null): Promise<SocialsResult> {
  if (!supabase) return { status: 'not-configured', socials: [] };

  const { data, error } = await supabase
    .from('social_links')
    .select('*')
    .eq('published', true)
    .order('sort_order', { ascending: true })
    .order('created_at', { ascending: true });

  if (error) {
    console.error('[socials] list failed:', error.message);
    return { status: 'error', socials: [], message: error.message };
  }

  return { status: 'ok', socials: data };
}
