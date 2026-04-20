/**
 * JAMSC - Main Application
 * Coordinates all modules: Socket, Player, Queue, Room, UI
 */

const App = (() => {
  let currentRoomCode = null;
  let loadedTrackId = null;    // ID of the track currently loaded in the player
  let isLoadingTrack = false;  // True during the window after loadTrack is called
  let pendingSeekState = null; // Latest state to apply once loading completes
  let progressScrubPointerId = null; // Active pointer on custom progress bar (host scrub)
  let progressScrubLastClientX = 0;

  const PLAYER_WIDTH_STORAGE_KEY = 'jamsc-player-width';

  function clampPlayerWidth(px) {
    const wrap = document.getElementById('player-wrapper');
    const parent = wrap?.parentElement;
    const avail = parent ? Math.max(0, parent.clientWidth) : Math.max(0, window.innerWidth - 24);
    const maxW = Math.min(avail, 1600);
    const minW = 260;
    return Math.round(Math.min(maxW, Math.max(minW, px)));
  }

  function applyStoredPlayerWidth() {
    const wrap = document.getElementById('player-wrapper');
    if (!wrap) return;
    try {
      const raw = localStorage.getItem(PLAYER_WIDTH_STORAGE_KEY);
      if (!raw) return;
      const w = parseInt(raw, 10);
      if (!Number.isFinite(w)) return;
      wrap.style.setProperty('--player-custom-width', `${clampPlayerWidth(w)}px`);
    } catch (_) {
      // ignore
    }
  }

  function bindPlayerResize() {
    const handle = document.getElementById('player-resize-handle');
    const wrap = document.getElementById('player-wrapper');
    if (!handle || !wrap) return;

    let active = false;
    let startX = 0;
    let startW = 0;
    let ptrId = null;

    function endDrag(e) {
      if (!active || e.pointerId !== ptrId) return;
      active = false;
      ptrId = null;
      document.body.classList.remove('player-resize-active');
      try {
        handle.releasePointerCapture(e.pointerId);
      } catch (_) {
        // ignore
      }

      const w = Math.round(wrap.getBoundingClientRect().width);
      try {
        localStorage.setItem(PLAYER_WIDTH_STORAGE_KEY, String(clampPlayerWidth(w)));
      } catch (_) {
        // ignore
      }
    }

    handle.addEventListener('pointerdown', (e) => {
      if (e.button !== 0) return;
      e.preventDefault();
      active = true;
      ptrId = e.pointerId;
      startX = e.clientX;
      startW = wrap.getBoundingClientRect().width;
      document.body.classList.add('player-resize-active');
      try {
        handle.setPointerCapture(e.pointerId);
      } catch (_) {
        // ignore
      }
    });

    handle.addEventListener('pointermove', (e) => {
      if (!active || e.pointerId !== ptrId) return;
      const dx = e.clientX - startX;
      const next = clampPlayerWidth(startW + dx);
      wrap.style.setProperty('--player-custom-width', `${next}px`);
    });

    handle.addEventListener('pointerup', endDrag);
    handle.addEventListener('pointercancel', endDrag);

    window.addEventListener('resize', () => {
      const rect = wrap.getBoundingClientRect();
      wrap.style.setProperty('--player-custom-width', `${clampPlayerWidth(rect.width)}px`);
    });
  }

  // ─── Initialize ───────────────────────────

  function init() {
    applyStoredPlayerWidth();

    UI.initParticles();
    Player.initSoundCloud();
    Player.initMediaSession();
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
    document.getElementById('setting-allow-skip').addEventListener('change', (e) => {
      updateSetting({ allowSkip: e.target.checked });
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

    // YouTube keyword search (first result) — experimental
    document.getElementById('form-youtube-search').addEventListener('submit', async (e) => {
      e.preventDefault();
      const input = document.getElementById('input-youtube-search');
      const q = input.value.trim();
      if (!q) return;

      await searchYoutubeFirstAndEnqueue(q);
      input.value = '';
    });
  }

  // ─── Player Events ────────────────────────

  /**
   * Host: click / drag on the custom progress bar → SoundCloud/YouTube seek + sync:seek
   */
  function bindProgressScrub() {
    const bar = document.getElementById('progress-bar');
    if (!bar) return;

    const ratioFromClientX = (clientX) => {
      const rect = bar.getBoundingClientRect();
      if (rect.width <= 0) return 0;
      return Math.min(1, Math.max(0, (clientX - rect.left) / rect.width));
    };

    const updateScrubVisual = (clientX) => {
      const dur = Player.getCachedDuration();
      if (dur <= 0) return;
      Player.updateProgressUI(ratioFromClientX(clientX) * dur, dur);
    };

    const endScrub = (e, cancelled) => {
      if (progressScrubPointerId === null || e.pointerId !== progressScrubPointerId) return;

      const pid = progressScrubPointerId;
      progressScrubPointerId = null;
      progressScrubLastClientX = e.clientX;
      bar.classList.remove('is-scrubbing');

      try {
        if (bar.hasPointerCapture(pid)) {
          bar.releasePointerCapture(pid);
        }
      } catch (_) {
        // ignore
      }

      if (cancelled || !Room.getIsHost()) {
        Player.getCurrentTime().then((ct) => {
          Player.getDuration().then((d) => Player.updateProgressUI(ct, d));
        });
        return;
      }

      Player.getDuration().then((dur) => {
        if (dur <= 0) return;
        const t = ratioFromClientX(progressScrubLastClientX) * dur;
        Player.seekTo(t);
        Player.updateProgressUI(t, dur);
        SocketClient.emit('sync:seek', { time: t }).catch((err) => {
          UI.showToast(err.message || 'Không thể tua', 'error');
        });
      });
    };

    bar.addEventListener('pointerdown', (e) => {
      if (bar.classList.contains('disabled')) return;
      if (!Room.getIsHost()) return;
      if (e.button !== 0) return;
      if (!Queue.getCurrentTrack()) {
        UI.showToast('Chưa có bài để tua', 'info');
        return;
      }

      e.preventDefault();
      progressScrubPointerId = e.pointerId;
      progressScrubLastClientX = e.clientX;
      bar.classList.add('is-scrubbing');

      try {
        bar.setPointerCapture(e.pointerId);
      } catch (_) {
        // ignore
      }

      updateScrubVisual(e.clientX);
    });

    bar.addEventListener('pointermove', (e) => {
      if (progressScrubPointerId === null || e.pointerId !== progressScrubPointerId) return;
      progressScrubLastClientX = e.clientX;
      updateScrubVisual(e.clientX);
    });

    bar.addEventListener('pointerup', (e) => {
      endScrub(e, false);
    });

    bar.addEventListener('pointercancel', (e) => {
      endScrub(e, true);
    });
  }

  function bindPlayerEvents() {
    // Play/Pause button (host = broadcast, member = local)
    document.getElementById('btn-play').addEventListener('click', () => {
      togglePlayPause();
    });

    // Next
    document.getElementById('btn-next').addEventListener('click', async () => {
      if (document.getElementById('btn-next').classList.contains('disabled')) return;
      try {
        await SocketClient.emit('sync:next');
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

    Player.onTrackEnd(() => {
      if (Room.getIsHost()) {
        SocketClient.emit('sync:track-ended');
      }
    });

    // Allow next track from lock screen / media notification
    Player.onNextTrack(async () => {
      try {
        await SocketClient.emit('sync:next');
      } catch (err) {
        // Ignore if not allowed
      }
    });

    bindProgressScrub();
    bindYoutubeFullscreen();
    bindPlayerResize();
  }

  function bindYoutubeFullscreen() {
    const btn = document.getElementById('btn-player-expand');
    const ytContainer = document.getElementById('youtube-player-container');
    const iconExpand = document.getElementById('icon-player-expand');
    const iconCompress = document.getElementById('icon-player-compress');

    if (!btn || !ytContainer) return;

    function refreshFullscreenIcons() {
      const fs = document.fullscreenElement || document.webkitFullscreenElement;
      const active = fs === ytContainer;
      if (iconExpand && iconCompress) {
        iconExpand.style.display = active ? 'none' : 'block';
        iconCompress.style.display = active ? 'block' : 'none';
      }
      btn.title = active ? 'Thoát toàn màn hình' : 'Toàn màn hình (video)';
      btn.setAttribute('aria-label', btn.title);
    }

    btn.addEventListener('click', async (e) => {
      e.preventDefault();
      e.stopPropagation();
      try {
        const fs = document.fullscreenElement || document.webkitFullscreenElement;
        if (!fs) {
          if (ytContainer.requestFullscreen) {
            await ytContainer.requestFullscreen();
          } else if (ytContainer.webkitRequestFullscreen) {
            ytContainer.webkitRequestFullscreen();
          }
        } else if (document.exitFullscreen) {
          await document.exitFullscreen();
        } else if (document.webkitExitFullscreen) {
          document.webkitExitFullscreen();
        }
      } catch (err) {
        UI.showToast('Không thể bật toàn màn hình trên trình duyệt này', 'error');
      }
      refreshFullscreenIcons();
    });

    document.addEventListener('fullscreenchange', refreshFullscreenIcons);
    document.addEventListener('webkitfullscreenchange', refreshFullscreenIcons);

    refreshFullscreenIcons();
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

    SocketClient.on('queue:tracks-added', ({ tracks: addedTracks }) => {
      Queue.addBatch(addedTracks);
    });

    SocketClient.on('queue:reordered', ({ queue }) => {
      Queue.setQueue(queue);
    });

    // Sync events
    SocketClient.on('sync:state', (state) => {
      state._receivedAt = Date.now();
      applyPlaybackState(state);
    });

    SocketClient.on('sync:track-changed', ({ playback }) => {
      if (playback) {
        playback._receivedAt = Date.now();
        applyPlaybackState(playback);
      }
    });

    SocketClient.on('sync:heartbeat', (state) => {
      if (!state || !state.currentTrack) return;
      if (isLoadingTrack) return; // Don't correct drift while track is loading
      const receivedAt = Date.now();
      Player.getCurrentTime().then((localTime) => {
        const elapsed = (Date.now() - receivedAt) / 1000;
        const serverTime = state.currentTime + elapsed;
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

    const iconPlay = document.getElementById('icon-play');
    const isCurrentlyPlaying = iconPlay.style.display === 'none';

    if (Room.getIsHost()) {
      // Host: broadcast play/pause to everyone
      if (isCurrentlyPlaying) {
        try {
          await SocketClient.emit('sync:pause');
        } catch (err) {
          UI.showToast(err.message, 'error');
        }
      } else {
        const time = await Player.getCurrentTime();
        try {
          await SocketClient.emit('sync:play', { time });
        } catch (err) {
          UI.showToast(err.message, 'error');
        }
      }
    } else {
      // Member: local pause/resume only
      if (isCurrentlyPlaying) {
        Player.pause();
      } else {
        // Sync to server position before resuming
        try {
          const receivedAt = Date.now();
          const response = await SocketClient.emit('sync:request-state');
          if (response.success && response.playback && response.playback.isPlaying) {
            const elapsed = (Date.now() - receivedAt) / 1000;
            Player.seekTo(response.playback.currentTime + elapsed);
          }
        } catch (_) {
          // Ignore, play anyway
        }
        Player.play();
      }
    }
  }

  // ─── Apply Sync State ─────────────────────

  function applyPlaybackState(state) {
    if (!state) return;

    const doSeekAndPlay = (s) => {
      if (s.isPlaying) {
        const refTime = s._receivedAt || Date.now();
        const elapsed = (Date.now() - refTime) / 1000;
        Player.seekTo(s.currentTime + elapsed);
        Player.play();
      } else {
        Player.seekTo(s.currentTime);
        Player.pause();
      }
    };

    if (state.currentTrack && loadedTrackId !== state.currentTrack.id) {
      // New track — load it, then apply the latest state once done
      loadedTrackId = state.currentTrack.id;
      isLoadingTrack = true;
      pendingSeekState = state;

      updateNowPlaying(state.currentTrack);
      const tracks = Queue.getTracks();
      const idx = tracks.findIndex((t) => t.id === state.currentTrack.id);
      if (idx !== -1) Queue.setCurrentIndex(idx);

      Player.loadTrack(state.currentTrack).then(() => {
        setTimeout(() => {
          isLoadingTrack = false;
          doSeekAndPlay(pendingSeekState);
          pendingSeekState = null;
        }, 800);
      });
    } else if (isLoadingTrack) {
      // Same track still loading — store latest state, apply after load
      pendingSeekState = state;
    } else {
      doSeekAndPlay(state);
    }
  }

  // ─── Now Playing UI ───────────────────────

  function updateNowPlaying(track) {
    const emptyEl = document.getElementById('now-playing-empty');
    const infoEl = document.getElementById('now-playing-info');

    if (!track) {
      emptyEl.style.display = 'block';
      infoEl.style.display = 'none';
      const expandBtn = document.getElementById('btn-player-expand');
      if (expandBtn) expandBtn.hidden = true;
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

    const expandBtn = document.getElementById('btn-player-expand');
    if (expandBtn) {
      expandBtn.hidden = track.source !== 'youtube';
    }

    // Update Media Session metadata for lock screen / OS notification
    Player.updateMediaSession(track);

    // If YouTube, try to get title after loading
    if (track.source === 'youtube' && !track.title) {
      setTimeout(async () => {
        const ytTitle = await Player.getYouTubeTitle();
        if (ytTitle) {
          title.textContent = ytTitle;
          Queue.updateTrackTitle(track.id, ytTitle);
          // Re-update Media Session with the real title
          Player.updateMediaSession({ ...track, title: ytTitle });
        }
      }, 2000);
    }
  }

  // ─── Track Management ─────────────────────

  async function searchYoutubeFirstAndEnqueue(query) {
    const btn = document.getElementById('btn-youtube-search');
    btn.disabled = true;
    UI.showToast('Đang tìm trên YouTube…', 'info');
    try {
      const response = await fetch(
        `/api/youtube-search-first?q=${encodeURIComponent(query)}`
      );
      const data = await response.json();

      if (!response.ok || data.error) {
        UI.showToast(data.error || 'Không tìm được bài', 'error');
        return;
      }
      if (!data.track) {
        UI.showToast('Không tìm được bài', 'error');
        return;
      }

      await SocketClient.emit('queue:add', { track: data.track });
      UI.showToast(
        data.track.title
          ? `Đã thêm: ${data.track.title}`
          : 'Đã thêm kết quả đầu tiên vào hàng chờ!',
        'success'
      );
    } catch (err) {
      UI.showToast(err.message || 'Không thể tìm kiếm', 'error');
    } finally {
      btn.disabled = false;
    }
  }

  async function addTrack(url) {
    const isPlaylist = url.includes('youtube.com/playlist') && url.includes('list=');

    if (isPlaylist) {
      const btn = document.getElementById('btn-add-track');
      btn.disabled = true;
      UI.showToast('Đang tải playlist...', 'info');
      try {
        const response = await fetch(`/api/resolve-playlist?url=${encodeURIComponent(url)}`);
        const data = await response.json();

        if (data.error) {
          UI.showToast(data.error, 'error');
          return;
        }
        if (!data.tracks || data.tracks.length === 0) {
          UI.showToast('Không tìm thấy bài hát trong playlist', 'error');
          return;
        }

        await SocketClient.emit('queue:add-batch', { tracks: data.tracks });
        UI.showToast(`Đã thêm ${data.tracks.length} bài vào hàng chờ!`, 'success');
      } catch (err) {
        UI.showToast(err.message || 'Không thể tải playlist', 'error');
      } finally {
        btn.disabled = false;
      }
      return;
    }

    try {
      const response = await fetch(`/api/resolve?url=${encodeURIComponent(url)}`);
      const data = await response.json();

      if (data.error) {
        UI.showToast(data.error, 'error');
        return;
      }

      await SocketClient.emit('queue:add', { track: data });
      UI.showToast('Đã thêm vào hàng chờ!', 'success');
    } catch (err) {
      UI.showToast(err.message || 'Không thể thêm bài hát', 'error');
    }
  }

  async function reorderTracks(trackIds) {
    try {
      await SocketClient.emit('queue:reorder', { trackIds });
    } catch (err) {
      UI.showToast(err.message || 'Không thể sắp xếp hàng chờ', 'error');
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
    loadedTrackId = null;
    isLoadingTrack = false;
    history.pushState(null, '', '/');

    // Notify server immediately, then disconnect
    const socket = SocketClient.getSocket();
    if (socket) {
      socket.emit('room:leave');
      socket.disconnect();
      setTimeout(() => socket.connect(), 500);
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

    const expandBtn = document.getElementById('btn-player-expand');
    if (expandBtn) expandBtn.hidden = true;
    const fs = document.fullscreenElement || document.webkitFullscreenElement;
    if (fs && fs.id === 'youtube-player-container') {
      const exit = document.exitFullscreen || document.webkitExitFullscreen;
      if (exit) exit.call(document).catch(() => {});
    }
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
    reorderTracks,
  };
})();

// ─── Start App ──────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
  App.init();
});
