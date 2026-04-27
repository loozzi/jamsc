import { useState } from 'react';
import { useApp } from '../../context/AppContext';
import PlayerContainer from '../player/PlayerContainer';
import Avatar from '../Avatar';
import { formatTime } from '../../utils/helpers';

const EMOJIS = ['🔥', '❤️', '😭', '🎶'];

export default function NowPlayingTab({
  player, currentTrack, onTogglePlay, onNext, onSeek, onSkipTo, onOpenAddSong, showUpNext = true,
}) {
  const { state } = useApp();
  const { room, queue, isHost } = state;
  const members = room?.members ?? [];
  const { tracks, currentIndex } = queue;
  const { isPlaying, progress } = player;
  const { currentTime, duration } = progress;

  const uiDuration = duration > 0 ? duration : (currentTrack?.duration || 0);
  const fillPct = uiDuration > 0 ? Math.min((currentTime / uiDuration) * 100, 100) : 0;
  const upNext = tracks.filter((_, i) => i > currentIndex).slice(0, 3);
  const isYT = currentTrack?.source === 'youtube';

  const [floaters, setFloaters] = useState([]);

  function react(emoji) {
    const id = Date.now() + Math.random();
    const left = 15 + Math.random() * 70;
    setFloaters(f => [...f, { id, emoji, left }]);
    setTimeout(() => setFloaters(f => f.filter(x => x.id !== id)), 1500);
  }

  return (
    <div className="now-playing-shell">
      {/* Floating emoji reactions */}
      {floaters.map(f => (
        <div key={f.id} className="float-emoji" style={{ left: `${f.left}%`, bottom: 200 }}>
          {f.emoji}
        </div>
      ))}

      <div className="now-playing-main">
        {/* ── TV Screen ── */}
        <div className="tv-screen">
          <div className="tv-content">
            {/* Thumbnail / art (always visible behind embed) */}
            <div className="tv-art">
              {currentTrack?.thumbnail
                ? <img src={currentTrack.thumbnail} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover', position: 'absolute', inset: 0, opacity: 0.5 }} />
                : <div className="tv-art-thumb">♪</div>
              }
              {currentTrack && (
                <div style={{ textAlign: 'center', zIndex: 2, padding: '0 20px' }}>
                  <div style={{ fontSize: 15, fontWeight: 700, color: '#fff' }}>{currentTrack.title}</div>
                  <div style={{ fontSize: 12, color: '#aaa', marginTop: 3 }}>{currentTrack.addedBy}</div>
                </div>
              )}
              {isPlaying && <div className="tv-pulse-overlay" />}
            </div>

            {/* Real player embed (on top) */}
            <div className="tv-embed">
              <PlayerContainer player={player} currentTrack={currentTrack} />
            </div>

            {/* Platform badge */}
            {currentTrack && (
              <div className="tv-platform-badge" style={{ color: isYT ? '#ff4444' : '#ff7700' }}>
                {isYT ? 'YT' : 'SC'}
              </div>
            )}

            {/* Play/pause tap overlay */}
            <button
              className="tv-overlay-play"
              onClick={onTogglePlay}
              aria-label={isPlaying ? 'Pause' : 'Play'}
            >
              <div className="tv-overlay-play-btn">
                {isPlaying ? '⏸' : '▶'}
              </div>
            </button>
          </div>

          {/* Green progress bar flush under TV */}
          <div className="tv-progress">
            <div className="tv-progress-fill" style={{ width: `${fillPct}%` }} />
          </div>
        </div>

        {/* ── Couch Row ── */}
        <div className="couch-row">
          <div className="couch-avatars">
            {members.map((m, i) => (
              <div key={m.id} style={{ marginLeft: i === 0 ? 0 : -8, zIndex: members.length - i }}>
                <Avatar name={m.name} size="sm" isHost={m.isHost} />
              </div>
            ))}
          </div>
          <div className="couch-info">
            <div className="couch-title">{members.length} đang xem cùng nhau</div>
            <div className="couch-stats">
              <span className="couch-stat">
                <span className="couch-dot" style={{ background: '#22c55e' }} />
                <span style={{ color: '#22c55e' }}>{members.length} synced</span>
              </span>
            </div>
          </div>
          <div className="couch-emojis">
            {EMOJIS.map(e => (
              <button key={e} className="couch-emoji-btn" onClick={() => react(e)} aria-label={e}>
                {e}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* ── Track Info + Controls ── */}
      {currentTrack ? (
        <div className="np-track np-control-bar">
          <div className="np-track-row">
            <div style={{ flex: 1, minWidth: 0, marginRight: 12 }}>
              <div className="np-title">{currentTrack.title || 'Loading...'}</div>
              <div className="np-artist">{currentTrack.addedBy || ''}</div>
              <div className="np-added">
                <Avatar name={currentTrack.addedBy || '?'} size="sm" />
                <span className="np-added-by">added by {currentTrack.addedBy}</span>
              </div>
            </div>
            <div className="np-track-actions">
              <div className="np-controls np-controls-inline">
                <CtrlBtn icon="⏮" size={34} onClick={() => {}} />
                <CtrlBtn icon={isPlaying ? '⏸' : '▶'} size={46} primary onClick={onTogglePlay} />
                <CtrlBtn icon="⏭" size={34} onClick={onNext} />
              </div>
              <UpvoteBtn votes={0} voted={false} />
            </div>
          </div>

          {/* Time */}
          <div className="np-times np-times-compact">
            <span>{formatTime(currentTime)}</span>
            <span>{formatTime(uiDuration)}</span>
          </div>
          <div className="np-progress-visual" aria-hidden="true">
            <div className="np-progress-visual-fill" style={{ width: `${fillPct}%` }} />
          </div>
        </div>
      ) : (
        <div className="np-track np-control-bar" style={{ textAlign: 'center', color: 'var(--dim)' }}>
          <div style={{ fontSize: 32, marginBottom: 8, opacity: 0.4 }}>🎵</div>
          <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--text)' }}>Chưa có bài đang phát</div>
          <div style={{ fontSize: 12, marginTop: 4 }}>Thêm bài vào hàng chờ để bắt đầu</div>
          <button
            className="btn btn-primary btn-sm"
            style={{ marginTop: 16, width: 'auto' }}
            onClick={onOpenAddSong}
          >
            + Thêm bài hát
          </button>
        </div>
      )}

      {/* ── Up Next ── */}
      {showUpNext && upNext.length > 0 && (
        <div className="up-next">
          <div className="up-next-label">Tiếp theo</div>
          {upNext.map(track => (
            <QueueItemCompact key={track.id} track={track} onClick={() => onSkipTo(track.id)} />
          ))}
          {tracks.filter((_, i) => i > currentIndex).length > 3 && (
            <div style={{ textAlign: 'center', fontSize: 12, color: 'var(--muted)', padding: '8px 0', cursor: 'pointer' }}
              onClick={() => {}}>
              +{tracks.filter((_, i) => i > currentIndex).length - 3} bài nữa trong hàng chờ
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function CtrlBtn({ icon, size, primary, onClick }) {
  return (
    <button
      onClick={onClick}
      className={`ctrl-btn-round ${primary ? 'primary' : 'secondary'}`}
      style={{ width: size, height: size, fontSize: size > 44 ? 22 : 16 }}
    >
      {icon}
    </button>
  );
}

function UpvoteBtn({ votes, voted }) {
  const [localVotes, setLocalVotes] = useState(votes);
  const [localVoted, setLocalVoted] = useState(voted);
  const [bouncing, setBouncing] = useState(false);

  function handleVote(e) {
    e.stopPropagation();
    if (localVoted) { setLocalVotes(v => v - 1); setLocalVoted(false); return; }
    setLocalVotes(v => v + 1); setLocalVoted(true);
    setBouncing(true);
    setTimeout(() => setBouncing(false), 400);
  }

  return (
    <button
      onClick={handleVote}
      className={`qi-upvote${localVoted ? ' voted' : ''}${bouncing ? ' bouncing' : ''}`}
      style={{ padding: '10px 14px' }}
    >
      <span className="qi-upvote-arrow">▲</span>
      <span className="qi-upvote-count">{localVotes}</span>
    </button>
  );
}

function QueueItemCompact({ track, onClick }) {
  const isYT = track.source === 'youtube';
  return (
    <div className="qi-row" onClick={onClick} style={{ cursor: 'pointer' }}>
      <div className="qi-thumb">
        {track.thumbnail
          ? <img src={track.thumbnail} alt="" />
          : <span>♪</span>
        }
        <div className="platform-badge" style={{ color: isYT ? '#ff4444' : '#ff7700' }}>
          {isYT ? 'YT' : 'SC'}
        </div>
      </div>
      <div className="qi-info">
        <div className="qi-title">{track.title || 'Loading...'}</div>
        <div className="qi-meta">
          <span className="qi-artist">{track.addedBy}</span>
          {track.duration > 0 && <span className="qi-dur">{formatTime(track.duration)}</span>}
        </div>
      </div>
    </div>
  );
}
