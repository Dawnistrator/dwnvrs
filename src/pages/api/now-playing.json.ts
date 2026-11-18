import type { APIRoute } from 'astro';
import { getLastFmNowPlaying } from '../../lib/lastfm';

export const GET: APIRoute = async ({ url }) => {
  const forceRefresh = url.searchParams.get('refresh') === '1';
  const result = await getLastFmNowPlaying(forceRefresh);

  return new Response(JSON.stringify(result), {
    status: 200,
    headers: {
      'Content-Type': 'application/json',
      'Cache-Control': 'public, max-age=15, s-maxage=15',
    },
  });
};
