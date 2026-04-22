import { useRef } from 'react';
import { useApp } from '../../context/AppContext';
import { formatTime } from '../../utils/helpers';

export default function QueuePanel({ onSkipTo, onRemove, onReorder }) {
  const { state } = useApp();
  const { queue, isHost } = state;
  const { tracks, currentIndex } = queue;
  const dragSrcRef = useRef(-1);

  if (tracks.length === 0) {
    return (
      <div className="queue-panel glass-card">
        <QueueHeader count={0} />
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
      <QueueHeader count={tracks.length} />
      <div className="queue-list">
        {tracks.map((track, index) => {
          const isActive = index === currentIndex;
          const sourceLabel = track.source === 'youtube' ? 'YT' : 'SC';
          return (
            <div
              key={track.id}
              className={`queue-item${isActive ? ' active' : ''}`}
              draggable={isHost}
              onClick={(e) => {
                if (e.target.closest('.queue-item-remove') || e.target.closest('.queue-item-drag')) return;
                onSkipTo(track.id);
              }}
              onDragStart={isHost ? (e) => handleDragStart(e, index) : undefined}
              onDragEnd={isHost ? handleDragEnd : undefined}
              onDragOver={isHost ? handleDragOver : undefined}
              onDrop={isHost ? (e) => handleDrop(e, index) : undefined}
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
                  : <span style={{ color: 'var(--text-muted)' }}>🎵</span>
                }
              </div>
              <div className="queue-item-info">
                <div className="queue-item-title">{track.title || 'Loading...'}</div>
                <div className="queue-item-meta">
                  <span className="queue-item-source">{sourceLabel}</span>
                  <span>{track.addedBy}</span>
                  {track.duration > 0 && <span>• {formatTime(track.duration)}</span>}
                </div>
              </div>
              {isHost && (
                <button
                  className="queue-item-remove"
                  title="Xóa khỏi hàng chờ"
                  onClick={(e) => { e.stopPropagation(); onRemove(track.id); }}
                >
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <line x1="18" y1="6" x2="6" y2="18"/>
                    <line x1="6" y1="6" x2="18" y2="18"/>
                  </svg>
                </button>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function QueueHeader({ count }) {
  return (
    <div className="panel-header">
      <h3>
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <line x1="8" y1="6" x2="21" y2="6"/>
          <line x1="8" y1="12" x2="21" y2="12"/>
          <line x1="8" y1="18" x2="21" y2="18"/>
          <line x1="3" y1="6" x2="3.01" y2="6"/>
          <line x1="3" y1="12" x2="3.01" y2="12"/>
          <line x1="3" y1="18" x2="3.01" y2="18"/>
        </svg>
        Hàng Chờ
      </h3>
      <span className="badge">{count}</span>
    </div>
  );
}
