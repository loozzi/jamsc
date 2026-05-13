import { ResolvedTrack } from '../types';
import { searchYouTubeFirstVideo } from '../utils/youtubeSearch';

async function fetchJson<T>(url: string): Promise<T> {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  return response.json() as Promise<T>;
}

function extractYouTubeVideoId(rawUrl: string): string | null {
  try {
    const parsed = new URL(rawUrl);
    const host = parsed.hostname.toLowerCase();

    if (host === 'youtu.be' || host === 'www.youtu.be') {
      const id = parsed.pathname.replace(/^\/+/, '').split('/')[0];
      return /^[a-zA-Z0-9_-]{11}$/.test(id) ? id : null;
    }

    if (host.includes('youtube.com') || host.includes('youtube-nocookie.com')) {
      const v = parsed.searchParams.get('v');
      if (v && /^[a-zA-Z0-9_-]{11}$/.test(v)) return v;

      const parts = parsed.pathname.split('/').filter(Boolean);
      const markerIdx = parts.findIndex((p) => p === 'shorts' || p === 'embed' || p === 'live');
      if (markerIdx !== -1) {
        const id = parts[markerIdx + 1];
        if (id && /^[a-zA-Z0-9_-]{11}$/.test(id)) return id;
      }
    }
  } catch {
    // invalid URL
  }
  return null;
}

export async function resolveUrl(url: string): Promise<ResolvedTrack | null> {
  const videoId = extractYouTubeVideoId(url);
  if (videoId) {
    const videoUrl = `https://www.youtube.com/watch?v=${videoId}`;
    let title = '';
    let thumbnail = `https://img.youtube.com/vi/${videoId}/mqdefault.jpg`;
    try {
      const oembed = await fetchJson<{ title?: string; thumbnail_url?: string }>(
        `https://www.youtube.com/oembed?url=${encodeURIComponent(videoUrl)}&format=json`
      );
      title = oembed.title ?? '';
      if (oembed.thumbnail_url) thumbnail = oembed.thumbnail_url;
    } catch (e) {
      console.warn('[Resolve] YouTube oEmbed failed:', (e as Error).message);
    }
    return { source: 'youtube', sourceId: videoId, url: videoUrl, title, thumbnail, duration: 0 };
  }

  if (url.includes('soundcloud.com/')) {
    const cleanUrl = url.split('?')[0];
    let title = '';
    let thumbnail = '';
    try {
      const oembed = await fetchJson<{ title?: string; thumbnail_url?: string }>(
        `https://soundcloud.com/oembed?url=${encodeURIComponent(cleanUrl)}&format=json`
      );
      title = oembed.title ?? '';
      if (oembed.thumbnail_url) thumbnail = oembed.thumbnail_url;
    } catch (e) {
      console.warn('[Resolve] SoundCloud oEmbed failed:', (e as Error).message);
    }
    return { source: 'soundcloud', sourceId: cleanUrl, url: cleanUrl, title, thumbnail, duration: 0 };
  }

  return null;
}

export async function resolvePlaylist(url: string): Promise<ResolvedTrack[] | null> {
  const listMatch = url.match(/[?&]list=([a-zA-Z0-9_-]+)/);
  if (!listMatch) return null;

  const playlistId = listMatch[1];
  let html: string;
  try {
    const response = await fetch(`https://www.youtube.com/playlist?list=${playlistId}`, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept-Language': 'en-US,en;q=0.9',
      },
    });
    if (!response.ok) return null;
    html = await response.text();
  } catch {
    return null;
  }

  const videos: Array<{ videoId: string; title: string }> = [];
  const dataMarker = 'var ytInitialData = ';
  const markerPos = html.indexOf(dataMarker);

  if (markerPos !== -1) {
    const jsonStart = markerPos + dataMarker.length;
    const scriptClose = html.indexOf(';</script>', jsonStart);
    if (scriptClose !== -1) {
      try {
        const ytData = JSON.parse(html.slice(jsonStart, scriptClose)) as unknown;
        const stack: unknown[] = [ytData];
        let iters = 0;
        while (stack.length > 0 && videos.length < 50 && iters++ < 100000) {
          const node = stack.pop();
          if (!node || typeof node !== 'object') continue;
          if (Array.isArray(node)) { for (const item of node) stack.push(item); continue; }
          const n = node as Record<string, unknown>;
          if (n.playlistVideoRenderer && typeof n.playlistVideoRenderer === 'object') {
            const v = n.playlistVideoRenderer as Record<string, unknown>;
            if (typeof v.videoId === 'string') {
              const titleRuns = (v.title as Record<string, unknown> | undefined)?.runs;
              const title = Array.isArray(titleRuns) ? (titleRuns[0] as Record<string, unknown>)?.text as string ?? '' : '';
              videos.push({ videoId: v.videoId, title });
              continue;
            }
          }
          for (const val of Object.values(n)) {
            if (val && typeof val === 'object') stack.push(val);
          }
        }
      } catch {
        // fall through to regex
      }
    }
  }

  if (videos.length === 0) {
    const seen = new Set<string>();
    const regex = /"videoId":"([a-zA-Z0-9_-]{11})"/g;
    let m: RegExpExecArray | null;
    while ((m = regex.exec(html)) !== null && videos.length < 50) {
      if (!seen.has(m[1])) { seen.add(m[1]); videos.push({ videoId: m[1], title: '' }); }
    }
  }

  if (videos.length === 0) return null;

  return videos.map((v) => ({
    source: 'youtube' as const,
    sourceId: v.videoId,
    url: `https://www.youtube.com/watch?v=${v.videoId}`,
    title: v.title,
    thumbnail: `https://img.youtube.com/vi/${v.videoId}/mqdefault.jpg`,
    duration: 0,
  }));
}

export async function resolveSpotify(url: string): Promise<ResolvedTrack> {
  if (!url.includes('open.spotify.com/track/')) {
    throw new Error('Chỉ hỗ trợ link track Spotify (open.spotify.com/track/...)');
  }

  const spotifyUrl = url.split('?')[0];
  const oembed = await fetchJson<{ title?: string; author_name?: string; thumbnail_url?: string }>(
    `https://open.spotify.com/oembed?url=${encodeURIComponent(spotifyUrl)}`
  );

  const title = oembed.title ?? '';
  const artist = oembed.author_name ?? '';
  const thumbnail = oembed.thumbnail_url ?? '';

  if (!title) throw new Error('Không đọc được tên bài từ Spotify.');

  const searchQuery = artist ? `${title} ${artist}` : title;
  const ytTrack = await searchYouTubeFirstVideo(searchQuery);
  if (!ytTrack?.sourceId) throw new Error('Không tìm được video YouTube cho bài này.');

  return {
    source: 'youtube',
    displaySource: 'spotify',
    sourceId: ytTrack.sourceId,
    url: `https://www.youtube.com/watch?v=${ytTrack.sourceId}`,
    spotifyUrl,
    title,
    artist,
    thumbnail,
    duration: 0,
  };
}

export async function searchFirst(query: string): Promise<ResolvedTrack | null> {
  const track = await searchYouTubeFirstVideo(query);
  if (!track) return null;

  if (track.url) {
    const enriched = await resolveUrl(track.url);
    if (!enriched?.sourceId) return null;
    track.sourceId = enriched.sourceId;
    if (enriched.title) track.title = enriched.title;
    if (enriched.thumbnail) track.thumbnail = enriched.thumbnail;
  }

  return track;
}
