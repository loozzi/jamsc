import { useEffect, useRef, useState, useCallback } from 'react';
import { useApp } from '../../context/AppContext';
import { usePlayer } from '../../hooks/usePlayer';
import RoomHeader from './RoomHeader';
import SettingsModal from './SettingsModal';
import NowPlayingTab from './NowPlayingTab';
import AddSongSheet from './AddSongSheet';
import PeopleTab from './PeopleTab';
import QueuePanel from '../sidebar/QueuePanel';
import ChatPanel from '../sidebar/ChatPanel';

const TABS = [
  { id: 'playing', icon: '▶', label: 'Watching' },
  { id: 'queue',   icon: '≡', label: 'Queue'    },
  { id: 'chat',    icon: '💬', label: 'Chat'     },
  { id: 'people',  icon: '●', label: 'People'   },
];

export default function RoomView({ socket }) {
  const { state, dispatch, showToast } = useApp();
  const { isHost, room, queue } = state;

  const [activeTab, setActiveTab] = useState('playing');
  const [showSettings, setShowSettings] = useState(false);
  const [showAddSong, setShowAddSong] = useState(false);
  const [currentTrack, setCurrentTrack] = useState(null);
  const [isDesktop, setIsDesktop] = useState(() => {
    if (typeof window === 'undefined') return true;
    return window.innerWidth >= 1024;
  });

  const loadedTrackIdRef = useRef(null);
  const isLoadingRef = useRef(false);
  const pendingStateRef = useRef(null);

  const handleTrackEnd = useCallback(() => {
    if (isHost) socket.emit('sync:track-ended');
  }, [isHost, socket]);

  const handleNextTrack = useCallback(async () => {
    try { await socket.emit('sync:next'); } catch (_) {}
  }, [socket]);

  const player = usePlayer({ onTrackEnd: handleTrackEnd, onNextTrack: handleNextTrack });

  const applyPlaybackState = useCallback((serverState) => {
    if (!serverState) return;
    const doSeekAndPlay = (s) => {
      if (s.isPlaying) {
        const elapsed = (Date.now() - (s._receivedAt || Date.now())) / 1000;
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
      const idx = queue.tracks.findIndex(t => t.id === serverState.currentTrack.id);
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

  useEffect(() => {
    if (typeof window === 'undefined') return undefined;
    const media = window.matchMedia('(min-width: 1024px)');
    const onChange = (e) => setIsDesktop(e.matches);
    setIsDesktop(media.matches);
    if (media.addEventListener) media.addEventListener('change', onChange);
    else media.addListener(onChange);
    return () => {
      if (media.removeEventListener) media.removeEventListener('change', onChange);
      else media.removeListener(onChange);
    };
  }, []);

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
    socket.on('queue:track-added',   ({ track })  => dispatch({ type: 'ADD_TRACK', track }));
    socket.on('queue:tracks-added',  ({ tracks }) => dispatch({ type: 'ADD_BATCH', tracks }));
    socket.on('queue:track-removed', ({ trackId }) => dispatch({ type: 'REMOVE_TRACK', trackId }));
    socket.on('queue:reordered',     ({ queue: q }) => dispatch({ type: 'SET_QUEUE', queue: q }));
    socket.on('sync:state',         s => applyPlaybackState({ ...s, _receivedAt: Date.now() }));
    socket.on('sync:track-changed', ({ track, playback }) => {
      if (track) dispatch({ type: 'UPDATE_TRACK_TITLE', trackId: track.id, title: track.title });
      if (playback) applyPlaybackState({ ...playback, _receivedAt: Date.now() });
    });
    socket.on('sync:heartbeat', s => {
      if (!s?.currentTrack || isLoadingRef.current) return;
      const receivedAt = Date.now();
      player.getCurrentTime().then(localTime => {
        const elapsed = (Date.now() - receivedAt) / 1000;
        const serverTime = s.currentTime + elapsed;
        if (Math.abs(localTime - serverTime) > 2 && Math.abs(localTime - serverTime) < 30 && s.isPlaying) {
          player.seekTo(serverTime);
        }
      });
    });
    socket.on('sync:queue-ended', () => { player.pause(); showToast('Đã phát hết hàng chờ!', 'info'); });
    socket.on('chat:message', msg => dispatch({ type: 'ADD_CHAT_MESSAGE', message: msg }));

    return () => {
      ['room:member-joined','room:member-left','room:host-transferred','room:settings-updated',
       'queue:track-added','queue:tracks-added','queue:track-removed','queue:reordered',
       'sync:state','sync:track-changed','sync:heartbeat','sync:queue-ended','chat:message',
      ].forEach(ev => socket.off(ev));
    };
  }, [socket, dispatch, showToast, applyPlaybackState, player]);

  useEffect(() => {
    socket.on('reconnect', async () => {
      try {
        const res = await socket.emit('sync:request-state');
        if (res.success) {
          if (res.queue)    dispatch({ type: 'SET_QUEUE', queue: res.queue });
          if (res.playback) applyPlaybackState(res.playback);
        }
      } catch { showToast('Phòng có thể đã bị xóa.', 'warning'); handleLeave(); }
    });
    return () => socket.off('reconnect');
  }, [socket]); // eslint-disable-line react-hooks/exhaustive-deps

  function handleLeave() {
    if (!window.confirm('Bạn có chắc muốn rời phòng?')) return;
    const s = socket.getSocket();
    if (s) { s.emit('room:leave'); s.disconnect(); setTimeout(() => s.connect(), 500); }
    localStorage.removeItem('jamsc-session');
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
      await socket.emit('queue:add-batch', { tracks: data.tracks });
      showToast(`Đã thêm ${data.tracks.length} bài!`, 'success');
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
    await socket.emit('queue:add', { track: data.track });
    showToast(data.track?.title ? `Đã thêm: ${data.track.title}` : 'Đã thêm!', 'success');
  }

  async function handleTogglePlay() {
    const track = queue.tracks[queue.currentIndex];
    if (!track) { showToast('Chưa có bài nào trong hàng chờ', 'info'); return; }
    if (isHost) {
      if (player.isPlaying) {
        player.pause();
        await socket.emit('sync:pause');
      } else {
        // Trigger local playback in the same user gesture to avoid browser autoplay blocking.
        player.play();
        const time = await player.getCurrentTime();
        await socket.emit('sync:play', { time });
      }
    } else {
      if (player.isPlaying) { player.pause(); }
      else {
        // Play immediately in user gesture context first (important for YouTube autoplay policy).
        player.play();
        try {
          const receivedAt = Date.now();
          const res = await socket.emit('sync:request-state');
          if (res.success && res.playback?.isPlaying) {
            player.seekTo(res.playback.currentTime + (Date.now() - receivedAt) / 1000);
          }
        } catch (_) {}
      }
    }
  }

  async function handleNext() {
    try { await socket.emit('sync:next'); } catch (err) { showToast(err.message, 'error'); }
  }
  async function handleSeek(time) {
    try { await socket.emit('sync:seek', { time }); } catch (err) { showToast(err.message || 'Không thể tua', 'error'); }
  }
  async function handleSkipTo(trackId) {
    if (!isHost) { showToast('Chỉ host mới có quyền chuyển bài', 'info'); return; }
    try { await socket.emit('queue:skip-to', { trackId }); } catch (err) { showToast(err.message, 'error'); }
  }
  async function handleRemoveTrack(trackId) {
    try { await socket.emit('queue:remove', { trackId }); } catch (err) { showToast(err.message, 'error'); }
  }
  async function handleReorder(trackIds) {
    try { await socket.emit('queue:reorder', { trackIds }); } catch (err) { showToast(err.message, 'error'); }
  }
  async function handleUpdateSetting(settings) {
    try { await socket.emit('room:update-settings', { settings }); } catch (err) { showToast(err.message, 'error'); }
  }
  function handleSendMessage(message) {
    socket.getSocket()?.emit('chat:message', { message });
  }

  return (
    <div id="view-room" className={`view active room-tab-layout${isHost ? ' is-host' : ''}`}>
      <RoomHeader
        onLeave={handleLeave}
        onOpenSettings={() => setShowSettings(true)}
      />

      {isDesktop ? (
        <div className="room-desktop-content">
          <div className="room-desktop-main">
            <div className="room-desktop-player">
              <NowPlayingTab
                player={player}
                currentTrack={currentTrack}
                onTogglePlay={handleTogglePlay}
                onNext={handleNext}
                onSeek={handleSeek}
                onSkipTo={handleSkipTo}
                onOpenAddSong={() => setShowAddSong(true)}
                showUpNext={false}
              />
            </div>
            <div className="room-desktop-queue">
              <QueuePanel
                onSkipTo={handleSkipTo}
                onRemove={handleRemoveTrack}
                onReorder={handleReorder}
                onAddSong={() => setShowAddSong(true)}
              />
            </div>
          </div>
          <aside className="room-desktop-side">
            <ChatPanel onSendMessage={handleSendMessage} />
          </aside>
        </div>
      ) : (
        <div className="room-tab-content room-mobile-content">
          {/* NowPlayingTab always mounted — keeps YT/SC player alive across tab switches */}
          <div className={`tab-panel${activeTab !== 'playing' ? ' hidden' : ''}`}>
            <NowPlayingTab
              player={player}
              currentTrack={currentTrack}
              onTogglePlay={handleTogglePlay}
              onNext={handleNext}
              onSeek={handleSeek}
              onSkipTo={handleSkipTo}
              onOpenAddSong={() => setShowAddSong(true)}
              showUpNext
            />
          </div>

          {activeTab === 'queue' && (
            <div className="tab-panel">
              <div style={{ padding: 12 }}>
                <QueuePanel
                  onSkipTo={handleSkipTo}
                  onRemove={handleRemoveTrack}
                  onReorder={handleReorder}
                  onAddSong={() => setShowAddSong(true)}
                />
              </div>
            </div>
          )}

          {activeTab === 'chat' && (
            <div className="tab-panel">
              <ChatPanel onSendMessage={handleSendMessage} />
            </div>
          )}

          {activeTab === 'people' && (
            <div className="tab-panel">
              <PeopleTab />
            </div>
          )}
        </div>
      )}

      {/* Tab bar (hidden on desktop via CSS) */}
      {!isDesktop && (
        <nav className="tab-bar room-mobile-only">
          {TABS.map(({ id, icon, label }) => (
            <button
              key={id}
              className={`tab-item${activeTab === id ? ' active' : ''}`}
              onClick={() => setActiveTab(id)}
            >
              <span className="tab-icon">{icon}</span>
              {label}
            </button>
          ))}
        </nav>
      )}

      {/* FAB */}
      {!isDesktop && (
        <button className="room-fab room-mobile-only" onClick={() => setShowAddSong(true)} aria-label="Thêm bài hát">+</button>
      )}

      {showAddSong && (
        <AddSongSheet
          onClose={() => setShowAddSong(false)}
          onAddTrack={handleAddTrack}
          onYoutubeSearch={handleYoutubeSearch}
        />
      )}
      {showSettings && (
        <SettingsModal onClose={() => setShowSettings(false)} onUpdateSetting={handleUpdateSetting} />
      )}
    </div>
  );
}
