/**
 * JAMSC - Main Application
 * Coordinates all modules: Socket, Player, Queue, Room, UI
 */

const App = (() => {
  let currentRoomCode = null;
  let syncState = null;
  let isSyncingState = false;

  // ─── Initialize ───────────────────────────

  function init() {
    UI.initParticles();
    Player.initSoundCloud();
    SocketClient.connect();

    bindLandingEvents();
    bindRoomEvents();
    bindPlayerEvents();
    bindSocketEvents();
    bindChatEvents();

    // Auto-fill room code if opened via shared link
    const roomParam = new URLSearchParams(window.location.search).get('room');
    if (roomParam) {
      const codeInput = document.getElementById('input-room-code');
      if (codeInput) codeInput.value = roomParam.toUpperCase();
      UI.showView('view-join');
    }

    console.log('[App] JAMSC initialized');
  }

  // ─── Landing Page Events ──────────────────

  function bindLandingEvents() {
    // Create room button
    document.getElementById('btn-create-room').addEventListener('click', () => {
      UI.showView('view-create');
    });

    // Join room button
    document.getElementById('btn-join-room').addEventListener('click', () => {
      UI.showView('view-join');
    });

    // Back buttons
    document.getElementById('btn-back-create').addEventListener('click', () => {
      UI.showView('view-landing');
    });

    document.getElementById('btn-back-join').addEventListener('click', () => {
      UI.showView('view-landing');
    });

    // Create room form
    document.getElementById('form-create').addEventListener('submit', async (e) => {
      e.preventDefault();
      const name = document.getElementById('input-host-name').value.trim();
      if (!name) return;

      try {
        const response = await SocketClient.emit('room:create', { hostName: name });
        if (response.success) {
          currentRoomCode = response.room.id;
          Room.setRoom(response.room);
          Queue.setQueue({ tracks: [], currentIndex: -1 });
          history.pushState(null, '', '?room=' + response.room.id);
          UI.showView('view-room');
          UI.showToast(`Phòng ${response.room.id} đã được tạo!`, 'success');
        }
      } catch (err) {
        UI.showToast(err.message, 'error');
      }
    });

    // Join room form
    document.getElementById('form-join').addEventListener('submit', async (e) => {
      e.preventDefault();
      const code = document.getElementById('input-room-code').value.trim().toUpperCase();
      const name = document.getElementById('input-member-name').value.trim();
      if (!code || !name) return;

      try {
        const response = await SocketClient.emit('room:join', {
          roomCode: code,
          memberName: name,
        });

        if (response.success) {
          currentRoomCode = response.room.id;
          Room.setRoom(response.room);

          if (response.queue) Queue.setQueue(response.queue);

          if (response.playback && response.playback.currentTrack) {
            applyPlaybackState(response.playback);
          }

          history.pushState(null, '', '?room=' + response.room.id);
          UI.showView('view-room');
          UI.showToast(`Đã tham gia phòng ${code}!`, 'success');
        }
      } catch (err) {
        UI.showToast(err.message, 'error');
      }
    });
  }

  // ─── Room Events ──────────────────────────

  function bindRoomEvents() {
    // Copy invite link
    document.getElementById('btn-copy-code').addEventListener('click', async () => {
      if (!currentRoomCode) return;
      const inviteUrl = window.location.origin + '?room=' + currentRoomCode;
      const success = await UI.copyToClipboard(inviteUrl);
      if (success) {
        UI.showToast('Đã sao chép link mời!', 'success');
      }
    });

    // Settings modal
    document.getElementById('btn-settings').addEventListener('click', () => {
      UI.showModal('modal-settings');
    });

    document.getElementById('btn-close-settings').addEventListener('click', () => {
      UI.hideModal('modal-settings');
    });

    // Click outside modal to close
    document.getElementById('modal-settings').addEventListener('click', (e) => {
      if (e.target.id === 'modal-settings') {
        UI.hideModal('modal-settings');
      }
    });

    // Setting toggles
    document.getElementById('setting-allow-seek').addEventListener('change', (e) => {
      updateSetting({ allowSeek: e.target.checked });
    });

    document.getElementById('setting-allow-queue').addEventListener('change', (e) => {
      updateSetting({ allowQueueAdd: e.target.checked });
    });

    // Leave room
    document.getElementById('btn-leave-room').addEventListener('click', () => {
      if (confirm('Bạn có chắc muốn rời phòng?')) {
        leaveRoom();
      }
    });

    // Add track form
    document.getElementById('form-add-track').addEventListener('submit', async (e) => {
      e.preventDefault();
      const input = document.getElementById('input-track-url');
      const url = input.value.trim();
      if (!url) return;

      await addTrack(url);
      input.value = '';
    });
  }

  // ─── Player Events ────────────────────────

  function bindPlayerEvents() {
    // Play/Pause button
    document.getElementById('btn-play').addEventListener('click', () => {
      if (!Room.getIsHost()) return;
      togglePlayPause();
    });

    // Next
    document.getElementById('btn-next').addEventListener('click', async () => {
      if (!Room.getIsHost()) return;
      try {
        await SocketClient.emit('sync:next');
      } catch (err) {
        UI.showToast(err.message, 'error');
      }
    });

    // Prev
    document.getElementById('btn-prev').addEventListener('click', async () => {
      if (!Room.getIsHost()) return;
      try {
        await SocketClient.emit('sync:prev');
      } catch (err) {
        UI.showToast(err.message, 'error');
      }
    });

    // Progress bar click (seek)
    const progressBar = document.getElementById('progress-bar');
    progressBar.addEventListener('click', async (e) => {
      if (progressBar.classList.contains('disabled')) return;

      const rect = progressBar.getBoundingClientRect();
      const pct = (e.clientX - rect.left) / rect.width;
      const dur = await Player.getDuration();
      const time = pct * dur;

      try {
        await SocketClient.emit('sync:seek', { time });
      } catch (err) {
        UI.showToast(err.message, 'error');
      }
    });

    // Volume
    document.getElementById('volume-slider').addEventListener('input', (e) => {
      Player.setVolume(parseInt(e.target.value));
    });

    document.getElementById('btn-volume').addEventListener('click', () => {
      const slider = document.getElementById('volume-slider');
      if (parseInt(slider.value) > 0) {
        slider.dataset.prevVolume = slider.value;
        slider.value = 0;
        Player.setVolume(0);
      } else {
        slider.value = slider.dataset.prevVolume || 70;
        Player.setVolume(parseInt(slider.value));
      }
    });

    // Player callbacks
    Player.onStateChange((state) => {
      if (!Room.getIsHost()) return;
      if (isSyncingState) return; // Ignore events triggered by applyPlaybackState

      if (state === 'playing') {
        Player.getCurrentTime().then((time) => {
          SocketClient.emit('sync:play', { time });
        });
      } else if (state === 'paused') {
        SocketClient.emit('sync:pause');
      }
    });

    Player.onTrackEnd(() => {
      if (Room.getIsHost()) {
        SocketClient.emit('sync:track-ended');
      }
    });
  }

  // ─── Socket Events ────────────────────────

  function bindSocketEvents() {
    // Room events
    SocketClient.on('room:member-joined', ({ member }) => {
      Room.addMember(member);
      addSystemMessage(`${member.name} đã tham gia phòng`);
      UI.showToast(`${member.name} đã tham gia!`, 'info');
    });

    SocketClient.on('room:member-left', ({ memberId, memberName }) => {
      Room.removeMember(memberId);
      addSystemMessage(`${memberName} đã rời phòng`);
    });

    SocketClient.on('room:host-transferred', ({ newHostId, newHostName }) => {
      Room.transferHost(newHostId, newHostName);
      addSystemMessage(`${newHostName} đã trở thành Host`);
    });

    SocketClient.on('room:settings-updated', ({ settings }) => {
      Room.applySettings(settings);
      UI.showToast('Cài đặt phòng đã được cập nhật', 'info');
    });

    // Queue events
    SocketClient.on('queue:track-added', ({ track }) => {
      Queue.addTrack(track);

      // Try to get the YouTube title if not available
      if (track.source === 'youtube' && !track.title) {
        fetchYouTubeTitle(track);
      }
    });

    SocketClient.on('queue:track-removed', ({ trackId }) => {
      Queue.removeTrack(trackId);
    });

    // Sync events
    SocketClient.on('sync:state', (state) => {
      syncState = state;
      applyPlaybackState(state);
    });

    SocketClient.on('sync:track-changed', ({ track, playback }) => {
      // Update queue current index
      const tracks = Queue.getTracks();
      const newIndex = tracks.findIndex((t) => t.id === track.id);
      if (newIndex !== -1) {
        Queue.setCurrentIndex(newIndex);
      }

      // Load the track
      Player.loadTrack(track);
      updateNowPlaying(track);

      if (playback) {
        syncState = playback;
        applyPlaybackState(playback);
      }
    });

    SocketClient.on('sync:heartbeat', (state) => {
      if (!state || !state.currentTrack) return;
      if (isSyncingState) return;
      Player.getCurrentTime().then((localTime) => {
        // Compensate for network latency when comparing positions
        const networkElapsed = (Date.now() - state.lastSyncAt) / 1000;
        const serverTime = state.currentTime + networkElapsed;
        const drift = Math.abs(localTime - serverTime);
        if (drift > 2 && drift < 30 && state.isPlaying) {
          console.log(`[Sync] Drift detected: ${drift.toFixed(1)}s, re-syncing...`);
          Player.seekTo(serverTime);
        }
      });
    });

    SocketClient.on('sync:queue-ended', () => {
      Player.pause();
      Player.updatePlayButton(false);
      UI.showToast('Đã phát hết hàng chờ!', 'info');
    });

    // Chat
    SocketClient.on('chat:message', (msg) => {
      addChatMessage(msg);
    });
  }

  // ─── Chat ─────────────────────────────────

  function bindChatEvents() {
    document.getElementById('form-chat').addEventListener('submit', (e) => {
      e.preventDefault();
      const input = document.getElementById('input-chat');
      const message = input.value.trim();
      if (!message) return;

      SocketClient.getSocket().emit('chat:message', { message });
      input.value = '';
    });
  }

  function addChatMessage(msg) {
    const container = document.getElementById('chat-messages');
    if (!container) return;

    const div = document.createElement('div');
    div.className = 'chat-msg';
    div.innerHTML = `
      <span class="chat-msg-name ${msg.isHost ? 'host' : ''}">${escapeHtml(msg.senderName)}:</span>
      <span class="chat-msg-text">${escapeHtml(msg.message)}</span>
    `;

    container.appendChild(div);
    container.scrollTop = container.scrollHeight;
  }

  function addSystemMessage(text) {
    const container = document.getElementById('chat-messages');
    if (!container) return;

    const div = document.createElement('div');
    div.className = 'chat-msg-system';
    div.textContent = text;

    container.appendChild(div);
    container.scrollTop = container.scrollHeight;
  }

  // ─── Playback Control ─────────────────────

  async function togglePlayPause() {
    const currentTrack = Queue.getCurrentTrack();
    if (!currentTrack) {
      UI.showToast('Chưa có bài nào trong hàng chờ', 'info');
      return;
    }

    const time = await Player.getCurrentTime();

    // Check current state
    const iconPlay = document.getElementById('icon-play');
    const isCurrentlyPlaying = iconPlay.style.display === 'none';

    if (isCurrentlyPlaying) {
      try {
        await SocketClient.emit('sync:pause');
      } catch (err) {
        UI.showToast(err.message, 'error');
      }
    } else {
      try {
        await SocketClient.emit('sync:play', { time });
      } catch (err) {
        UI.showToast(err.message, 'error');
      }
    }
  }

  // ─── Apply Sync State ─────────────────────

  function applyPlaybackState(state) {
    if (!state) return;

    let trackChanged = false;
    if (state.currentTrack) {
      const playing = Queue.getCurrentTrack();
      if (!playing || playing.id !== state.currentTrack.id) {
        trackChanged = true;
        Player.loadTrack(state.currentTrack);
        updateNowPlaying(state.currentTrack);
        const tracks = Queue.getTracks();
        const idx = tracks.findIndex((t) => t.id === state.currentTrack.id);
        if (idx !== -1) Queue.setCurrentIndex(idx);
      }
    }

    const seekAndPlay = () => {
      isSyncingState = true;
      if (state.isPlaying) {
        const elapsed = (Date.now() - state.lastSyncAt) / 1000;
        const targetTime = state.currentTime + elapsed;
        Player.seekTo(targetTime);
        Player.play();
      } else {
        Player.seekTo(state.currentTime);
        Player.pause();
      }
      setTimeout(() => { isSyncingState = false; }, 1500);
    };

    // When track just loaded, wait for the player to initialize before seeking/playing
    if (trackChanged) {
      setTimeout(seekAndPlay, 1500);
    } else {
      seekAndPlay();
    }
  }

  // ─── Now Playing UI ───────────────────────

  function updateNowPlaying(track) {
    const emptyEl = document.getElementById('now-playing-empty');
    const infoEl = document.getElementById('now-playing-info');

    if (!track) {
      emptyEl.style.display = 'block';
      infoEl.style.display = 'none';
      return;
    }

    emptyEl.style.display = 'none';
    infoEl.style.display = 'flex';

    const thumb = document.getElementById('now-playing-thumb');
    const title = document.getElementById('now-playing-title');
    const source = document.getElementById('now-playing-source');
    const added = document.getElementById('now-playing-added');

    if (track.thumbnail) {
      thumb.src = track.thumbnail;
    } else {
      thumb.src = '';
    }

    title.textContent = track.title || 'Loading...';
    source.textContent = track.source === 'youtube' ? 'YouTube' : 'SoundCloud';
    added.textContent = `Thêm bởi ${track.addedBy || 'Unknown'}`;

    // If YouTube, try to get title after loading
    if (track.source === 'youtube' && !track.title) {
      setTimeout(async () => {
        const ytTitle = await Player.getYouTubeTitle();
        if (ytTitle) {
          title.textContent = ytTitle;
          Queue.updateTrackTitle(track.id, ytTitle);
        }
      }, 2000);
    }
  }

  // ─── Track Management ─────────────────────

  async function addTrack(url) {
    try {
      // Resolve URL via API
      const response = await fetch(`/api/resolve?url=${encodeURIComponent(url)}`);
      const data = await response.json();

      if (data.error) {
        UI.showToast(data.error, 'error');
        return;
      }

      // Add to queue via socket
      await SocketClient.emit('queue:add', { track: data });
      UI.showToast('Đã thêm vào hàng chờ!', 'success');
    } catch (err) {
      UI.showToast(err.message || 'Không thể thêm bài hát', 'error');
    }
  }

  async function removeTrack(trackId) {
    try {
      await SocketClient.emit('queue:remove', { trackId });
    } catch (err) {
      UI.showToast(err.message, 'error');
    }
  }

  async function skipToTrack(trackId) {
    if (!Room.getIsHost()) {
      UI.showToast('Chỉ host mới có quyền chuyển bài', 'info');
      return;
    }
    try {
      await SocketClient.emit('queue:skip-to', { trackId });
    } catch (err) {
      UI.showToast(err.message, 'error');
    }
  }

  // ─── Settings ─────────────────────────────

  async function updateSetting(settings) {
    try {
      await SocketClient.emit('room:update-settings', { settings });
    } catch (err) {
      UI.showToast(err.message, 'error');
    }
  }

  // ─── Leave Room ───────────────────────────

  function leaveRoom() {
    currentRoomCode = null;
    syncState = null;
    history.pushState(null, '', '/');

    // Disconnect and reconnect
    const socket = SocketClient.getSocket();
    if (socket) {
      socket.disconnect();
      setTimeout(() => {
        socket.connect();
      }, 500);
    }

    UI.showView('view-landing');
    UI.showToast('Đã rời phòng', 'info');

    // Reset UI
    document.getElementById('chat-messages').innerHTML = '';
    Player.pause();
    Player.updatePlayButton(false);
    document.getElementById('now-playing-empty').style.display = 'block';
    document.getElementById('now-playing-info').style.display = 'none';
    document.getElementById('progress-fill').style.width = '0%';
    document.getElementById('time-current').textContent = '0:00';
    document.getElementById('time-duration').textContent = '0:00';
  }

  // ─── Reconnect Handler ────────────────────

  function onReconnect() {
    if (currentRoomCode) {
      // Try to re-sync
      SocketClient.emit('sync:request-state').then((response) => {
        if (response.success) {
          if (response.queue) Queue.setQueue(response.queue);
          if (response.playback) applyPlaybackState(response.playback);
        }
      }).catch(() => {
        // Room might not exist anymore
        UI.showToast('Phòng có thể đã bị xóa. Vui lòng tạo hoặc tham gia phòng mới.', 'warning');
        leaveRoom();
      });
    }
  }

  // ─── YouTube Title Fetch ──────────────────

  async function fetchYouTubeTitle(track) {
    // Wait for YouTube player to load the video
    setTimeout(async () => {
      const title = await Player.getYouTubeTitle();
      if (title && title !== '') {
        Queue.updateTrackTitle(track.id, title);
        // Update now playing too
        const titleEl = document.getElementById('now-playing-title');
        if (titleEl && titleEl.textContent === 'Loading...') {
          titleEl.textContent = title;
        }
      }
    }, 3000);
  }

  // ─── Helpers ──────────────────────────────

  function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }

  return {
    init,
    onReconnect,
    skipToTrack,
    removeTrack,
    addTrack,
  };
})();

// ─── Start App ──────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
  App.init();
});
