import type { APIRoute } from 'astro';
import type { FavoriteCategory } from '../../lib/database.types';

export interface MediaSearchCandidate {
  title: string;
  subtitle: string;
  coverUrl: string | null;
  externalUrl: string | null;
  accentColor: string;
  source: string;
  review?: string;
}

interface SteamSearchResponse {
  items?: {
    id: number;
    name: string;
    tiny_image?: string;
  }[];
}

interface ItunesSearchResponse {
  results?: {
    trackName?: string;
    artistName?: string;
    collectionName?: string;
    primaryGenreName?: string;
    releaseDate?: string;
    artworkUrl100?: string;
    artworkUrl512?: string;
    trackViewUrl?: string;
  }[];
}

interface YouTubeChannelRenderer {
  channelId?: string;
  title?: { simpleText?: string; runs?: { text?: string }[] };
  navigationEndpoint?: { browseEndpoint?: { canonicalBaseUrl?: string } };
  thumbnail?: { thumbnails?: { url?: string; width?: number; height?: number }[] };
  descriptionSnippet?: { runs?: { text?: string }[] };
  subscriberCountText?: { simpleText?: string };
  videoCountText?: { simpleText?: string };
}

interface YouTubeInitialData {
  contents?: {
    twoColumnSearchResultsRenderer?: {
      primaryContents?: {
        sectionListRenderer?: {
          contents?: {
            itemSectionRenderer?: {
              contents?: {
                channelRenderer?: YouTubeChannelRenderer;
              }[];
            };
          }[];
        };
      };
    };
  };
}

function isCategory(val: string | null): val is FavoriteCategory {
  return val === 'game' || val === 'movie' || val === 'music';
}

async function fetchJsonWithTimeout<T>(url: string, timeoutMs = 6000): Promise<T | null> {
  try {
    const res = await fetch(url, {
      headers: { Accept: 'application/json' },
      signal: AbortSignal.timeout(timeoutMs),
    });
    if (!res.ok) return null;
    return (await res.json()) as T;
  } catch {
    return null;
  }
}

async function searchGames(q: string): Promise<MediaSearchCandidate[]> {
  const [steamData, itunesData] = await Promise.all([
    fetchJsonWithTimeout<SteamSearchResponse>(
      `https://store.steampowered.com/api/storesearch/?term=${encodeURIComponent(q)}&l=english&cc=US`,
    ),
    fetchJsonWithTimeout<ItunesSearchResponse>(
      `https://itunes.apple.com/search?term=${encodeURIComponent(q)}&country=US&entity=software&limit=4`,
    ),
  ]);

  const candidates: MediaSearchCandidate[] = [];

  for (const item of (steamData?.items ?? []).slice(0, 4)) {
    candidates.push({
      title: item.name,
      subtitle: 'Steam · PC Game',
      coverUrl: `https://shared.akamai.steamstatic.com/store_item_assets/steam/apps/${item.id}/library_600x900.jpg`,
      externalUrl: `https://store.steampowered.com/app/${item.id}`,
      accentColor: '#8c52ff',
      source: 'Steam',
    });
  }

  for (const item of (itunesData?.results ?? []).slice(0, 4)) {
    if (!item.trackName) continue;
    const art = item.artworkUrl512 || item.artworkUrl100?.replace('100x100bb', '600x600bb') || null;
    candidates.push({
      title: item.trackName,
      subtitle: [item.artistName, item.primaryGenreName].filter(Boolean).join(' · '),
      coverUrl: art,
      externalUrl: item.trackViewUrl ?? null,
      accentColor: '#38bdf8',
      source: 'App Store',
    });
  }

  return candidates.slice(0, 6);
}

function extractYouTubeText(field: { simpleText?: string; runs?: { text?: string }[] } | undefined): string {
  if (!field) return '';
  if (field.simpleText) return field.simpleText;
  return (field.runs ?? []).map((r) => r.text ?? '').join('');
}

