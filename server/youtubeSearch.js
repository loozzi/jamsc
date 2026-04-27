/**
 * YouTube search by keyword — first organic video result (no Data API).
 * Fetches /results and parses embedded ytInitialData; fragile if YouTube changes HTML.
 */

const MAX_QUERY_LEN = 200;
const FETCH_TIMEOUT_MS = 12000;
const VERIFY_TIMEOUT_MS = 8000;
const MAX_CANDIDATES = 8;

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
  } finally {
    clearTimeout(t);
  }
}

async function fetchSearchHtml(query) {
  const url = `https://www.youtube.com/results?search_query=${encodeURIComponent(query)}`;
  return fetchTextWithTimeout(url, FETCH_TIMEOUT_MS);
}

/**
 * Verify if video can be played in embedded context.
 * This checks common playability flags from watch page payload.
 */
async function isEmbeddableVideo(videoId) {
  const watchUrl = `https://www.youtube.com/watch?v=${videoId}&hl=en`;
  const html = await fetchTextWithTimeout(watchUrl, VERIFY_TIMEOUT_MS);
  if (!html) return false;

  if (html.includes('"playableInEmbed":false')) return false;

  // Common restricted statuses in player response
  if (
    html.includes('"status":"LOGIN_REQUIRED"') ||
    html.includes('"status":"AGE_CHECK_REQUIRED"') ||
    html.includes('"status":"UNPLAYABLE"') ||
    html.includes('"status":"ERROR"')
  ) {
    return false;
  }

  // Require at least one positive signal to avoid weak false positives
  if (html.includes('"playableInEmbed":true') || html.includes('"status":"OK"')) {
    return true;
  }

  return false;
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

  for (const track of candidateTracks) {
    const ok = await isEmbeddableVideo(track.sourceId);
    if (ok) return track;
  }

  return null;
}

module.exports = {
  searchYouTubeFirstVideo,
  MAX_QUERY_LEN,
};
