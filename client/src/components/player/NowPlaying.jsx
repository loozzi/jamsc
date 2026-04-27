import { useApp } from '../../context/AppContext';

export default function NowPlaying({ isPlaying, currentTrack }) {
  const { state } = useApp();
  const track = currentTrack ?? state.queue.tracks[state.queue.currentIndex] ?? null;

  if (!track) {
    return (
      <div className="now-playing glass-card">
        <div className="now-playing-empty">
          <div className="empty-icon">🎵</div>
          <p>Chưa có bài nào đang phát</p>
          <p className="empty-hint">Thêm bài hát vào hàng chờ để bắt đầu!</p>
        </div>
      </div>
    );
  }

  const isYoutube = track.source === 'youtube';

  return (
    <div className="now-playing glass-card">
      <div className="now-playing-info">
        <div className="now-playing-artwork">
          {track.thumbnail
            ? <img src={track.thumbnail} alt="Album art" />
            : <div className="player-art-pulse" />
          }
          <div className={`playing-indicator${isPlaying ? ' active' : ''}`}>
            <span /><span /><span /><span />
          </div>
        </div>
        <div className="now-playing-details">
          <div className={`now-playing-source${isYoutube ? '' : ' soundcloud'}`}>
            {isYoutube ? 'YouTube' : 'SoundCloud'}
          </div>
          <h3 className="now-playing-title">{track.title || 'Loading...'}</h3>
          <p className="now-playing-added">Thêm bởi {track.addedBy || 'Unknown'}</p>
        </div>
      </div>
    </div>
  );
}
