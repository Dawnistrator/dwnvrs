import { monogram } from './projects';

export interface LastFmTrack {
  title: string;
  artist: string;
  album: string;
  url: string;
  coverUrl: string | null;
  nowPlaying: boolean;
  playedAtUts: number | null;
  relativeTime: string;
  username: string;
  profileUrl: string;
}

export type LastFmResult =
  | { status: 'ok'; track: LastFmTrack; recentTracks: LastFmTrack[] }
  | { status: 'empty'; username: string; profileUrl: string }
  | { status: 'not-configured' }
  | { status: 'error'; message: string };

interface LastFmApiImage {
  size?: string;
  '#text'?: string;
}

interface LastFmApiTrack {
  name?: string;
  url?: string;
  artist?: { '#text'?: string; name?: string };
  album?: { '#text'?: string };
  image?: LastFmApiImage[];
  date?: { uts?: string };
  '@attr'?: { nowplaying?: string };
}

interface LastFmRecentTracksPayload {
  error?: number;
  message?: string;
  recenttracks?: {
    track?: LastFmApiTrack | LastFmApiTrack[];
  };
}

const LASTFM_DEFAULT_IMAGE_HASH = '2a96cbd8b46e442fc41c2b86b821562f';
const CACHE_TTL_MS = 15_000;

let cachedResult: LastFmResult | null = null;
let cachedAt = 0;
let cachedKey = '';

function readEnv(key: 'LASTFM_API_KEY' | 'LASTFM_USERNAME' | 'PUBLIC_LASTFM_USERNAME'): string {
  const fromImportMeta = import.meta.env[key];
  const proc = (globalThis as { process?: { env?: Record<string, string | undefined> } }).process;
  const fromProcess = proc?.env?.[key];
  return (fromImportMeta ?? fromProcess ?? '').trim();
}

export function formatRelativePlayTime(playedAtUts: number | null, nowPlaying: boolean, nowMs = Date.now()): string {
  if (nowPlaying) return 'Now playing';
  if (!playedAtUts) return 'Recently played';

  const diffSeconds = Math.max(0, Math.floor(nowMs / 1000) - playedAtUts);
  if (diffSeconds < 60) return 'Just now';
  if (diffSeconds < 3600) return `${Math.floor(diffSeconds / 60)}m ago`;
  if (diffSeconds < 86_400) return `${Math.floor(diffSeconds / 3600)}h ago`;
  return `${Math.floor(diffSeconds / 86_400)}d ago`;
}

