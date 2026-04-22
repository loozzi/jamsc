import { useRef, useCallback } from 'react';
import { useApp } from '../../context/AppContext';
import { formatTime } from '../../utils/helpers';

export default function PlayerControls({ player, onTogglePlay, onNext, onSeek }) {
  const { state } = useApp();
  const { isHost, room } = state;
  const { isPlaying, progress } = player;
  const barRef = useRef(null);
  const scrubPtrRef = useRef(null);
  const scrubLastXRef = useRef(0);

  const canSkip = isHost || room?.settings?.allowSkip;
  const { currentTime, duration } = progress;
  const fillPct = duration > 0 ? Math.min((currentTime / duration) * 100, 100) : 0;

  // ─── Progress Scrub (host only) ───────────

  const ratioFromX = useCallback((clientX) => {
    const rect = barRef.current?.getBoundingClientRect();
    if (!rect || rect.width <= 0) return 0;
    return Math.min(1, Math.max(0, (clientX - rect.left) / rect.width));
  }, []);

  const handleBarPointerDown = useCallback((e) => {
    if (!isHost) return;
    if (e.button !== 0) return;
    if (!state.queue.tracks.length) return;
    e.preventDefault();
    scrubPtrRef.current = e.pointerId;
    scrubLastXRef.current = e.clientX;
    barRef.current?.classList.add('is-scrubbing');
    try { barRef.current?.setPointerCapture(e.pointerId); } catch (_) {}
  }, [isHost, state.queue.tracks.length]);

  const handleBarPointerMove = useCallback((e) => {
    if (scrubPtrRef.current === null || e.pointerId !== scrubPtrRef.current) return;
    scrubLastXRef.current = e.clientX;
    if (duration > 0) {
      const t = ratioFromX(e.clientX) * duration;
      player.updateProgressVisual?.(t, duration);
    }
  }, [duration, player, ratioFromX]);

  const handleBarPointerUp = useCallback((e) => {
    if (scrubPtrRef.current === null || e.pointerId !== scrubPtrRef.current) return;
    const pid = scrubPtrRef.current;
    scrubPtrRef.current = null;
    barRef.current?.classList.remove('is-scrubbing');
    try { barRef.current?.releasePointerCapture(pid); } catch (_) {}

    if (duration > 0) {
      const t = ratioFromX(scrubLastXRef.current) * duration;
      player.seekTo(t);
      onSeek?.(t);
    }
  }, [duration, player, ratioFromX, onSeek]);

  return (
    <div className="player-controls">
      <div className="progress-container">
        <span className="time-current">{formatTime(currentTime)}</span>
        <div
          ref={barRef}
          className={`progress-bar${!isHost ? ' disabled' : ''}`}
          onPointerDown={handleBarPointerDown}
          onPointerMove={handleBarPointerMove}
          onPointerUp={handleBarPointerUp}
          onPointerCancel={handleBarPointerUp}
        >
          <div className="progress-fill" style={{ width: `${fillPct}%` }}>
            <div className="progress-handle" />
          </div>
        </div>
        <span className="time-duration">{formatTime(duration)}</span>
      </div>

      <div className="controls-row">
        <button className="btn-control btn-play" onClick={onTogglePlay}>
          {isPlaying ? (
            <svg width="28" height="28" viewBox="0 0 24 24" fill="currentColor">
              <path d="M6 19h4V5H6v14zm8-14v14h4V5h-4z" />
            </svg>
          ) : (
            <svg width="28" height="28" viewBox="0 0 24 24" fill="currentColor">
              <path d="M8 5v14l11-7z" />
            </svg>
          )}
        </button>

        <button
          className={`btn-control${!canSkip ? ' disabled' : ''}`}
          onClick={canSkip ? onNext : undefined}
          title="Bài tiếp"
        >
          <svg width="24" height="24" viewBox="0 0 24 24" fill="currentColor">
            <path d="M6 18l8.5-6L6 6v12zM16 6v12h2V6h-2z" />
          </svg>
        </button>

        <VolumeControl player={player} />
      </div>
    </div>
  );
}

function VolumeControl({ player }) {
  const { volume, setVolume } = player;
  const prevVolRef = useRef(70);

  function handleVolumeChange(e) {
    player.setVolume(parseInt(e.target.value));
  }

  function toggleMute() {
    if (volume > 0) {
      prevVolRef.current = volume;
      player.setVolume(0);
    } else {
      player.setVolume(prevVolRef.current || 70);
    }
  }

  return (
    <div className="volume-control">
      <button className="btn-control btn-volume" onClick={toggleMute} title="Âm lượng">
        {volume === 0 ? (
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5" />
            <line x1="23" y1="9" x2="17" y2="15" />
            <line x1="17" y1="9" x2="23" y2="15" />
          </svg>
        ) : (
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5" />
            <path d="M19.07 4.93a10 10 0 010 14.14M15.54 8.46a5 5 0 010 7.07" />
          </svg>
        )}
      </button>
      <input
        type="range"
        min="0"
        max="100"
        value={volume}
        onChange={handleVolumeChange}
        className="slider-volume"
      />
    </div>
  );
}