async function searchYouTubeChannels(q: string): Promise<MediaSearchCandidate[]> {
  try {
    const res = await fetch(
      `https://www.youtube.com/results?search_query=${encodeURIComponent(q)}&sp=EgIQAg%3D%3D`,
      {
        headers: {
          'User-Agent':
            'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36',
          'Accept-Language': 'en-US,en;q=0.9',
        },
        signal: AbortSignal.timeout(6500),
      },
    );
    if (!res.ok) return [];

    const html = await res.text();
    const match = html.match(/var ytInitialData = (\{.*?\});<\/script>/s);
    if (!match?.[1]) return [];

    const data = JSON.parse(match[1]) as YouTubeInitialData;
    const sections =
      data.contents?.twoColumnSearchResultsRenderer?.primaryContents?.sectionListRenderer?.contents ?? [];

    const candidates: MediaSearchCandidate[] = [];
    for (const sec of sections) {
      for (const item of sec.itemSectionRenderer?.contents ?? []) {
        const ch = item.channelRenderer;
        if (!ch) continue;
        const title = extractYouTubeText(ch.title).trim();
        if (!title) continue;

        const handle = ch.subscriberCountText?.simpleText?.trim() ?? '';
        const subs = ch.videoCountText?.simpleText?.trim() ?? '';
        const subtitle = [handle, subs].filter(Boolean).join(' · ') || 'YouTube Channel';

        const rawThumb = ch.thumbnail?.thumbnails?.at(-1)?.url ?? '';
        const coverUrl = rawThumb
          ? rawThumb.startsWith('//')
            ? `https:${rawThumb}`
            : rawThumb
          : null;

        const canonical = ch.navigationEndpoint?.browseEndpoint?.canonicalBaseUrl;
        const externalUrl = canonical
          ? `https://www.youtube.com${canonical}`
          : ch.channelId
            ? `https://www.youtube.com/channel/${ch.channelId}`
            : null;

        const description = extractYouTubeText(ch.descriptionSnippet)
          .replace(/\u00a0/g, ' ')
          .replace(/\s+/g, ' ')
          .trim();

        candidates.push({
          title,
          subtitle,
          coverUrl,
          externalUrl,
          accentColor: '#ef4444',
          source: 'YouTube',
          review: description ? description.slice(0, 600) : undefined,
        });

        if (candidates.length >= 6) {
          return candidates;
        }
      }
    }

    return candidates;
  } catch {
    return [];
  }
}

async function searchMusic(q: string): Promise<MediaSearchCandidate[]> {
  const data = await fetchJsonWithTimeout<ItunesSearchResponse>(
    `https://itunes.apple.com/search?term=${encodeURIComponent(q)}&country=US&media=music&entity=song&limit=6`,
  );
  return (data?.results ?? [])
    .filter((item): item is Required<Pick<typeof item, 'trackName'>> & typeof item => Boolean(item.trackName))
    .map((item) => ({
      title: item.trackName,
      subtitle: [item.artistName, item.collectionName].filter(Boolean).join(' · '),
      coverUrl: item.artworkUrl100?.replace('100x100bb', '600x600bb') ?? null,
      externalUrl: item.trackViewUrl ?? null,
      accentColor: '#10b981',
      source: 'Apple Music',
    }));
}

export const GET: APIRoute = async ({ url }) => {
  const categoryParam = url.searchParams.get('category');
  const q = (url.searchParams.get('q') ?? '').trim().slice(0, 80);

  if (!isCategory(categoryParam)) {
    return new Response(JSON.stringify({ error: 'Invalid category.' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  if (q.length < 2) {
    return new Response(JSON.stringify({ results: [] }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  let results: MediaSearchCandidate[] = [];
  try {
    results =
      categoryParam === 'game'
        ? await searchGames(q)
        : categoryParam === 'movie'
          ? await searchYouTubeChannels(q)
          : await searchMusic(q);
  } catch {
    results = [];
  }

  return new Response(JSON.stringify({ results }), {
    status: 200,
    headers: {
      'Content-Type': 'application/json',
      'Cache-Control': 'public, max-age=60',
    },
  });
};
