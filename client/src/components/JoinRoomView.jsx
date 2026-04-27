import { useState, useEffect } from 'react';
import { useApp } from '../context/AppContext';
import Avatar from './Avatar';

export default function JoinRoomView({ onJoinRoom, initialCode = '' }) {
  const { dispatch } = useApp();
  const [step, setStep] = useState(initialCode ? 2 : 1);
  const [code, setCode] = useState(initialCode);
  const [name, setName] = useState(() => localStorage.getItem('jamsc-username') || '');
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (initialCode) { setCode(initialCode); setStep(2); }
  }, [initialCode]);

  async function handleJoin(e) {
    e.preventDefault();
    const trimmedCode = code.trim().toUpperCase();
    const trimmedName = name.trim();
    if (!trimmedCode || !trimmedName) return;
    setLoading(true);
    try {
      await onJoinRoom(trimmedCode, trimmedName);
    } finally {
      setLoading(false);
    }
  }

  function handleBack() {
    if (step === 2 && !initialCode) setStep(1);
    else dispatch({ type: 'SET_VIEW', view: 'landing' });
  }

  return (
    <div className="view active" id="view-join">
      <div className="join-wrapper">
        <button className="join-back-btn" onClick={handleBack}>
          ← Quay lại
        </button>

      <div className="join-card">
        {/* Logo mark */}
        <div style={{
          width: 48, height: 48, borderRadius: 14, background: 'var(--primary)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          marginBottom: 24, boxShadow: '0 0 24px rgba(30,215,96,0.3)',
        }}>
          <span style={{ fontFamily: 'var(--font)', fontSize: 20, fontWeight: 800, color: '#000' }}>J</span>
        </div>

        {step === 1 && (
          <>
            <div className="join-eyebrow">Tham Gia Phòng</div>
            <div className="join-title">Nhập mã mời</div>
            <p className="join-sub">Hỏi bạn bè về mã phòng 6 ký tự của họ.</p>

            <input
              className="field"
              placeholder="ABC123"
              maxLength={6}
              autoComplete="off"
              autoFocus
              value={code}
              onChange={e => setCode(e.target.value.toUpperCase())}
              style={{
                fontSize: 28, padding: '16px 20px', marginBottom: 20,
                fontFamily: 'var(--font)', fontWeight: 700,
                textAlign: 'center', letterSpacing: '0.18em',
              }}
            />

            <div className="join-hint-box">
              <div className="join-hint-icon">🎵</div>
              <div>
                <div style={{ fontSize: 13, fontWeight: 600 }}>Phòng hiện ngay khi bạn nhập đủ mã</div>
                <div style={{ fontSize: 11, color: 'var(--muted)', marginTop: 2 }}>Mã 6 ký tự từ bạn bè</div>
              </div>
              <div className="join-hint-dot" />
            </div>

            <button
              className="btn btn-primary"
              style={{ width: '100%', opacity: code.trim().length >= 4 ? 1 : 0.4 }}
              onClick={() => code.trim().length >= 4 && setStep(2)}
              disabled={code.trim().length < 4}
            >
              Tiếp tục →
            </button>
          </>
        )}

        {step === 2 && (
          <>
            <div className="join-eyebrow">Gần xong rồi</div>
            <div className="join-title">Tên bạn là gì?</div>
            <p className="join-sub">Bạn bè sẽ thấy tên này trong phòng.</p>

            <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginBottom: 20 }}>
              <Avatar name={name || '?'} size="lg" />
              <input
                className="field"
                placeholder="Nhập tên hiển thị…"
                maxLength={20}
                autoComplete="off"
                autoFocus
                value={name}
                onChange={e => setName(e.target.value)}
                style={{ flex: 1, fontSize: 16 }}
              />
            </div>

            <div className="join-hint-box" style={{ marginBottom: 24 }}>
              <div className="join-hint-icon">🚪</div>
              <div>
                <div style={{ fontSize: 12, color: 'var(--muted)', marginBottom: 2 }}>Tham gia phòng</div>
                <div style={{ fontSize: 15, fontWeight: 700, letterSpacing: '0.12em', color: 'var(--primary)' }}>
                  {code}
                </div>
              </div>
              <div className="join-hint-dot" />
            </div>

            <form onSubmit={handleJoin}>
              <button
                type="submit"
                className="btn btn-primary"
                style={{ width: '100%', opacity: name.trim() ? 1 : 0.4 }}
                disabled={loading || !name.trim()}
              >
                {loading && <span className="spinner" style={{ borderTopColor: '#000', marginRight: 8 }} />}
                {loading ? 'Đang vào phòng…' : 'Vào phòng →'}
              </button>
            </form>
          </>
        )}
      </div>
      </div>
    </div>
  );
}
