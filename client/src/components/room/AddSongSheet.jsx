import { useState } from 'react';
import { useApp } from '../../context/AppContext';

export default function AddSongSheet({ onClose, onAddTrack, onYoutubeSearch }) {
  const { showToast } = useApp();
  const [url, setUrl] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [addingUrl, setAddingUrl] = useState(false);
  const [searching, setSearching] = useState(false);

  async function handleUrlSubmit(e) {
    e.preventDefault();
    const trimmed = url.trim();
    if (!trimmed) return;
    setAddingUrl(true);
    try {
      await onAddTrack(trimmed);
      onClose();
    } catch (err) {
      showToast(err.message || 'Không thể thêm bài hát', 'error');
    } finally {
      setAddingUrl(false);
    }
  }

  async function handleSearchSubmit(e) {
    e.preventDefault();
    const q = searchQuery.trim();
    if (!q) return;
    setSearching(true);
    try {
      await onYoutubeSearch(q);
      onClose();
    } catch (err) {
      showToast(err.message || 'Không thể tìm kiếm', 'error');
    } finally {
      setSearching(false);
    }
  }

  return (
    <div className="sheet-overlay" onClick={onClose}>
      <div className="sheet" onClick={e => e.stopPropagation()}>
        <div className="sheet-handle" />
        <h3 className="sheet-title">Thêm Bài Hát</h3>
        <p className="sheet-sub">Dán link YouTube, playlist YouTube, SoundCloud hoặc Spotify</p>

        {/* URL input */}
        <form onSubmit={handleUrlSubmit}>
          <div className="sheet-url-field">
            <span className="sheet-url-icon">🔗</span>
            <input
              value={url}
              onChange={e => setUrl(e.target.value)}
              placeholder="YouTube, SoundCloud hoặc Spotify…"
              autoFocus
            />
            {addingUrl && <div className="spinner" />}
          </div>
          {url.trim() && (
            <button type="submit" className="btn btn-primary" style={{ width: '100%', marginBottom: 16 }} disabled={addingUrl}>
              {addingUrl ? 'Đang thêm…' : 'Thêm vào hàng chờ'}
            </button>
          )}
        </form>

        {!url.trim() && (
          <div style={{ marginBottom: 16 }}>
            <div className="sheet-section-label">Nền tảng hỗ trợ</div>
            <div className="sheet-platforms">
              {[['▶', 'YouTube', '#ff4444'], ['☁', 'SoundCloud', '#ff7700'], ['♫', 'Spotify', '#1db954']].map(([icon, name, c]) => (
                <div key={name} className="sheet-platform-chip">
                  <span style={{ fontSize: 14, color: c }}>{icon}</span>
                  <span className="sheet-platform-label">{name}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Search */}
        <div style={{ borderTop: '1px solid var(--border)', paddingTop: 16 }}>
          <div className="sheet-section-label" style={{ marginBottom: 8 }}>Tìm kiếm YouTube</div>
          <form onSubmit={handleSearchSubmit}>
            <div className="sheet-url-field">
              <span className="sheet-url-icon">🔍</span>
              <input
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                placeholder="Gõ tên bài hoặc ca sĩ…"
                maxLength={200}
              />
              {searching && <div className="spinner" />}
            </div>
            {searchQuery.trim() && (
              <button type="submit" className="btn btn-dark" style={{ width: '100%', marginTop: 8 }} disabled={searching}>
                {searching ? 'Đang tìm…' : 'Tìm và thêm kết quả đầu tiên'}
              </button>
            )}
          </form>
        </div>
      </div>
    </div>
  );
}
