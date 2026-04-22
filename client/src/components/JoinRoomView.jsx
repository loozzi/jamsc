import { useState, useEffect } from 'react';
import { useApp } from '../context/AppContext';

export default function JoinRoomView({ onJoinRoom, initialCode = '' }) {
  const { dispatch } = useApp();
  const [code, setCode] = useState(initialCode);
  const [name, setName] = useState('');

  useEffect(() => {
    if (initialCode) setCode(initialCode);
  }, [initialCode]);

  async function handleSubmit(e) {
    e.preventDefault();
    const trimmedCode = code.trim().toUpperCase();
    const trimmedName = name.trim();
    if (!trimmedCode || !trimmedName) return;
    await onJoinRoom(trimmedCode, trimmedName);
  }

  return (
    <div className="view active" id="view-join">
      <div className="form-container glass-card">
        <button className="btn-back" onClick={() => dispatch({ type: 'SET_VIEW', view: 'landing' })}>
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M19 12H5M12 19l-7-7 7-7" />
          </svg>
        </button>
        <h2>Tham Gia Phòng</h2>
        <p className="form-desc">Nhập mã phòng và tên bạn để vào phòng nghe nhạc</p>
        <form onSubmit={handleSubmit}>
          <div className="input-group">
            <label htmlFor="input-room-code">Mã phòng</label>
            <input
              type="text"
              id="input-room-code"
              placeholder="VD: ABC123"
              maxLength={6}
              required
              autoComplete="off"
              value={code}
              onChange={(e) => setCode(e.target.value.toUpperCase())}
              style={{ textTransform: 'uppercase', letterSpacing: '0.3em', textAlign: 'center', fontSize: '1.5rem' }}
            />
          </div>
          <div className="input-group">
            <label htmlFor="input-member-name">Tên của bạn</label>
            <input
              type="text"
              id="input-member-name"
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
              <path d="M15 3h4a2 2 0 012 2v14a2 2 0 01-2 2h-4M10 17l5-5-5-5M15 12H3" />
            </svg>
            Tham Gia
          </button>
        </form>
      </div>
    </div>
  );
}
