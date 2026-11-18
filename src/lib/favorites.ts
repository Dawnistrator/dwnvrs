import type { FavoriteCategory } from './database.types';
import { fallbackFavorites, type FavoriteItem } from './fallback-favorites';
import type { TypedSupabaseClient } from './supabase';

export type { FavoriteCategory, FavoriteItem };

export type FavoritesResult =
  | { status: 'ok'; items: FavoriteItem[] }
  | { status: 'fallback'; items: FavoriteItem[]; reason: 'empty' | 'not-configured' | 'missing-table' }
  | { status: 'error'; items: []; message: string };

export function normalizeFavoriteCoverUrl(url: string | null): string | null {
  if (!url) return null;
  if (/^https:\/\/yt3\.(ggpht|googleusercontent)\.com\//.test(url)) {
    return url.replace(/=s400(?=-|$)/, '=s176');
  }
  return url;
}

export function isMissingFavoritesTableError(code: string | undefined, message: string): boolean {
  return (
    code === '42P01' ||
    code === 'PGRST205' ||
    /does not exist|could not find the table/i.test(message)
  );
}

/** Published favorite media items ordered by sort_order first, then featured & newest. */
export async function getPublishedFavorites(supabase: TypedSupabaseClient | null): Promise<FavoritesResult> {
  if (!supabase) {
    return { status: 'fallback', items: fallbackFavorites, reason: 'not-configured' };
  }

  const { data, error } = await supabase
    .from('favorite_items')
    .select('*')
    .eq('published', true)
    .order('sort_order', { ascending: true })
    .order('featured', { ascending: false })
    .order('created_at', { ascending: false });

  if (error) {
    if (isMissingFavoritesTableError(error.code, error.message)) {
      return { status: 'fallback', items: fallbackFavorites, reason: 'missing-table' };
    }
    console.error('[favorites] list failed:', error.message);
    return { status: 'error', items: [], message: error.message };
  }

  if (data.length === 0) {
    return { status: 'fallback', items: fallbackFavorites, reason: 'empty' };
  }

  return {
    status: 'ok',
    items: data.map((item) => ({
      ...item,
      cover_url: normalizeFavoriteCoverUrl(item.cover_url),
    })),
  };
}
