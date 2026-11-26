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
  | { status: 'ok'; track: LastFmTrack; recentTracks: LastFmTrack[]; stale?: boolean }
  | { status: 'empty'; username: string; profileUrl: string }
  | { status: 'not-configured' }
  | { status: 'error'; message: string; profileUrl: string; retryable: boolean };

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

type LastFmOkResult = Extract<LastFmResult, { status: 'ok' }>;

const LASTFM_DEFAULT_IMAGE_HASH = '2a96cbd8b46e442fc41c2b86b821562f';
const CACHE_TTL_MS = 15_000;
const ERROR_CACHE_TTL_MS = 10_000;
const STALE_MAX_AGE_MS = 6 * 60 * 60 * 1000;

let cachedResult: LastFmResult | null = null;
let cachedAt = 0;
let cachedKey = '';

let lastGoodResult: LastFmOkResult | null = null;
let lastGoodAt = 0;
let lastGoodKey = '';

let inFlightRequest: { key: string; promise: Promise<LastFmResult> } | null = null;

/** Reset cached Last.fm state for tests and diagnostics. */
export function clearLastFmCache(): void {
  cachedResult = null;
  cachedAt = 0;
  cachedKey = '';
  lastGoodResult = null;
  lastGoodAt = 0;
  lastGoodKey = '';
  inFlightRequest = null;
}

function readEnv(key: 'LASTFM_API_KEY' | 'LASTFM_USERNAME' | 'PUBLIC_LASTFM_USERNAME'): string {
  const fromImportMeta = (import.meta as { env?: Record<string, string | undefined> }).env?.[key];
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

function hydrateOkResult(base: LastFmOkResult, stale = false): LastFmOkResult {
  const hydrateTrack = (item: LastFmTrack): LastFmTrack => {
    const nowPlaying = stale ? false : item.nowPlaying;
    return {
      ...item,
      nowPlaying,
      relativeTime: formatRelativePlayTime(item.playedAtUts, nowPlaying),
    };
  };

  return {
    status: 'ok',
    track: hydrateTrack(base.track),
    recentTracks: base.recentTracks.map(hydrateTrack),
    ...(stale ? { stale: true } : {}),
  };
}

function classifyLastFmFailure(
  status: number,
  payload?: LastFmRecentTracksPayload | null,
): { message: string; retryable: boolean } {
  const apiError = payload?.error;
  if (status >= 500 || apiError === 8 || apiError === 11 || apiError === 16) {
    return {
      message: 'Last.fm is having a temporary server issue. Retry in a moment or open the profile directly.',
      retryable: true,
    };
  }
  if (status === 429 || apiError === 29) {
    return {
      message: 'Last.fm rate limit reached. Activity will refresh shortly.',
      retryable: true,
    };
  }
  if (status === 401 || status === 403 || apiError === 6 || apiError === 10 || apiError === 26) {
    const detail = payload?.message?.trim();
    return {
      message: detail ? `Last.fm rejected the request (${detail}).` : `Last.fm returned HTTP ${status}.`,
      retryable: false,
    };
  }
  return {
    message: 'Could not load Last.fm scrobbles right now. Retry in a moment or open the profile directly.',
    retryable: true,
  };
}

function resolveFailure(
  cacheKey: string,
  profileUrl: string,
  message: string,
  retryable: boolean,
): LastFmResult {
  if (retryable && lastGoodResult && lastGoodKey === cacheKey && Date.now() - lastGoodAt < STALE_MAX_AGE_MS) {
    const staleResult = hydrateOkResult(lastGoodResult, true);
    cachedResult = staleResult;
    cachedAt = Date.now();
    cachedKey = cacheKey;
    return staleResult;
  }

  const errorResult: LastFmResult = { status: 'error', message, profileUrl, retryable };
  cachedResult = errorResult;
  cachedAt = Date.now();
  cachedKey = cacheKey;
  return errorResult;
}

async function fetchFreshLastFm(
  cacheKey: string,
  username: string,
  apiKey: string,
  profileUrl: string,
): Promise<LastFmResult> {
  const endpoint = `https://ws.audioscrobbler.com/2.0/?method=user.getrecenttracks&user=${encodeURIComponent(username)}&api_key=${encodeURIComponent(apiKey)}&limit=6&format=json`;

  try {
    const response = await fetch(endpoint, {
      headers: {
        Accept: 'application/json',
        'User-Agent': 'dwnvrs-portfolio/1.0',
      },
      signal: AbortSignal.timeout(4000),
    });

    let payload: LastFmRecentTracksPayload | null = null;
    try {
      payload = (await response.json()) as LastFmRecentTracksPayload;
    } catch {
      payload = null;
    }

    if (!response.ok || !payload || payload.error || !payload.recenttracks) {
      const failure = classifyLastFmFailure(response.status, payload);
      return resolveFailure(cacheKey, profileUrl, failure.message, failure.retryable);
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

    const result: LastFmOkResult = {
      status: 'ok',
      track,
      recentTracks,
    };

    lastGoodResult = result;
    lastGoodAt = Date.now();
    lastGoodKey = cacheKey;
    cachedResult = result;
    cachedAt = Date.now();
    cachedKey = cacheKey;
    return result;
  } catch {
    return resolveFailure(
      cacheKey,
      profileUrl,
      'Could not reach Last.fm right now. Retry in a moment or open the profile directly.',
      true,
    );
  }
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
  if (!forceRefresh && cachedResult && cachedKey === cacheKey) {
    const ttl =
      cachedResult.status === 'error' || (cachedResult.status === 'ok' && cachedResult.stale)
        ? ERROR_CACHE_TTL_MS
        : CACHE_TTL_MS;
    if (Date.now() - cachedAt < ttl) {
      if (cachedResult.status === 'ok') {
        return hydrateOkResult(cachedResult, Boolean(cachedResult.stale));
      }
      return cachedResult;
    }
  }

  if (!forceRefresh && inFlightRequest && inFlightRequest.key === cacheKey) {
    return inFlightRequest.promise;
  }

  const profileUrl = `https://www.last.fm/user/${encodeURIComponent(username)}`;
  let promise!: Promise<LastFmResult>;
  promise = (async () => {
    try {
      return await fetchFreshLastFm(cacheKey, username, apiKey, profileUrl);
    } finally {
      if (inFlightRequest?.promise === promise) {
        inFlightRequest = null;
      }
    }
  })();

  if (!forceRefresh) {
    inFlightRequest = { key: cacheKey, promise };
  }

  return promise;
}
