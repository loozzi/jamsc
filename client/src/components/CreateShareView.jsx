import { useState, useEffect } from 'react';
import { useApp } from '../context/AppContext';
import { copyToClipboard } from '../utils/helpers';

const CONFETTI = ['🎶', '✦', '♪', '★', '·', '🎵'];

export default function CreateShareView({ onEnterRoom }) {
  const { state, showToast } = useApp();
  const roomCode = state.room?.id ?? '------';
  const [copied, setCopied] = useState(false);
  const [showConfetti, setShowConfetti] = useState(true);

  useEffect(() => {
    const t = setTimeout(() => setShowConfetti(false), 2200);
    return () => clearTimeout(t);
  }, []);

  async function handleCopy() {
    const url = window.location.origin + '?room=' + roomCode;
    const ok = await copyToClipboard(url);
    if (ok) {
      setCopied(true);
      showToast('Đã sao chép link mời!', 'success');
      setTimeout(() => setCopied(false), 2000);
    }
  }

  return (
    <div className="view active" id="view-create">
      <div style={{
        minHeight: '100vh', display: 'flex', flexDirection: 'column',
        alignItems: 'center', justifyContent: 'center',
        padding: '32px 24px', position: 'relative', overflow: 'hidden',
        background: 'var(--bg)',
      }}>
        {/* Confetti */}
        {showConfetti && Array.from({ length: 16 }).map((_, i) => (
          <div
            key={i}
            className="confetti-piece"
            style={{
              left: `${8 + i * 5.5}%`,
              top: '15%',
              animationDelay: `${i * 0.06}s`,
              animationDuration: `${0.9 + Math.random() * 0.7}s`,
            }}
          >
            {CONFETTI[i % CONFETTI.length]}
          </div>
        ))}

        <div style={{ width: '100%', maxWidth: 400, textAlign: 'center' }}>
          {/* Icon */}
          <div style={{
            width: 64, height: 64, borderRadius: 20,
            background: 'var(--primary)', display: 'flex',
            alignItems: 'center', justifyContent: 'center',
            margin: '0 auto 20px',
            boxShadow: '0 0 30px rgba(30,215,96,0.3)',
          }}>
            <span style={{ fontSize: 28 }}>✦</span>
          </div>

          <h2 style={{ fontSize: 26, fontWeight: 800, marginBottom: 6 }}>Phòng đã sẵn sàng!</h2>
          <p style={{ fontSize: 14, color: 'var(--muted)', marginBottom: 32 }}>
            Chia sẻ mã phòng để mời bạn bè
          </p>

          <div className="share-code-box">
            <div className="share-code-label">Mã mời</div>
            <div className="share-code-value">{roomCode}</div>
            <button
              className="btn btn-ghost btn-sm"
              style={{ width: '100%' }}
              onClick={handleCopy}
            >
              {copied ? '✓ Đã sao chép!' : '📋 Sao chép link mời'}
            </button>
          </div>

          <p style={{ fontSize: 12, color: 'var(--dim)', lineHeight: 1.6, marginBottom: 32 }}>
            Chia sẻ mã hoặc link cho bạn bè<br />để họ tham gia phòng của bạn
          </p>

          <button className="btn btn-primary" style={{ width: '100%' }} onClick={onEnterRoom}>
            Vào phòng →
          </button>
        </div>
      </div>
    </div>
  );
}
