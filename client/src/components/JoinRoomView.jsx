import { useState, useEffect } from 'react';
import { useApp } from '../context/AppContext';
import Avatar from './Avatar';

export default function JoinRoomView({ onJoinRoom, initialCode = '' }) {
  const { dispatch } = useApp();
  const [step, setStep] = useState(initialCode ? 2 : 1); // 1=code, 2=name
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

  return (
    <div className="view active" id="view-join">
      <div style={{
        minHeight: '100vh', display: 'flex', flexDirection: 'column',
        padding: '16px 24px 32px', background: 'var(--bg)',
      }}>
        <button
          onClick={() => step === 2 ? setStep(1) : dispatch({ type: 'SET_VIEW', view: 'landing' })}
          style={{ background: 'none', color: 'var(--muted)', fontSize: 13, padding: '8px 0', alignSelf: 'flex-start', display: 'flex', alignItems: 'center', gap: 6, border: 'none', cursor: 'pointer', fontFamily: 'var(--font)' }}
        >
          ← Quay lại
        </button>

        {step === 1 && (
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'center', animation: 'fadeIn 0.3s ease both' }}>
            <div style={{ marginBottom: 32 }}>
              <div style={{ fontSize: 11, fontWeight: 600, letterSpacing: '0.15em', textTransform: 'uppercase', color: 'var(--primary)', marginBottom: 8 }}>
                Tham Gia Phòng
              </div>
              <h2 style={{ fontSize: 30, fontWeight: 800, letterSpacing: '-0.01em', marginBottom: 8 }}>
                Nhập mã mời
              </h2>
              <p style={{ fontSize: 14, color: 'var(--muted)' }}>
                Hỏi bạn bè về mã phòng của họ.
              </p>
            </div>

            <input
              className="field"
              placeholder="JAM · ····"
              maxLength={6}
              autoComplete="off"
              autoFocus
              value={code}
              onChange={e => setCode(e.target.value.toUpperCase())}
              style={{ fontSize: 24, padding: '18px 20px', marginBottom: 32, fontFamily: 'var(--font)', fontWeight: 700, textAlign: 'center', letterSpacing: '0.1em' }}
            />

            {/* Session preview hint */}
            <div style={{ background: 'var(--s1)', borderRadius: 14, padding: '14px 16px', display: 'flex', alignItems: 'center', gap: 12, border: '1px solid var(--border)', marginBottom: 32 }}>
              <div style={{ width: 40, height: 40, borderRadius: 10, background: 'linear-gradient(135deg,var(--s3),var(--s4))', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 18 }}>🎵</div>
              <div>
                <div style={{ fontSize: 13, fontWeight: 600 }}>Phòng sẽ hiện tên khi bạn nhập mã</div>
                <div style={{ fontSize: 11, color: 'var(--muted)', marginTop: 2 }}>Nhập mã 6 ký tự bên trên</div>
              </div>
              <div style={{ marginLeft: 'auto', width: 8, height: 8, borderRadius: '50%', background: '#22c55e' }} />
            </div>

            <button
              className="btn btn-primary"
              style={{ width: '100%', opacity: code.trim().length >= 4 ? 1 : 0.4 }}
              onClick={() => code.trim().length >= 4 && setStep(2)}
              disabled={code.trim().length < 4}
            >
              Tiếp tục
            </button>
          </div>
        )}

        {step === 2 && (
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'center', animation: 'fadeIn 0.3s ease both' }}>
            <div style={{ marginBottom: 32 }}>
              <div style={{ fontSize: 11, fontWeight: 600, letterSpacing: '0.15em', textTransform: 'uppercase', color: 'var(--primary)', marginBottom: 8 }}>
                Gần xong rồi
              </div>
              <h2 style={{ fontSize: 30, fontWeight: 800, letterSpacing: '-0.01em', marginBottom: 8 }}>
                Tên bạn là gì?
              </h2>
              <p style={{ fontSize: 14, color: 'var(--muted)' }}>
                Bạn bè sẽ thấy tên này trong phòng.
              </p>
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: 16, marginBottom: 24 }}>
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

            {/* Room code reminder */}
            <div style={{ background: 'var(--s1)', borderRadius: 12, padding: '12px 16px', border: '1px solid var(--border)', marginBottom: 32 }}>
              <div style={{ fontSize: 12, fontWeight: 600, marginBottom: 4, color: 'var(--muted)' }}>
                Tham gia phòng: <span style={{ color: 'var(--primary)', letterSpacing: '0.1em' }}>{code}</span>
              </div>
            </div>

            <form onSubmit={handleJoin}>
              <button
                type="submit"
                className="btn btn-primary"
                style={{ width: '100%', opacity: name.trim() ? 1 : 0.4 }}
                disabled={loading || !name.trim()}
              >
                {loading ? <span className="spinner" style={{ borderTopColor: '#000' }} /> : null}
                {loading ? 'Đang vào phòng…' : 'Vào phòng →'}
              </button>
            </form>
          </div>
        )}
      </div>
    </div>
  );
}
