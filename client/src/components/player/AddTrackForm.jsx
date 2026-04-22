import { useState } from 'react';
import { useApp } from '../../context/AppContext';

export default function AddTrackForm({ onAddTrack, onYoutubeSearch }) {
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
      setUrl('');
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
      setSearchQuery('');
    } catch (err) {
      showToast(err.message || 'Không thể tìm kiếm', 'error');
    } finally {
      setSearching(false);
    }
  }

  return (
    <div className="add-track glass-card">
      <form className="add-track-form" onSubmit={handleUrlSubmit}>
        <div className="input-with-btn">
          <input
            type="url"
            placeholder="Dán link YouTube, playlist YouTube, hoặc SoundCloud..."
            autoComplete="off"
            required
            value={url}
            onChange={(e) => setUrl(e.target.value)}
          />
          <button type="submit" className="btn btn-primary btn-add" disabled={addingUrl}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
              <path d="M12 5v14M5 12h14" />
            </svg>
          </button>
        </div>
      </form>
      <form className="add-track-form add-track-form--search" onSubmit={handleSearchSubmit}>
        <p className="add-track-search-hint">Tìm kiếm từ khóa trên YouTube. Thêm kết quả đầu tiên.</p>
        <div className="input-with-btn">
          <input
            type="search"
            placeholder="Gõ tên bài hoặc ca sĩ…"
            autoComplete="off"
            maxLength={200}
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
          <button type="submit" className="btn btn-primary btn-add" disabled={searching} title="Tìm và thêm">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
              <circle cx="11" cy="11" r="8" />
              <path d="M21 21l-4.35-4.35" />
            </svg>
          </button>
        </div>
      </form>
    </div>
  );
}
