import { useState } from 'react';
import { useApp } from '../context/AppContext';

const SUGGESTIONS = ['Late Night Classics', 'Friday Feels', 'Study Vibes', 'Hype Set'];

export default function CreateRoomView({ onCreateRoom }) {
  const { dispatch } = useApp();
  const [name, setName] = useState(() => localStorage.getItem('jamsc-username') || '');
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e) {
    e.preventDefault();
    const trimmed = name.trim();
    if (!trimmed) return;
    setLoading(true);
    try {
      await onCreateRoom(trimmed);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="view active" id="view-create">
      <div style={{
        minHeight: '100vh', display: 'flex', flexDirection: 'column',
        padding: '16px 24px 32px', background: 'var(--bg)',
      }}>
        <button
          onClick={() => dispatch({ type: 'SET_VIEW', view: 'landing' })}
          style={{ background: 'none', color: 'var(--muted)', fontSize: 13, padding: '8px 0', alignSelf: 'flex-start', display: 'flex', alignItems: 'center', gap: 6, border: 'none', cursor: 'pointer', fontFamily: 'var(--font)' }}
        >
          ← Quay lại
        </button>

        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'center', animation: 'fadeIn 0.3s ease both' }}>
          <div style={{ marginBottom: 32 }}>
            <div style={{ fontSize: 11, fontWeight: 600, letterSpacing: '0.15em', textTransform: 'uppercase', color: 'var(--primary)', marginBottom: 8 }}>
              Tạo Phòng
            </div>
            <h2 style={{ fontSize: 30, fontWeight: 800, letterSpacing: '-0.01em', marginBottom: 8 }}>
              Tên của bạn là gì?
            </h2>
            <p style={{ fontSize: 14, color: 'var(--muted)' }}>
              Bạn bè sẽ thấy tên này trong phòng.
            </p>
          </div>

          <input
            className="field"
            placeholder="Nhập tên hiển thị..."
            maxLength={20}
            required
            autoComplete="off"
            autoFocus
            value={name}
            onChange={e => setName(e.target.value)}
            style={{ fontSize: 18, padding: '18px 20px', marginBottom: 16, fontFamily: 'var(--font)', fontWeight: 600 }}
          />

          {/* Quick suggestions */}
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 32 }}>
            {SUGGESTIONS.map(s => (
              <button
                key={s}
                onClick={() => setName(s)}
                style={{
                  padding: '7px 14px', borderRadius: 50, background: 'var(--s2)',
                  border: '1px solid var(--border)', color: 'var(--muted)', fontSize: 12,
                  fontWeight: 500, transition: 'all 0.15s', cursor: 'pointer',
                  fontFamily: 'var(--font)',
                }}
              >
                {s}
              </button>
            ))}
          </div>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <button
            className="btn btn-primary"
            style={{ width: '100%', opacity: name.trim() ? 1 : 0.4 }}
            onClick={handleSubmit}
            disabled={loading || !name.trim()}
          >
            {loading ? <span className="spinner" style={{ borderTopColor: '#000' }} /> : null}
            {loading ? 'Đang tạo…' : 'Tạo Phòng'}
          </button>
        </div>
      </div>
    </div>
  );
}
