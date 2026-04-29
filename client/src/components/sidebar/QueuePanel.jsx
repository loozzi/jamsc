import { useRef, useState, useLayoutEffect } from 'react';
import { useApp } from '../../context/AppContext';
import { formatTime } from '../../utils/helpers';

export default function QueuePanel({ onSkipTo, onRemove, onReorder, onAddSong, onUpvote }) {
  const { state } = useApp();
  const { queue, isHost } = state;
  const { tracks, currentIndex } = queue;
  const queuedTracks = tracks.filter((_, index) => index !== currentIndex);
  const queuedCount = queuedTracks.length;
  const dragSrcRef = useRef(-1);
  const votedTrackIdRef = useRef(null);
  const listRef = useRef(null);
  const prevPositionsRef = useRef({});

  // FLIP animation: runs after every reorder (skip during live drag)
  const trackOrder = queuedTracks.map((t) => t.id).join(',');
  useLayoutEffect(() => {
    if (!listRef.current || dragSrcRef.current !== -1) return;
    const items = [...listRef.current.querySelectorAll('[data-track-id]')];
    const prev = prevPositionsRef.current;

    // Invert: apply transform from previous position
    let animated = false;
    items.forEach((el) => {
      const id = el.dataset.trackId;
      if (!prev[id]) return;
      const dy = prev[id] - el.getBoundingClientRect().top;
      if (Math.abs(dy) < 1) return;
      animated = true;
      el.style.transition = 'none';
      el.style.transform = `translateY(${dy}px)`;
    });

    // Play: animate to natural position
    if (animated) {
      void listRef.current.offsetHeight; // force reflow
      items.forEach((el) => {
        if (!el.style.transform) return;
        el.style.transition = 'transform 0.32s cubic-bezier(0.25, 0.46, 0.45, 0.94)';
        el.style.transform = '';
        const cleanup = () => { el.style.transition = ''; el.removeEventListener('transitionend', cleanup); };
        el.addEventListener('transitionend', cleanup);
      });
    }

    // Save current natural positions for next render
    const next = {};
    items.forEach((el) => { next[el.dataset.trackId] = el.getBoundingClientRect().top; });
    prevPositionsRef.current = next;
  }, [trackOrder]); // eslint-disable-line react-hooks/exhaustive-deps

  if (queuedCount === 0) {
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
    const reorderedQueued = [...queuedTracks];
    const [moved] = reorderedQueued.splice(src, 1);
    reorderedQueued.splice(destIndex, 0, moved);

    const currentTrack = currentIndex >= 0 ? tracks[currentIndex] : null;
    const finalTracks = [];
    let qi = 0;
    for (let i = 0; i < tracks.length; i += 1) {
      if (i === currentIndex && currentTrack) finalTracks.push(currentTrack);
      else finalTracks.push(reorderedQueued[qi++]);
    }
    onReorder(finalTracks.map((t) => t.id));
  }

  return (
    <div className="queue-panel glass-card">
      <QueueHeader count={queuedCount} onAddSong={onAddSong} />
      <div className="queue-list" ref={listRef}>
        {queuedTracks.map((track, index) => {
          return (
            <QueueItemRow
              key={track.id}
              track={track}
              isActive={false}
              isHost={isHost}
              voted={votedTrackIdRef.current === track.id}
              onSkipTo={onSkipTo}
              onRemove={onRemove}
              onUpvote={(trackId) => {
                votedTrackIdRef.current = votedTrackIdRef.current === trackId ? null : trackId;
                onUpvote?.(trackId);
              }}
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

function QueueItemRow({ track, isActive, isHost, voted, onSkipTo, onRemove, onUpvote, draggable, onDragStart, onDragEnd, onDragOver, onDrop }) {
  const [bouncing, setBouncing] = useState(false);
  const displaySrc = track.displaySource || track.source;
  const isYT = track.source === 'youtube' && displaySrc !== 'spotify';
  const isSP = displaySrc === 'spotify';

  function handleUpvote(e) {
    e.stopPropagation();
    setBouncing(true);
    setTimeout(() => setBouncing(false), 400);
    onUpvote?.(track.id);
  }

  return (
    <div
      className={`queue-item${isActive ? ' active' : ''}`}
      data-track-id={track.id}
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
      <button
        className={`upvote-btn${voted ? ' voted' : ''}${bouncing ? ' bouncing' : ''}`}
        onClick={handleUpvote}
        aria-label="Upvote"
      >
        <span style={{ fontSize: 11 }}>▲</span>
        <span className="upvote-count">{track.votes || 0}</span>
      </button>

      <div className="queue-item-thumb">
        {track.thumbnail
          ? <img src={track.thumbnail} alt="" loading="lazy" />
          : <span style={{ color: 'var(--dim)', fontSize: 18 }}>{isActive ? '▶' : '♪'}</span>
        }
        <div className="platform-badge" style={{ color: isSP ? '#1db954' : isYT ? (isActive ? 'var(--primary)' : 'var(--muted)') : (isActive ? 'var(--primary)' : 'var(--muted)') }}>
          {isSP ? 'SP' : isYT ? 'YT' : 'SC'}
        </div>
      </div>

      <div className="queue-item-info">
        <div className="queue-item-title">{track.title || 'Loading...'}</div>
        <div className="queue-item-meta">
          <span className={`queue-item-source${isSP ? ' sp' : isYT ? '' : ' sc'}`}>{isSP ? 'Spotify' : isYT ? 'YT' : 'SC'}</span>
          {track.duration > 0 && <span>{formatTime(track.duration)}</span>}
          {track.addedBy && <span className="queue-item-addedby">{track.addedBy}</span>}
        </div>
      </div>

      <div className="queue-item-actions">
        {isHost && (
          <div className="queue-item-hidden-actions">
            <div className="queue-item-drag" title="Kéo để sắp xếp">
              <svg width="12" height="16" viewBox="0 0 12 20" fill="currentColor">
                <circle cx="4" cy="4" r="1.5"/><circle cx="8" cy="4" r="1.5"/>
                <circle cx="4" cy="10" r="1.5"/><circle cx="8" cy="10" r="1.5"/>
                <circle cx="4" cy="16" r="1.5"/><circle cx="8" cy="16" r="1.5"/>
              </svg>
            </div>
            <button
              className="queue-item-remove"
              title="Xóa khỏi hàng chờ"
              onClick={(e) => { e.stopPropagation(); onRemove(track.id); }}
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
              </svg>
            </button>
          </div>
        )}
      </div>
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
