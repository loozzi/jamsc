/**
 * JAMSC Server - Express + Socket.IO
 * Main entry point for the shared music listening app
 */

const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');
const roomManager = require('./roomManager');
const queueManager = require('./queueManager');
const syncManager = require('./syncManager');
const youtubeSearch = require('./youtubeSearch');

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: process.env.CORS_ORIGIN || '*',
    methods: ['GET', 'POST'],
  },
  transports: ['websocket', 'polling'],
  pingTimeout: 60000,
  pingInterval: 25000,
});

// Serve static files from public directory
app.use(express.static(path.join(__dirname, '..', 'public')));
app.use(express.json());

// ─── REST API ───────────────────────────────────────────

/**
 * Resolve a YouTube playlist URL and return an array of track metadata
 */
app.get('/api/resolve-playlist', async (req, res) => {
  const { url } = req.query;
  if (!url) return res.status(400).json({ error: 'URL is required' });

  try {
    const tracks = await resolvePlaylist(url);
    if (!tracks || tracks.length === 0) {
      return res.status(400).json({ error: 'Không thể tải playlist. Hãy kiểm tra link và thử lại.' });
    }
    res.json({ tracks });
  } catch (err) {
    console.error('Playlist resolve error:', err);
    res.status(500).json({ error: 'Không thể xử lý playlist này' });
  }
});

/**
 * Resolve a music URL to metadata
 * Detects source type and extracts ID, fetches metadata via oEmbed
 */
app.get('/api/resolve', async (req, res) => {
  const { url } = req.query;
  if (!url) return res.status(400).json({ error: 'URL is required' });

  try {
    const resolved = await resolveUrl(url);
    if (!resolved) {
      return res.status(400).json({ error: 'URL không được hỗ trợ. Hãy dùng link YouTube hoặc SoundCloud.' });
    }
    res.json(resolved);
  } catch (err) {
    console.error('Resolve error:', err);
    res.status(500).json({ error: 'Không thể xử lý URL này' });
  }
});

/**
 * YouTube keyword search — first result (scrape, no Data API). Experimental.
 */
app.get('/api/youtube-search-first', async (req, res) => {
  const q = typeof req.query.q === 'string' ? req.query.q.trim() : '';
  if (!q) {
    return res.status(400).json({ error: 'Nhập từ khóa tìm kiếm.' });
  }

  try {
    const track = await youtubeSearch.searchYouTubeFirstVideo(q);
    if (!track) {
      return res.status(404).json({ error: 'Không tìm thấy video phù hợp. Thử từ khóa khác.' });
    }
    if (!track.title && track.url) {
      try {
        const enriched = await resolveUrl(track.url);
        if (enriched) {
          if (enriched.title) track.title = enriched.title;
          if (enriched.thumbnail) track.thumbnail = enriched.thumbnail;
        }
      } catch (_) {
        /* keep scrape-only metadata */
      }
    }
    res.json({ track });
  } catch (err) {
    console.error('YouTube search error:', err);
    res.status(500).json({ error: 'Không thể tìm kiếm lúc này. Thử lại sau.' });
  }
});

/**
 * Fetch JSON from a URL (built-in fetch for Node 18+, fallback for older)
 */
async function fetchJson(url) {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  return response.json();
}

/**
 * Parse and resolve music URL, fetching metadata via oEmbed APIs
 */
async function resolveUrl(url) {
  // YouTube patterns
  const ytPatterns = [
    /(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/embed\/|music\.youtube\.com\/watch\?v=)([a-zA-Z0-9_-]{11})/,
    /youtube\.com\/shorts\/([a-zA-Z0-9_-]{11})/,
  ];

  for (const pattern of ytPatterns) {
    const match = url.match(pattern);
    if (match) {
      const videoId = match[1];
      const videoUrl = `https://www.youtube.com/watch?v=${videoId}`;

      // Fetch metadata via YouTube oEmbed API (free, no API key needed)
      let title = '';
      let thumbnail = `https://img.youtube.com/vi/${videoId}/mqdefault.jpg`;
      try {
        const oembed = await fetchJson(
          `https://www.youtube.com/oembed?url=${encodeURIComponent(videoUrl)}&format=json`
        );
        title = oembed.title || '';
        if (oembed.thumbnail_url) {
          thumbnail = oembed.thumbnail_url;
        }
      } catch (e) {
        console.warn('[Resolve] YouTube oEmbed failed, using fallback:', e.message);
      }

      return {
        source: 'youtube',
        sourceId: videoId,
        url: videoUrl,
        title,
        thumbnail,
        duration: 0,
      };
    }
  }

  // SoundCloud patterns
  if (url.includes('soundcloud.com/')) {
    const cleanUrl = url.split('?')[0];

    // Fetch metadata via SoundCloud oEmbed API (free, no API key needed)
    let title = '';
    let thumbnail = '';
    try {
      const oembed = await fetchJson(
        `https://soundcloud.com/oembed?url=${encodeURIComponent(cleanUrl)}&format=json`
      );
      title = oembed.title || '';
      if (oembed.thumbnail_url) {
        thumbnail = oembed.thumbnail_url;
      }
    } catch (e) {
      console.warn('[Resolve] SoundCloud oEmbed failed, using fallback:', e.message);
    }

    return {
      source: 'soundcloud',
      sourceId: cleanUrl,
      url: cleanUrl,
      title,
      thumbnail,
      duration: 0,
    };
  }

  return null;
}

