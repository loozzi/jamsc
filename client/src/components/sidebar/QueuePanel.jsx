import { useRef, useState } from 'react';
import { useApp } from '../../context/AppContext';
import { formatTime } from '../../utils/helpers';
import Avatar from '../Avatar';

export default function QueuePanel({ onSkipTo, onRemove, onReorder, onAddSong }) {
  const { state } = useApp();
  const { queue, isHost } = state;
  const { tracks, currentIndex } = queue;
  const dragSrcRef = useRef(-1);

  if (tracks.length === 0) {
    return (
      <div className="queue-panel glass-card">
        <QueueHeader count={0} onAddSong={onAddSong} />
        <div className="queue-list">
          <div className="queue-empty">
            <p>Hàng chờ trống</p>
            <p className="queue-empty-hint">Thêm bài hát từ YouTube hoặc SoundCloud</p>
          </div>
        </div>
      </div>
    );
  }

  function handleDragStart(e, index) {
    dragSrcRef.current = index;
    e.dataTransfer.effectAllowed = 'move';
    e.currentTarget.classList.add('dragging');
  }
  function handleDragEnd(e) {
    e.currentTarget.classList.remove('dragging');
    document.querySelectorAll('.queue-item').forEach((el) => el.classList.remove('drag-over'));
  }
  function handleDragOver(e) {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    document.querySelectorAll('.queue-item').forEach((el) => el.classList.remove('drag-over'));
    e.currentTarget.classList.add('drag-over');
  }
  function handleDrop(e, destIndex) {
    e.preventDefault();
    e.currentTarget.classList.remove('drag-over');
    const src = dragSrcRef.current;
    if (src === -1 || src === destIndex) return;
    dragSrcRef.current = -1;
    const newTracks = [...tracks];
    const [moved] = newTracks.splice(src, 1);
    newTracks.splice(destIndex, 0, moved);
    onReorder(newTracks.map((t) => t.id));
  }

  return (
    <div className="queue-panel glass-card">
      <QueueHeader count={tracks.length} onAddSong={onAddSong} />
      <div className="queue-list">
        {tracks.map((track, index) => {
          const isActive = index === currentIndex;
          return (
            <QueueItemRow
              key={track.id}
              track={track}
              isActive={isActive}
              isHost={isHost}
              onSkipTo={onSkipTo}
              onRemove={onRemove}
              draggable={isHost}
              onDragStart={(e) => handleDragStart(e, index)}
              onDragEnd={handleDragEnd}
              onDragOver={handleDragOver}
              onDrop={(e) => handleDrop(e, index)}
            />
          );
        })}
      </div>
    </div>
  );
}

function QueueItemRow({ track, isActive, isHost, onSkipTo, onRemove, draggable, onDragStart, onDragEnd, onDragOver, onDrop }) {
  const [votes, setVotes] = useState(0);
  const [voted, setVoted] = useState(false);
  const [bouncing, setBouncing] = useState(false);
  const isYT = track.source === 'youtube';

  function handleUpvote(e) {
    e.stopPropagation();
    if (voted) { setVotes((v) => v - 1); setVoted(false); return; }
    setVotes((v) => v + 1); setVoted(true);
    setBouncing(true);
    setTimeout(() => setBouncing(false), 400);
  }

  return (
    <div
      className={`queue-item${isActive ? ' active' : ''}`}
      draggable={draggable}
      onClick={(e) => {
        if (e.target.closest('.queue-item-remove') || e.target.closest('.queue-item-drag') || e.target.closest('.upvote-btn')) return;
        onSkipTo(track.id);
      }}
      onDragStart={draggable ? onDragStart : undefined}
      onDragEnd={draggable ? onDragEnd : undefined}
      onDragOver={draggable ? onDragOver : undefined}
      onDrop={draggable ? onDrop : undefined}
    >
      {isHost && (
        <div className="queue-item-drag" title="Kéo để sắp xếp">
          <svg width="12" height="16" viewBox="0 0 12 20" fill="currentColor">
            <circle cx="4" cy="4" r="1.5"/><circle cx="8" cy="4" r="1.5"/>
            <circle cx="4" cy="10" r="1.5"/><circle cx="8" cy="10" r="1.5"/>
            <circle cx="4" cy="16" r="1.5"/><circle cx="8" cy="16" r="1.5"/>
          </svg>
        </div>
      )}

      <div className="queue-item-thumb">
        {track.thumbnail
          ? <img src={track.thumbnail} alt="" loading="lazy" />
          : <span style={{ color: 'var(--dim)', fontSize: 18 }}>{isActive ? '▶' : '♪'}</span>
        }
        <div className="platform-badge" style={{ color: isActive ? 'var(--primary)' : 'var(--muted)' }}>
          {isYT ? 'YT' : 'SC'}
        </div>
      </div>

      <div className="queue-item-info">
        <div className="queue-item-title">{track.title || 'Loading...'}</div>
        <div className="queue-item-meta">
          <span className={`queue-item-source${isYT ? '' : ' sc'}`}>{isYT ? 'YT' : 'SC'}</span>
          {track.duration > 0 && <span>{formatTime(track.duration)}</span>}
        </div>
        {track.addedBy && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 5, marginTop: 4 }}>
            <Avatar name={track.addedBy} size="sm" />
            <span style={{ fontSize: 11, color: 'var(--dim)' }}>{track.addedBy}</span>
          </div>
        )}
      </div>

      <button
        className={`upvote-btn${voted ? ' voted' : ''}${bouncing ? ' bouncing' : ''}`}
        onClick={handleUpvote}
        aria-label="Upvote"
      >
        <span style={{ fontSize: 11 }}>▲</span>
        <span className="upvote-count">{votes}</span>
      </button>

      {isHost && (
        <button
          className="queue-item-remove"
          title="Xóa khỏi hàng chờ"
          onClick={(e) => { e.stopPropagation(); onRemove(track.id); }}
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
          </svg>
        </button>
      )}
    </div>
  );
}

function QueueHeader({ count, onAddSong }) {
  return (
    <div className="panel-header">
      <h3>
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <line x1="8" y1="6" x2="21" y2="6"/><line x1="8" y1="12" x2="21" y2="12"/>
          <line x1="8" y1="18" x2="21" y2="18"/><line x1="3" y1="6" x2="3.01" y2="6"/>
          <line x1="3" y1="12" x2="3.01" y2="12"/><line x1="3" y1="18" x2="3.01" y2="18"/>
        </svg>
        Hàng Chờ
      </h3>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <span className="badge-count">{count}</span>
        <button className="btn-icon" onClick={onAddSong} title="Thêm bài hát" aria-label="Thêm bài hát">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <line x1="12" y1="5" x2="12" y2="19" />
            <line x1="5" y1="12" x2="19" y2="12" />
          </svg>
        </button>
      </div>
    </div>
  );
}
