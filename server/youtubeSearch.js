/**
 * YouTube search by keyword — first organic video result (no Data API).
 * Fetches /results and parses embedded ytInitialData; fragile if YouTube changes HTML.
 */

const MAX_QUERY_LEN = 200;
const FETCH_TIMEOUT_MS = 12000;

const BROWSER_HEADERS = {
  'User-Agent':
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  'Accept-Language': 'en-US,en;q=0.9',
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
 * Breadth-first walk: first videoRenderer in tree order (roughly matches first result slot).
 */
function findFirstVideoRenderer(root) {
  const queue = [root];
  let iters = 0;
  while (queue.length > 0 && iters++ < 200000) {
    const node = queue.shift();
    if (!node || typeof node !== 'object') continue;

    if (node.videoRenderer?.videoId) {
      return node.videoRenderer;
    }

    if (Array.isArray(node)) {
      for (const item of node) queue.push(item);
      continue;
    }

    for (const val of Object.values(node)) {
      if (val && typeof val === 'object') queue.push(val);
    }
  }
  return null;
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

/** Regex fallback: first 11-char videoId in page (may be wrong if ads embed ids first). */
function fallbackFirstVideoId(html) {
  const regex = /"videoId":"([a-zA-Z0-9_-]{11})"/g;
  let m;
  while ((m = regex.exec(html)) !== null) {
    const id = m[1];
    if (/^[a-zA-Z0-9_-]{11}$/.test(id)) return id;
  }
  return null;
}

async function fetchSearchHtml(query) {
  const url = `https://www.youtube.com/results?search_query=${encodeURIComponent(query)}`;
  const controller = new AbortController();
  const t = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    const response = await fetch(url, {
      headers: BROWSER_HEADERS,
      signal: controller.signal,
    });
    if (!response.ok) return null;
    return await response.text();
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

  const ytData = extractYtInitialDataJson(html);
  if (ytData) {
    const vr = findFirstVideoRenderer(ytData);
    if (vr) {
      const track = buildTrackFromVideoRenderer(vr);
      if (track) return track;
    }
  }

  const vid = fallbackFirstVideoId(html);
  if (!vid) return null;

  return {
    source: 'youtube',
    sourceId: vid,
    url: `https://www.youtube.com/watch?v=${vid}`,
    title: '',
    thumbnail: `https://img.youtube.com/vi/${vid}/mqdefault.jpg`,
    duration: 0,
  };
}

module.exports = {
  searchYouTubeFirstVideo,
  MAX_QUERY_LEN,
};
