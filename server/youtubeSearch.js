/**
 * YouTube search by keyword — first organic video result (no Data API).
 * Fetches /results and parses embedded ytInitialData; fragile if YouTube changes HTML.
 */

const MAX_QUERY_LEN = 200;
const FETCH_TIMEOUT_MS = 12000;
const OEMBED_TIMEOUT_MS = 5000;
const MAX_CANDIDATES = 8;

const BROWSER_HEADERS = {
  'User-Agent':
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
  'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
  'Accept-Language': 'en-US,en;q=0.9',
  'Accept-Encoding': 'gzip, deflate, br',
};

function buildTrackFromVideoRenderer(vr) {
  const videoId = vr.videoId;
  if (!videoId || !/^[a-zA-Z0-9_-]{11}$/.test(videoId)) return null;

  let title = '';
  if (vr.title?.accessibility?.accessibilityData?.label) {
    title = vr.title.accessibility.accessibilityData.label;
  } else if (Array.isArray(vr.title?.runs)) {
    title = vr.title.runs.map((r) => r.text || '').join('');
  }

  let thumbnail = `https://img.youtube.com/vi/${videoId}/mqdefault.jpg`;
  const thumbs = vr.thumbnail?.thumbnails;
  if (Array.isArray(thumbs) && thumbs.length > 0) {
    const best = thumbs[thumbs.length - 1];
    if (best?.url) thumbnail = best.url;
  }

  return {
    source: 'youtube',
    sourceId: videoId,
    url: `https://www.youtube.com/watch?v=${videoId}`,
    title: title || '',
    thumbnail,
    duration: 0,
  };
}

/**
 * Breadth-first walk: collect top videoRenderer in tree order.
 */
function findVideoRenderers(root, limit = MAX_CANDIDATES) {
  const queue = [root];
  const found = [];
  const seen = new Set();
  let iters = 0;
  while (queue.length > 0 && iters++ < 200000 && found.length < limit) {
    const node = queue.shift();
    if (!node || typeof node !== 'object') continue;

    if (node.videoRenderer?.videoId) {
      const id = node.videoRenderer.videoId;
      if (!seen.has(id)) {
        seen.add(id);
        found.push(node.videoRenderer);
      }
    }

    if (Array.isArray(node)) {
      for (const item of node) queue.push(item);
      continue;
    }

    for (const val of Object.values(node)) {
      if (val && typeof val === 'object') queue.push(val);
    }
  }
  return found;
}

function extractYtInitialDataJson(html) {
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

/** Regex fallback: collect 11-char videoIds in page (may include non-organic results). */
function fallbackVideoIds(html, limit = MAX_CANDIDATES) {
  const ids = [];
  const seen = new Set();
  const regex = /"videoId":"([a-zA-Z0-9_-]{11})"/g;
  let m;
  while ((m = regex.exec(html)) !== null && ids.length < limit) {
    const id = m[1];
    if (/^[a-zA-Z0-9_-]{11}$/.test(id) && !seen.has(id)) {
      seen.add(id);
      ids.push(id);
    }
  }
  return ids;
}

async function fetchTextWithTimeout(url, timeoutMs = FETCH_TIMEOUT_MS) {
  const controller = new AbortController();
  const t = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, {
      headers: BROWSER_HEADERS,
      signal: controller.signal,
    });
    if (!response.ok) return null;
    return await response.text();
  } catch {
    return null;
  } finally {
    clearTimeout(t);
  }
}

async function fetchSearchHtml(query) {
  const url = `https://www.youtube.com/results?search_query=${encodeURIComponent(query)}`;
  return fetchTextWithTimeout(url, FETCH_TIMEOUT_MS);
}

/**
 * Verify if a video is embeddable using the YouTube oEmbed API.
 * Returns 401 for private/non-embeddable/age-restricted videos.
 * More reliable than scraping the watch page.
 */
async function isEmbeddableVideo(videoId) {
  const oembedUrl = `https://www.youtube.com/oembed?url=${encodeURIComponent(`https://www.youtube.com/watch?v=${videoId}`)}&format=json`;
  const controller = new AbortController();
  const t = setTimeout(() => controller.abort(), OEMBED_TIMEOUT_MS);
  try {
    const response = await fetch(oembedUrl, { signal: controller.signal });
    return response.ok; // 200 = embeddable, 401/403 = not embeddable
  } catch {
    // Network error or timeout — assume embeddable to avoid false negatives
    return true;
  } finally {
    clearTimeout(t);
  }
}

/**
 * @param {string} rawQuery
 * @returns {Promise<object|null>} track shape compatible with /api/resolve YouTube branch, or null
 */
async function searchYouTubeFirstVideo(rawQuery) {
  const query = String(rawQuery || '')
    .trim()
    .slice(0, MAX_QUERY_LEN);
  if (!query) return null;

  const html = await fetchSearchHtml(query);
  if (!html) return null;

  const candidateTracks = [];
  const seen = new Set();
  const pushTrack = (track) => {
    if (!track || !track.sourceId || seen.has(track.sourceId) || candidateTracks.length >= MAX_CANDIDATES) return;
    seen.add(track.sourceId);
    candidateTracks.push(track);
  };

  const ytData = extractYtInitialDataJson(html);
  if (ytData) {
    const renderers = findVideoRenderers(ytData, MAX_CANDIDATES);
    for (const vr of renderers) {
      const track = buildTrackFromVideoRenderer(vr);
      pushTrack(track);
    }
  }

  for (const vid of fallbackVideoIds(html, MAX_CANDIDATES)) {
    pushTrack({
      source: 'youtube',
      sourceId: vid,
      url: `https://www.youtube.com/watch?v=${vid}`,
      title: '',
      thumbnail: `https://img.youtube.com/vi/${vid}/mqdefault.jpg`,
      duration: 0,
    });
  }

  if (candidateTracks.length === 0) return null;

  // Check each candidate via oEmbed; fall back to first candidate if all fail
  for (const track of candidateTracks) {
    const ok = await isEmbeddableVideo(track.sourceId);
    if (ok) return track;
  }

  // If all oEmbed checks failed (e.g., network issues), return the first candidate anyway
  return candidateTracks[0];
}

module.exports = {
  searchYouTubeFirstVideo,
  MAX_QUERY_LEN,
};
