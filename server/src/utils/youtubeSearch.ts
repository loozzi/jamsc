import { ResolvedTrack } from '../types';

const MAX_QUERY_LEN = 200;
const FETCH_TIMEOUT_MS = 12000;
const OEMBED_TIMEOUT_MS = 5000;
const MAX_CANDIDATES = 8;

const BROWSER_HEADERS: Record<string, string> = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
  'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
  'Accept-Language': 'en-US,en;q=0.9',
  'Accept-Encoding': 'gzip, deflate, br',
};

interface VideoRenderer {
  videoId?: string;
  title?: {
    accessibility?: { accessibilityData?: { label?: string } };
    runs?: Array<{ text?: string }>;
  };
  thumbnail?: { thumbnails?: Array<{ url?: string }> };
}

function buildTrackFromVideoRenderer(vr: VideoRenderer): ResolvedTrack | null {
  const videoId = vr.videoId;
  if (!videoId || !/^[a-zA-Z0-9_-]{11}$/.test(videoId)) return null;

  let title = '';
  if (vr.title?.accessibility?.accessibilityData?.label) {
    title = vr.title.accessibility.accessibilityData.label;
  } else if (Array.isArray(vr.title?.runs)) {
    title = vr.title!.runs!.map((r) => r.text ?? '').join('');
  }

  let thumbnail = `https://img.youtube.com/vi/${videoId}/mqdefault.jpg`;
  const thumbs = vr.thumbnail?.thumbnails;
  if (Array.isArray(thumbs) && thumbs.length > 0) {
    const best = thumbs[thumbs.length - 1];
    if (best?.url) thumbnail = best.url;
  }

  return { source: 'youtube', sourceId: videoId, url: `https://www.youtube.com/watch?v=${videoId}`, title, thumbnail, duration: 0 };
}

function findVideoRenderers(root: unknown, limit = MAX_CANDIDATES): VideoRenderer[] {
  const queue: unknown[] = [root];
  const found: VideoRenderer[] = [];
  const seen = new Set<string>();
  let iters = 0;

  while (queue.length > 0 && iters++ < 200000 && found.length < limit) {
    const node = queue.shift();
    if (!node || typeof node !== 'object') continue;

    const n = node as Record<string, unknown>;
    if (n.videoRenderer && typeof n.videoRenderer === 'object') {
      const vr = n.videoRenderer as VideoRenderer;
      if (vr.videoId && !seen.has(vr.videoId)) {
        seen.add(vr.videoId);
        found.push(vr);
      }
    }

    if (Array.isArray(node)) {
      for (const item of node) queue.push(item);
      continue;
    }

    for (const val of Object.values(n)) {
      if (val && typeof val === 'object') queue.push(val);
    }
  }
  return found;
}

function extractYtInitialDataJson(html: string): unknown | null {
  const marker = 'var ytInitialData = ';
  const pos = html.indexOf(marker);
  if (pos === -1) return null;
  const start = pos + marker.length;
  const end = html.indexOf(';</script>', start);
  if (end === -1) return null;
  try {
    return JSON.parse(html.slice(start, end));
  } catch {
    return null;
  }
}

function fallbackVideoIds(html: string, limit = MAX_CANDIDATES): string[] {
  const ids: string[] = [];
  const seen = new Set<string>();
  const regex = /"videoId":"([a-zA-Z0-9_-]{11})"/g;
  let m: RegExpExecArray | null;
  while ((m = regex.exec(html)) !== null && ids.length < limit) {
    const id = m[1];
    if (!seen.has(id)) { seen.add(id); ids.push(id); }
  }
  return ids;
}

async function fetchTextWithTimeout(url: string, timeoutMs = FETCH_TIMEOUT_MS): Promise<string | null> {
  const controller = new AbortController();
  const t = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, { headers: BROWSER_HEADERS, signal: controller.signal });
    if (!response.ok) return null;
    return await response.text();
  } catch {
    return null;
  } finally {
    clearTimeout(t);
  }
}

async function isEmbeddableVideo(videoId: string): Promise<boolean> {
  const oembedUrl = `https://www.youtube.com/oembed?url=${encodeURIComponent(`https://www.youtube.com/watch?v=${videoId}`)}&format=json`;
  const controller = new AbortController();
  const t = setTimeout(() => controller.abort(), OEMBED_TIMEOUT_MS);
  try {
    const response = await fetch(oembedUrl, { signal: controller.signal });
    return response.ok;
  } catch {
    return true;
  } finally {
    clearTimeout(t);
  }
}

export async function searchYouTubeFirstVideo(rawQuery: string): Promise<ResolvedTrack | null> {
  const query = String(rawQuery ?? '').trim().slice(0, MAX_QUERY_LEN);
  if (!query) return null;

  const url = `https://www.youtube.com/results?search_query=${encodeURIComponent(query)}`;
  const html = await fetchTextWithTimeout(url, FETCH_TIMEOUT_MS);
  if (!html) return null;

  const candidateTracks: ResolvedTrack[] = [];
  const seen = new Set<string>();

  const pushTrack = (track: ResolvedTrack | null) => {
    if (!track || !track.sourceId || seen.has(track.sourceId) || candidateTracks.length >= MAX_CANDIDATES) return;
    seen.add(track.sourceId);
    candidateTracks.push(track);
  };

  const ytData = extractYtInitialDataJson(html);
  if (ytData) {
    for (const vr of findVideoRenderers(ytData, MAX_CANDIDATES)) {
      pushTrack(buildTrackFromVideoRenderer(vr));
    }
  }

  for (const vid of fallbackVideoIds(html, MAX_CANDIDATES)) {
    pushTrack({ source: 'youtube', sourceId: vid, url: `https://www.youtube.com/watch?v=${vid}`, title: '', thumbnail: `https://img.youtube.com/vi/${vid}/mqdefault.jpg`, duration: 0 });
  }

  if (candidateTracks.length === 0) return null;

  for (const track of candidateTracks) {
    if (await isEmbeddableVideo(track.sourceId)) return track;
  }

  return candidateTracks[0];
}

export { MAX_QUERY_LEN };
