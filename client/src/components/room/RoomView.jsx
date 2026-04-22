import { useEffect, useRef, useState, useCallback } from 'react';
import { useApp } from '../../context/AppContext';
import { usePlayer } from '../../hooks/usePlayer';
import RoomHeader from './RoomHeader';
import SettingsModal from './SettingsModal';
import AddTrackForm from '../player/AddTrackForm';
import NowPlaying from '../player/NowPlaying';
import PlayerContainer from '../player/PlayerContainer';
import PlayerControls from '../player/PlayerControls';
import QueuePanel from '../sidebar/QueuePanel';
import MembersPanel from '../sidebar/MembersPanel';
import ChatPanel from '../sidebar/ChatPanel';

export default function RoomView({ socket }) {
  const { state, dispatch, showToast } = useApp();
  const { isHost, room, queue } = state;

  const [showSettings, setShowSettings] = useState(false);
  const [currentTrack, setCurrentTrack] = useState(null);

  const loadedTrackIdRef = useRef(null);
  const isLoadingRef = useRef(false);
  const pendingStateRef = useRef(null);

  // ─── Player setup ─────────────────────────

  const handleTrackEnd = useCallback(() => {
    if (isHost) socket.emit('sync:track-ended');
  }, [isHost, socket]);

  const handleNextTrack = useCallback(async () => {
    try { await socket.emit('sync:next'); } catch (_) {}
  }, [socket]);

  const player = usePlayer({ onTrackEnd: handleTrackEnd, onNextTrack: handleNextTrack });

  // ─── Apply sync state ─────────────────────

  const applyPlaybackState = useCallback((serverState) => {
    if (!serverState) return;

    const doSeekAndPlay = (s) => {
      if (s.isPlaying) {
        const refTime = s._receivedAt || Date.now();
        const elapsed = (Date.now() - refTime) / 1000;
        player.seekTo(s.currentTime + elapsed);
        player.play();
      } else {
        player.seekTo(s.currentTime);
        player.pause();
      }
    };

    if (serverState.currentTrack && loadedTrackIdRef.current !== serverState.currentTrack.id) {
      loadedTrackIdRef.current = serverState.currentTrack.id;
      isLoadingRef.current = true;
      pendingStateRef.current = serverState;

      setCurrentTrack(serverState.currentTrack);

      const tracks = queue.tracks;
      const idx = tracks.findIndex((t) => t.id === serverState.currentTrack.id);
      if (idx !== -1) dispatch({ type: 'SET_CURRENT_INDEX', index: idx });

      player.loadTrack(serverState.currentTrack).then(() => {
        setTimeout(() => {
          isLoadingRef.current = false;
          doSeekAndPlay(pendingStateRef.current);
          pendingStateRef.current = null;
        }, 800);
      });

      player.updateMediaSession(serverState.currentTrack);
    } else if (isLoadingRef.current) {
      pendingStateRef.current = serverState;
    } else {
      doSeekAndPlay(serverState);
    }
  }, [player, queue.tracks, dispatch]);

  // ─── Socket events ────────────────────────

  useEffect(() => {
    socket.on('room:member-joined', ({ member }) => {
      dispatch({ type: 'ADD_MEMBER', member });
      dispatch({ type: 'ADD_CHAT_MESSAGE', message: { system: true, text: `${member.name} đã tham gia phòng` } });
      showToast(`${member.name} đã tham gia!`, 'info');
    });

    socket.on('room:member-left', ({ memberId, memberName }) => {
      dispatch({ type: 'REMOVE_MEMBER', memberId });
      dispatch({ type: 'ADD_CHAT_MESSAGE', message: { system: true, text: `${memberName} đã rời phòng` } });
    });

    socket.on('room:host-transferred', ({ newHostId, newHostName }) => {
      dispatch({ type: 'TRANSFER_HOST', newHostId, newHostName });
      dispatch({ type: 'ADD_CHAT_MESSAGE', message: { system: true, text: `${newHostName} đã trở thành Host` } });
    });

    socket.on('room:settings-updated', ({ settings }) => {
      dispatch({ type: 'APPLY_SETTINGS', settings });
      showToast('Cài đặt phòng đã được cập nhật', 'info');
    });

    socket.on('queue:track-added', ({ track }) => {
      dispatch({ type: 'ADD_TRACK', track });
    });

    socket.on('queue:tracks-added', ({ tracks }) => {
      dispatch({ type: 'ADD_BATCH', tracks });
    });

    socket.on('queue:track-removed', ({ trackId }) => {
      dispatch({ type: 'REMOVE_TRACK', trackId });
    });

    socket.on('queue:reordered', ({ queue: newQueue }) => {
      dispatch({ type: 'SET_QUEUE', queue: newQueue });
    });

    socket.on('sync:state', (s) => {
      applyPlaybackState({ ...s, _receivedAt: Date.now() });
    });

    socket.on('sync:track-changed', ({ track, playback }) => {
      if (track) {
        dispatch({ type: 'UPDATE_TRACK_TITLE', trackId: track.id, title: track.title });
      }
      if (playback) {
        applyPlaybackState({ ...playback, _receivedAt: Date.now() });
      }
    });

    socket.on('sync:heartbeat', (s) => {
      if (!s?.currentTrack || isLoadingRef.current) return;
      const receivedAt = Date.now();
      player.getCurrentTime().then((localTime) => {
        const elapsed = (Date.now() - receivedAt) / 1000;
        const serverTime = s.currentTime + elapsed;
        const drift = Math.abs(localTime - serverTime);
        if (drift > 2 && drift < 30 && s.isPlaying) {
          player.seekTo(serverTime);
        }
      });
    });

    socket.on('sync:queue-ended', () => {
      player.pause();
      showToast('Đã phát hết hàng chờ!', 'info');
    });

    socket.on('chat:message', (msg) => {
      dispatch({ type: 'ADD_CHAT_MESSAGE', message: msg });
    });

    return () => {
      ['room:member-joined','room:member-left','room:host-transferred',
       'room:settings-updated','queue:track-added','queue:tracks-added',
       'queue:track-removed','queue:reordered','sync:state','sync:track-changed',
       'sync:heartbeat','sync:queue-ended','chat:message',
      ].forEach((ev) => socket.off(ev));
    };
  }, [socket, dispatch, showToast, applyPlaybackState, player]);

  // ─── Reconnect re-sync ────────────────────

  useEffect(() => {
    socket.on('reconnect', async () => {
      try {
        const res = await socket.emit('sync:request-state');
        if (res.success) {
          if (res.queue) dispatch({ type: 'SET_QUEUE', queue: res.queue });
          if (res.playback) applyPlaybackState(res.playback);
        }
      } catch {
        showToast('Phòng có thể đã bị xóa. Vui lòng tạo hoặc tham gia phòng mới.', 'warning');
        handleLeave();
      }
    });
    return () => socket.off('reconnect');
  }, [socket]); // eslint-disable-line react-hooks/exhaustive-deps

  // ─── Actions ──────────────────────────────

  function handleLeave() {
    if (!window.confirm('Bạn có chắc muốn rời phòng?')) return;
    const s = socket.getSocket();
    if (s) { s.emit('room:leave'); s.disconnect(); setTimeout(() => s.connect(), 500); }
    player.pause();
    setCurrentTrack(null);
    loadedTrackIdRef.current = null;
    dispatch({ type: 'LEAVE_ROOM' });
    history.pushState(null, '', '/');
    showToast('Đã rời phòng', 'info');
  }

  async function handleAddTrack(url) {
    const isPlaylist = url.includes('youtube.com/playlist') && url.includes('list=');
    if (isPlaylist) {
      showToast('Đang tải playlist...', 'info');
      const res = await fetch(`/api/resolve-playlist?url=${encodeURIComponent(url)}`);
      const data = await res.json();
      if (data.error) { showToast(data.error, 'error'); return; }
      if (!data.tracks?.length) { showToast('Không tìm thấy bài hát trong playlist', 'error'); return; }
      await socket.emit('queue:add-batch', { tracks: data.tracks });
      showToast(`Đã thêm ${data.tracks.length} bài vào hàng chờ!`, 'success');
      return;
    }
    const res = await fetch(`/api/resolve?url=${encodeURIComponent(url)}`);
    const data = await res.json();
    if (data.error) { showToast(data.error, 'error'); return; }
    await socket.emit('queue:add', { track: data });
    showToast('Đã thêm vào hàng chờ!', 'success');
  }

  async function handleYoutubeSearch(query) {
    showToast('Đang tìm trên YouTube…', 'info');
    const res = await fetch(`/api/youtube-search-first?q=${encodeURIComponent(query)}`);
    const data = await res.json();
    if (!res.ok || data.error) { showToast(data.error || 'Không tìm được bài', 'error'); return; }
    if (!data.track) { showToast('Không tìm được bài', 'error'); return; }
    await socket.emit('queue:add', { track: data.track });
    showToast(data.track.title ? `Đã thêm: ${data.track.title}` : 'Đã thêm kết quả đầu tiên!', 'success');
  }

  async function handleTogglePlay() {
    const track = queue.tracks[queue.currentIndex];
    if (!track) { showToast('Chưa có bài nào trong hàng chờ', 'info'); return; }

    if (isHost) {
      if (player.isPlaying) {
        await socket.emit('sync:pause');
      } else {
        const time = await player.getCurrentTime();
        await socket.emit('sync:play', { time });
      }
    } else {
      if (player.isPlaying) {
        player.pause();
      } else {
        try {
          const receivedAt = Date.now();
          const res = await socket.emit('sync:request-state');
          if (res.success && res.playback?.isPlaying) {
            const elapsed = (Date.now() - receivedAt) / 1000;
            player.seekTo(res.playback.currentTime + elapsed);
          }
        } catch (_) {}
        player.play();
      }
    }
  }

  async function handleNext() {
    try { await socket.emit('sync:next'); }
    catch (err) { showToast(err.message, 'error'); }
  }

  async function handleSeek(time) {
    try { await socket.emit('sync:seek', { time }); }
    catch (err) { showToast(err.message || 'Không thể tua', 'error'); }
  }

  async function handleSkipTo(trackId) {
    if (!isHost) { showToast('Chỉ host mới có quyền chuyển bài', 'info'); return; }
    try { await socket.emit('queue:skip-to', { trackId }); }
    catch (err) { showToast(err.message, 'error'); }
  }

  async function handleRemoveTrack(trackId) {
    try { await socket.emit('queue:remove', { trackId }); }
    catch (err) { showToast(err.message, 'error'); }
  }

  async function handleReorder(trackIds) {
    try { await socket.emit('queue:reorder', { trackIds }); }
    catch (err) { showToast(err.message || 'Không thể sắp xếp hàng chờ', 'error'); }
  }

  async function handleUpdateSetting(settings) {
    try { await socket.emit('room:update-settings', { settings }); }
    catch (err) { showToast(err.message, 'error'); }
  }

  function handleSendMessage(message) {
    socket.getSocket()?.emit('chat:message', { message });
  }

  const roomClass = `view active${isHost ? ' is-host' : ''}`;

  return (
    <div id="view-room" className={roomClass}>
      <div className="room-layout">
        <RoomHeader
          onLeave={handleLeave}
          onOpenSettings={() => setShowSettings(true)}
        />

        <div className="room-content">
          <div className="player-section">
            <AddTrackForm onAddTrack={handleAddTrack} onYoutubeSearch={handleYoutubeSearch} />
            <NowPlaying isPlaying={player.isPlaying} currentTrack={currentTrack} />
            <div className="player-container glass-card">
              <PlayerContainer player={player} currentTrack={currentTrack} />
              <PlayerControls
                player={player}
                onTogglePlay={handleTogglePlay}
                onNext={handleNext}
                onSeek={handleSeek}
              />
            </div>
          </div>

          <div className="sidebar">
            <QueuePanel
              onSkipTo={handleSkipTo}
              onRemove={handleRemoveTrack}
              onReorder={handleReorder}
            />
            <MembersPanel />
            <ChatPanel onSendMessage={handleSendMessage} />
          </div>
        </div>
      </div>

      {showSettings && (
        <SettingsModal
          onClose={() => setShowSettings(false)}
          onUpdateSetting={handleUpdateSetting}
        />
      )}
    </div>
  );
}