function pickCoverUrl(images: LastFmApiImage[] | undefined): string | null {
  if (!Array.isArray(images) || images.length === 0) return null;
  const preferred =
    images.find((img) => img.size === 'extralarge')?.['#text'] ??
    images.find((img) => img.size === 'large')?.['#text'] ??
    images[images.length - 1]?.['#text'] ??
    '';

  const trimmed = preferred.trim();
  if (!trimmed || trimmed.includes(LASTFM_DEFAULT_IMAGE_HASH)) return null;
  if (!/^https?:\/\//i.test(trimmed)) return null;
  return trimmed.replace(/^http:\/\//i, 'https://');
}

export function getLastFmMonogram(title: string): string {
  return monogram(title);
}

function mapApiTrack(raw: LastFmApiTrack, username: string, profileUrl: string): LastFmTrack {
  const nowPlaying = raw['@attr']?.nowplaying === 'true';
  const parsedUts = raw.date?.uts ? Number.parseInt(raw.date.uts, 10) : Number.NaN;
  const playedAtUts = Number.isFinite(parsedUts) ? parsedUts : null;
  const trackUrl =
    raw.url && /^https?:\/\//i.test(raw.url) ? raw.url.replace(/^http:\/\//i, 'https://') : profileUrl;

  return {
    title: raw.name ?? 'Untitled track',
    artist: raw.artist?.['#text'] ?? raw.artist?.name ?? 'Unknown artist',
    album: raw.album?.['#text'] ?? '',
    url: trackUrl,
    coverUrl: pickCoverUrl(raw.image),
    nowPlaying,
    playedAtUts,
    relativeTime: formatRelativePlayTime(playedAtUts, nowPlaying),
    username,
    profileUrl,
  };
}

/**
 * Fetch the owner's active and recent Last.fm scrobbles on the server.
 * Keeps LASTFM_API_KEY out of client bundles and caches briefly to respect rate limits.
 */
export async function getLastFmNowPlaying(forceRefresh = false): Promise<LastFmResult> {
  const apiKey = readEnv('LASTFM_API_KEY');
  const username = readEnv('LASTFM_USERNAME') || readEnv('PUBLIC_LASTFM_USERNAME');

  if (
    !apiKey ||
    !username ||
    apiKey === 'your-lastfm-api-key' ||
    username === 'your-lastfm-username'
  ) {
    return { status: 'not-configured' };
  }

  const cacheKey = `${username}:${apiKey.slice(0, 6)}`;
  if (!forceRefresh && cachedResult && cachedKey === cacheKey && Date.now() - cachedAt < CACHE_TTL_MS) {
    if (cachedResult.status === 'ok') {
      return {
        status: 'ok',
        track: {
          ...cachedResult.track,
          relativeTime: formatRelativePlayTime(cachedResult.track.playedAtUts, cachedResult.track.nowPlaying),
        },
        recentTracks: cachedResult.recentTracks.map((item) => ({
          ...item,
          relativeTime: formatRelativePlayTime(item.playedAtUts, item.nowPlaying),
        })),
      };
    }
    return cachedResult;
  }

  const profileUrl = `https://www.last.fm/user/${encodeURIComponent(username)}`;
  const endpoint = `https://ws.audioscrobbler.com/2.0/?method=user.getrecenttracks&user=${encodeURIComponent(username)}&api_key=${encodeURIComponent(apiKey)}&limit=6&format=json`;

  try {
    const response = await fetch(endpoint, {
      headers: { Accept: 'application/json' },
      signal: AbortSignal.timeout(4000),
    });

    if (!response.ok) {
      return {
        status: 'error',
        message: `Last.fm returned HTTP ${response.status}.`,
      };
    }

    const payload = (await response.json()) as LastFmRecentTracksPayload;
    if (payload.error || !payload.recenttracks) {
      return {
        status: 'error',
        message: payload.message ?? 'Last.fm returned an unexpected response.',
      };
    }

    const rawTracks = payload.recenttracks.track;
    const tracksArray = (Array.isArray(rawTracks) ? rawTracks : rawTracks ? [rawTracks] : []).filter(
      (item): item is LastFmApiTrack => Boolean(item?.name),
    );
    const first = tracksArray[0];
    if (!first) {
      const emptyResult: LastFmResult = { status: 'empty', username, profileUrl };
      cachedResult = emptyResult;
      cachedAt = Date.now();
      cachedKey = cacheKey;
      return emptyResult;
    }

    const track = mapApiTrack(first, username, profileUrl);
    const seen = new Set<string>([`${track.title.toLowerCase()}::${track.artist.toLowerCase()}`]);
    const recentTracks: LastFmTrack[] = [];

    for (const rawItem of tracksArray.slice(1)) {
      const mapped = mapApiTrack(rawItem, username, profileUrl);
      const dedupeKey = `${mapped.title.toLowerCase()}::${mapped.artist.toLowerCase()}`;
      if (seen.has(dedupeKey)) continue;
      seen.add(dedupeKey);
      recentTracks.push(mapped);
      if (recentTracks.length >= 4) break;
    }

    const result: LastFmResult = {
      status: 'ok',
      track,
      recentTracks,
    };

    cachedResult = result;
    cachedAt = Date.now();
    cachedKey = cacheKey;
    return result;
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unable to reach Last.fm.';
    return { status: 'error', message };
  }
}
