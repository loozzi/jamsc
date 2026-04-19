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

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: '*',
    methods: ['GET', 'POST'],
  },
  transports: ['polling'],   // Polling only — works on Vercel serverless
  pingTimeout: 60000,         // 60s before considering connection dead
  pingInterval: 25000,        // Ping every 25s
  upgradeTimeout: 10000,
  allowEIO3: true,            // Backwards compatibility
});

// Serve static files from public directory
app.use(express.static(path.join(__dirname, '..', 'public')));
app.use(express.json());

// ─── REST API ───────────────────────────────────────────

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
    const isHost = room.hostId === socket.id;

    // Check permission
    if (!isHost && !room.settings.allowQueueAdd) {
      return callback({ success: false, error: 'Host đã tắt quyền thêm bài hát' });
    }

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

    const state = syncManager.setTrack(roomCode, track);
    io.to(roomCode).emit('sync:track-changed', {
      track,
      playback: state,
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
   * Seek
   */
  socket.on('sync:seek', ({ time }, callback) => {
    const roomCode = roomManager.getRoomBySocket(socket.id);
    if (!roomCode) return callback?.({ success: false });

    const room = roomManager.getRoom(roomCode);
    const isHost = room.hostId === socket.id;

    if (!isHost && !room.settings.allowSeek) {
      return callback?.({ success: false, error: 'Host đã tắt quyền tua' });
    }

    const state = syncManager.seek(roomCode, time);
    io.to(roomCode).emit('sync:state', state);
    callback?.({ success: true });
  });

  /**
   * Track ended - move to next
   */
  socket.on('sync:track-ended', (_, callback) => {
    const roomCode = roomManager.getRoomBySocket(socket.id);
    if (!roomCode) return callback?.({ success: false });

    const room = roomManager.getRoom(roomCode);
    // Only host should trigger track-ended to avoid race conditions
    if (room.hostId !== socket.id) return callback?.({ success: false });

    const nextTrack = queueManager.nextTrack(roomCode);
    if (nextTrack) {
      const state = syncManager.setTrack(roomCode, nextTrack);
      io.to(roomCode).emit('sync:track-changed', {
        track: nextTrack,
        playback: state,
      });
      // Auto-play next track
      setTimeout(() => {
        const playState = syncManager.play(roomCode);
        io.to(roomCode).emit('sync:state', playState);
      }, 1000);
    } else {
      // Queue ended
      const state = syncManager.pause(roomCode);
      io.to(roomCode).emit('sync:queue-ended', state);
    }

    callback?.({ success: true });
  });

  /**
   * Next track (manual)
   */
  socket.on('sync:next', (_, callback) => {
    const roomCode = roomManager.getRoomBySocket(socket.id);
    if (!roomCode) return callback?.({ success: false });

    const room = roomManager.getRoom(roomCode);
    if (room.hostId !== socket.id) return callback?.({ success: false, error: 'Chỉ host' });

    const nextTrack = queueManager.nextTrack(roomCode);
    if (nextTrack) {
      const state = syncManager.setTrack(roomCode, nextTrack);
      io.to(roomCode).emit('sync:track-changed', { track: nextTrack, playback: state });
    }
    callback?.({ success: true });
  });

  /**
   * Previous track (manual)
   */
  socket.on('sync:prev', (_, callback) => {
    const roomCode = roomManager.getRoomBySocket(socket.id);
    if (!roomCode) return callback?.({ success: false });

    const room = roomManager.getRoom(roomCode);
    if (room.hostId !== socket.id) return callback?.({ success: false, error: 'Chỉ host' });

    const prevTrack = queueManager.prevTrack(roomCode);
    if (prevTrack) {
      const state = syncManager.setTrack(roomCode, prevTrack);
      io.to(roomCode).emit('sync:track-changed', { track: prevTrack, playback: state });
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

  // ─── Disconnect ───────────────────────

  socket.on('disconnect', () => {
    console.log(`[Disconnect] ${socket.id}`);

    const roomCode = roomManager.getRoomBySocket(socket.id);
    if (!roomCode) return;

    const room = roomManager.getRoom(roomCode);
    if (!room) return;

    const member = room.members.get(socket.id);
    const memberName = member ? member.name : 'Unknown';
    const isHost = room.hostId === socket.id;

    const result = roomManager.leaveRoom(roomCode, socket.id);

    if (result && result.deleted) {
      // Room was deleted
      stopHeartbeat(roomCode);
      queueManager.clearQueue(roomCode);
      syncManager.clearPlayback(roomCode);
      console.log(`[Room] Room ${roomCode} deleted (empty)`);
    } else if (result && result.hostTransferred) {
      // Host was transferred
      io.to(roomCode).emit('room:host-transferred', {
        newHostId: result.newHostId,
        newHostName: result.newHostName,
      });
      io.to(roomCode).emit('room:member-left', {
        memberId: socket.id,
        memberName,
      });
      console.log(`[Room] Host transferred to ${result.newHostName} in room ${roomCode}`);
    } else if (result) {
      io.to(roomCode).emit('room:member-left', {
        memberId: socket.id,
        memberName,
      });
    }
  });
});

// ─── START SERVER ───────────────────────────────────────

const PORT = process.env.PORT || 3000;

if (process.env.VERCEL) {
  // Export for Vercel serverless
  module.exports = server;
} else {
  server.listen(PORT, () => {
    console.log(`\n  🎵 JAMSC Server running on http://localhost:${PORT}\n`);
  });
}