/**
 * Fetch all video IDs and titles from a YouTube playlist page (no API key needed)
 */
async function resolvePlaylist(url) {
  const listMatch = url.match(/[?&]list=([a-zA-Z0-9_-]+)/);
  if (!listMatch) return null;

  const playlistId = listMatch[1];

  let html;
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

  const videos = [];

  // Try to parse ytInitialData embedded JSON
  const dataMarker = 'var ytInitialData = ';
  const markerPos = html.indexOf(dataMarker);
  if (markerPos !== -1) {
    const jsonStart = markerPos + dataMarker.length;
    const scriptClose = html.indexOf(';</script>', jsonStart);
    if (scriptClose !== -1) {
      try {
        const ytData = JSON.parse(html.slice(jsonStart, scriptClose));
        // Iterative DFS to find all playlistVideoRenderer items (preserves order)
        const stack = [ytData];
        let iters = 0;
        while (stack.length > 0 && videos.length < 50 && iters++ < 100000) {
          const node = stack.pop();
          if (!node || typeof node !== 'object') continue;
          if (Array.isArray(node)) {
            for (const item of node) stack.push(item);
            continue;
          }
          if (node.playlistVideoRenderer?.videoId) {
            const v = node.playlistVideoRenderer;
            videos.push({ videoId: v.videoId, title: v.title?.runs?.[0]?.text || '' });
            continue;
          }
          for (const val of Object.values(node)) {
            if (val && typeof val === 'object') stack.push(val);
          }
        }
      } catch {
        // Fall through to regex fallback
      }
    }
  }

  // Fallback: extract unique video IDs via regex
  if (videos.length === 0) {
    const seen = new Set();
    const regex = /"videoId":"([a-zA-Z0-9_-]{11})"/g;
    let m;
    while ((m = regex.exec(html)) !== null && videos.length < 50) {
      if (!seen.has(m[1])) {
        seen.add(m[1]);
        videos.push({ videoId: m[1], title: '' });
      }
    }
  }

  if (videos.length === 0) return null;

  return videos.map((v) => ({
    source: 'youtube',
    sourceId: v.videoId,
    url: `https://www.youtube.com/watch?v=${v.videoId}`,
    title: v.title,
    thumbnail: `https://img.youtube.com/vi/${v.videoId}/mqdefault.jpg`,
    duration: 0,
  }));
}

// ─── SOCKET.IO ──────────────────────────────────────────

// Heartbeat intervals per room
const heartbeatIntervals = new Map();

function startHeartbeat(roomCode) {
  if (heartbeatIntervals.has(roomCode)) return;

  const interval = setInterval(() => {
    const room = roomManager.getRoom(roomCode);
    if (!room || room.members.size === 0) {
      stopHeartbeat(roomCode);
      return;
    }
    const state = syncManager.getHeartbeat(roomCode);
    if (state) {
      io.to(roomCode).emit('sync:heartbeat', state);
    }
  }, 5000);

  heartbeatIntervals.set(roomCode, interval);
}

function stopHeartbeat(roomCode) {
  const interval = heartbeatIntervals.get(roomCode);
  if (interval) {
    clearInterval(interval);
    heartbeatIntervals.delete(roomCode);
  }
}

/**
 * Handle a member leaving — called from both explicit room:leave event and disconnect.
 * Safe to call multiple times; exits early if socket is no longer in any room.
 */
