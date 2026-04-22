import { useState } from 'react';
import { useApp } from '../context/AppContext';

export default function CreateRoomView({ onCreateRoom }) {
  const { dispatch } = useApp();
  const [name, setName] = useState(() => localStorage.getItem('jamsc-username') || '');

  async function handleSubmit(e) {
    e.preventDefault();
    const trimmed = name.trim();
    if (!trimmed) return;
    await onCreateRoom(trimmed);
  }

  return (
    <div className="view active" id="view-create">
      <div className="form-container glass-card">
        <button className="btn-back" onClick={() => dispatch({ type: 'SET_VIEW', view: 'landing' })}>
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M19 12H5M12 19l-7-7 7-7" />
          </svg>
        </button>
        <h2>Tạo Phòng Mới</h2>
        <p className="form-desc">Nhập tên của bạn để tạo phòng nghe nhạc</p>
        <form onSubmit={handleSubmit}>
          <div className="input-group">
            <label htmlFor="input-host-name">Tên của bạn</label>
            <input
              type="text"
              id="input-host-name"
              placeholder="Nhập tên hiển thị..."
              maxLength={20}
              required
              autoComplete="off"
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
          </div>
          <button type="submit" className="btn btn-primary btn-glow btn-full">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <circle cx="12" cy="12" r="10" />
              <path d="M12 8v8M8 12h8" />
            </svg>
            Tạo Phòng
          </button>
        </form>
      </div>
    </div>
  );
}