function handleLeave(socket) {
  const roomCode = roomManager.getRoomBySocket(socket.id);
  if (!roomCode) return;

  const room = roomManager.getRoom(roomCode);
  if (!room) return;

  const member = room.members.get(socket.id);
  const memberName = member ? member.name : 'Unknown';

  const result = roomManager.leaveRoom(roomCode, socket.id);

  if (result && result.deleted) {
    stopHeartbeat(roomCode);
    queueManager.clearQueue(roomCode);
    syncManager.clearPlayback(roomCode);
    console.log(`[Room] Room ${roomCode} deleted (empty)`);
  } else if (result && result.hostTransferred) {
    io.to(roomCode).emit('room:host-transferred', {
      newHostId: result.newHostId,
      newHostName: result.newHostName,
    });
    io.to(roomCode).emit('room:member-left', { memberId: socket.id, memberName });
    console.log(`[Room] Host transferred to ${result.newHostName} in room ${roomCode}`);
  } else if (result) {
    io.to(roomCode).emit('room:member-left', { memberId: socket.id, memberName });
  }
}

io.on('connection', (socket) => {
  console.log(`[Connect] ${socket.id}`);

  // ─── Room Events ────────────────────────

  /**
   * Create a new room
   */
  socket.on('room:create', ({ hostName }, callback) => {
    const room = roomManager.createRoom(socket.id, hostName);
    socket.join(room.id);
    queueManager.initQueue(room.id);
    syncManager.initPlayback(room.id);
    startHeartbeat(room.id);

    console.log(`[Room] ${hostName} created room ${room.id}`);
    callback({
      success: true,
      room: roomManager.serializeRoom(room),
    });
  });

  /**
   * Join an existing room
   */
  socket.on('room:join', ({ roomCode, memberName }, callback) => {
    const code = roomCode.toUpperCase().trim();
    const result = roomManager.joinRoom(code, socket.id, memberName);

    if (result.error) {
      return callback({ success: false, error: result.error });
    }

    socket.join(code);
    const room = result.room;

    console.log(`[Room] ${memberName} joined room ${code}`);

    // Notify other members
    socket.to(code).emit('room:member-joined', {
      member: { id: socket.id, name: memberName, isHost: false },
    });

    // Send current state
    const queueData = queueManager.serializeQueue(code);
    const playbackState = syncManager.getPlaybackState(code);

    callback({
      success: true,
      room: roomManager.serializeRoom(room),
      queue: queueData,
      playback: playbackState,
    });
  });

  /**
   * Update room settings
   */
  socket.on('room:update-settings', ({ settings }, callback) => {
    const roomCode = roomManager.getRoomBySocket(socket.id);
    if (!roomCode) return callback({ success: false, error: 'Không trong phòng nào' });

    const result = roomManager.updateSettings(roomCode, socket.id, settings);
    if (result.error) return callback({ success: false, error: result.error });

    io.to(roomCode).emit('room:settings-updated', {
      settings: result.room.settings,
    });

    callback({ success: true });
  });

  // ─── Queue Events ──────────────────────

  /**
   * Add a track to the queue
   */
  socket.on('queue:add', ({ track }, callback) => {
    const roomCode = roomManager.getRoomBySocket(socket.id);
    if (!roomCode) return callback({ success: false, error: 'Không trong phòng nào' });

    const room = roomManager.getRoom(roomCode);
    const member = room.members.get(socket.id);
    track.addedBy = member ? member.name : 'Unknown';
    track.addedBySocketId = socket.id;

    const queueItem = queueManager.addToQueue(roomCode, track);

    console.log(`[Queue] ${track.addedBy} added "${track.title}" to room ${roomCode}`);

    // Broadcast to all in room
    io.to(roomCode).emit('queue:track-added', { track: queueItem });

    // If this is the first track, auto-load it
    const { queue } = queueManager.getQueue(roomCode);
    if (queue.length === 1) {
      const state = syncManager.setTrack(roomCode, queueItem);
      io.to(roomCode).emit('sync:track-changed', {
        track: queueItem,
        playback: state,
      });
    }

    callback({ success: true, track: queueItem });
  });

  /**
   * Add multiple tracks to queue at once (playlist support)
   */
  socket.on('queue:add-batch', ({ tracks: incoming }, callback) => {
    const roomCode = roomManager.getRoomBySocket(socket.id);
    if (!roomCode) return callback?.({ success: false, error: 'Không trong phòng nào' });

    const room = roomManager.getRoom(roomCode);
    const member = room.members.get(socket.id);

    const { queue: existingQueue } = queueManager.getQueue(roomCode);
    const wasEmpty = existingQueue.length === 0;

    const addedTracks = [];
    for (const track of (incoming || []).slice(0, 50)) {
      track.addedBy = member ? member.name : 'Unknown';
      track.addedBySocketId = socket.id;
      const queueItem = queueManager.addToQueue(roomCode, track);
      addedTracks.push(queueItem);
    }

    if (addedTracks.length === 0) {
      return callback?.({ success: false, error: 'Không có bài nào được thêm' });
    }

    io.to(roomCode).emit('queue:tracks-added', { tracks: addedTracks });

    if (wasEmpty) {
      const state = syncManager.setTrack(roomCode, addedTracks[0]);
      io.to(roomCode).emit('sync:track-changed', { track: addedTracks[0], playback: state });
    }

    console.log(`[Queue] ${member?.name} added ${addedTracks.length} tracks (batch) to room ${roomCode}`);
    callback?.({ success: true, tracks: addedTracks });
  });

  /**
   * Reorder queue tracks
   */
  socket.on('queue:reorder', ({ trackIds }, callback) => {
    const roomCode = roomManager.getRoomBySocket(socket.id);
    if (!roomCode) return callback?.({ success: false, error: 'Không trong phòng nào' });

    const room = roomManager.getRoom(roomCode);
    if (room.hostId !== socket.id) {
      return callback?.({ success: false, error: 'Chỉ host mới có quyền sắp xếp' });
    }

    const ok = queueManager.reorderQueue(roomCode, trackIds);
    if (!ok) return callback?.({ success: false, error: 'Lỗi sắp xếp' });

    const queue = queueManager.serializeQueue(roomCode);
    io.to(roomCode).emit('queue:reordered', { queue });
    callback?.({ success: true });
  });

  /**
   * Remove a track from the queue
   */
  socket.on('queue:remove', ({ trackId }, callback) => {
    const roomCode = roomManager.getRoomBySocket(socket.id);
    if (!roomCode) return callback({ success: false, error: 'Không trong phòng nào' });

    const room = roomManager.getRoom(roomCode);
    const isHost = room.hostId === socket.id;

    // Only host can remove
    if (!isHost) {
      return callback({ success: false, error: 'Chỉ host mới có quyền xóa bài' });
    }

    const removed = queueManager.removeFromQueue(roomCode, trackId);
    if (!removed) return callback({ success: false, error: 'Không tìm thấy bài hát' });

    io.to(roomCode).emit('queue:track-removed', { trackId });

    callback({ success: true });
  });

  /**
   * Skip to a specific track
   */
  socket.on('queue:skip-to', ({ trackId }, callback) => {
    const roomCode = roomManager.getRoomBySocket(socket.id);
    if (!roomCode) return callback({ success: false, error: 'Không trong phòng nào' });

    const room = roomManager.getRoom(roomCode);
    if (room.hostId !== socket.id) {
      return callback({ success: false, error: 'Chỉ host mới có quyền chuyển bài' });
    }

    const track = queueManager.skipToTrack(roomCode, trackId);
    if (!track) return callback({ success: false, error: 'Không tìm thấy bài hát' });

    syncManager.setTrack(roomCode, track);
    const playState = syncManager.play(roomCode);
    io.to(roomCode).emit('sync:track-changed', {
      track,
      playback: playState,
    });

    callback({ success: true });
  });

  // ─── Sync Events ──────────────────────

  /**
   * Play
   */
  socket.on('sync:play', ({ time }, callback) => {
    const roomCode = roomManager.getRoomBySocket(socket.id);
    if (!roomCode) return callback?.({ success: false });

    const room = roomManager.getRoom(roomCode);
    if (room.hostId !== socket.id) return callback?.({ success: false, error: 'Chỉ host' });

    const state = syncManager.play(roomCode, time);
    io.to(roomCode).emit('sync:state', state);
    callback?.({ success: true });
  });

  /**
   * Pause
   */
  socket.on('sync:pause', (_, callback) => {
    const roomCode = roomManager.getRoomBySocket(socket.id);
    if (!roomCode) return callback?.({ success: false });

    const room = roomManager.getRoom(roomCode);
    if (room.hostId !== socket.id) return callback?.({ success: false, error: 'Chỉ host' });

    const state = syncManager.pause(roomCode);
    io.to(roomCode).emit('sync:state', state);
    callback?.({ success: true });
  });

  /**
   * Seek to a time position (seconds) — host only
   */
  socket.on('sync:seek', ({ time }, callback) => {
    const roomCode = roomManager.getRoomBySocket(socket.id);
    if (!roomCode) return callback?.({ success: false, error: 'Không trong phòng nào' });

    const room = roomManager.getRoom(roomCode);
    if (room.hostId !== socket.id) {
      return callback?.({ success: false, error: 'Chỉ host' });
    }

    const t = Number(time);
    if (!Number.isFinite(t)) {
      return callback?.({ success: false, error: 'Thời gian không hợp lệ' });
    }

    const before = syncManager.getPlaybackState(roomCode);
    if (!before || !before.currentTrack) {
      return callback?.({ success: false, error: 'Chưa có bài để tua' });
    }

    let clamped = Math.max(0, t);
    const dur = before.currentTrack.duration;
    if (dur > 0 && clamped > dur) {
      clamped = dur;
    }

    const state = syncManager.seek(roomCode, clamped);
    if (!state) return callback?.({ success: false, error: 'Không thể tua' });

    io.to(roomCode).emit('sync:state', state);
    callback?.({ success: true });
  });

  /**
   * Track ended - remove played track and advance to next
   */
  socket.on('sync:track-ended', (_, callback) => {
    const roomCode = roomManager.getRoomBySocket(socket.id);
    if (!roomCode) return callback?.({ success: false });

    const room = roomManager.getRoom(roomCode);
    // Only host should trigger track-ended to avoid race conditions
    if (room.hostId !== socket.id) return callback?.({ success: false });

    const { removedId, nextTrack } = queueManager.removeCurrentAndGetNext(roomCode);

    if (removedId) {
      io.to(roomCode).emit('queue:track-removed', { trackId: removedId });
    }

    if (nextTrack) {
      syncManager.setTrack(roomCode, nextTrack);
      const playState = syncManager.play(roomCode);
      io.to(roomCode).emit('sync:track-changed', { track: nextTrack, playback: playState });
    } else {
      const state = syncManager.pause(roomCode);
      io.to(roomCode).emit('sync:queue-ended', state);
    }

    callback?.({ success: true });
  });

  /**
   * Next track (manual) - removes current track before advancing
   */
  socket.on('sync:next', (_, callback) => {
    const roomCode = roomManager.getRoomBySocket(socket.id);
    if (!roomCode) return callback?.({ success: false });

    const room = roomManager.getRoom(roomCode);
    const isHost = room.hostId === socket.id;
    if (!isHost && !room.settings.allowSkip) return callback?.({ success: false, error: 'Chỉ host mới có quyền chuyển bài' });

    const { removedId, nextTrack } = queueManager.removeCurrentAndGetNext(roomCode);

    if (removedId) {
      io.to(roomCode).emit('queue:track-removed', { trackId: removedId });
    }

    if (nextTrack) {
      syncManager.setTrack(roomCode, nextTrack);
      const playState = syncManager.play(roomCode);
      io.to(roomCode).emit('sync:track-changed', { track: nextTrack, playback: playState });
    } else {
      const state = syncManager.pause(roomCode);
      io.to(roomCode).emit('sync:queue-ended', state);
    }
    callback?.({ success: true });
  });

  /**
   * Request current state (for re-sync on reconnect)
   */
  socket.on('sync:request-state', (_, callback) => {
    const roomCode = roomManager.getRoomBySocket(socket.id);
    if (!roomCode) return callback?.({ success: false });

    const state = syncManager.getPlaybackState(roomCode);
    const queue = queueManager.serializeQueue(roomCode);
    callback?.({ success: true, playback: state, queue });
  });

  // ─── Chat (bonus) ─────────────────────

  socket.on('chat:message', ({ message }) => {
    const roomCode = roomManager.getRoomBySocket(socket.id);
    if (!roomCode) return;

    const room = roomManager.getRoom(roomCode);
    const member = room.members.get(socket.id);
    if (!member) return;

    io.to(roomCode).emit('chat:message', {
      senderId: socket.id,
      senderName: member.name,
      message: message.substring(0, 500), // Limit message length
      timestamp: Date.now(),
      isHost: member.isHost,
    });
  });

  // ─── Leave / Disconnect ───────────────

  /**
   * Explicit leave — client sends this before disconnecting for immediate cleanup
   */
  socket.on('room:leave', (_, callback) => {
    handleLeave(socket);
    callback?.({ success: true });
  });

  socket.on('disconnect', () => {
    console.log(`[Disconnect] ${socket.id}`);
    handleLeave(socket);
  });
});

// ─── START SERVER ───────────────────────────────────────

const PORT = process.env.PORT || 3000;

server.listen(PORT, () => {
  console.log(`\n  JAMSC Server running on http://localhost:${PORT}\n`);
});
