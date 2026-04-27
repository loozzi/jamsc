import { useApp } from '../context/AppContext';
import Avatar from './Avatar';

const DEMO_NAMES = ['Alex', 'Maya', 'Jordan', 'Sam'];

export default function LandingView() {
  const { dispatch } = useApp();

  return (
    <div className="view active" id="view-landing">
      <div style={{
        minHeight: '100vh', display: 'flex', flexDirection: 'column',
        alignItems: 'center', padding: '0 24px 32px', background: 'var(--bg)',
      }}>
        {/* Hero */}
        <div style={{
          flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center',
          justifyContent: 'center', textAlign: 'center', paddingTop: 60, paddingBottom: 40,
          animation: 'fadeIn 0.5s ease both',
        }}>
          {/* Logo */}
          <div style={{
            width: 72, height: 72, borderRadius: 22, background: 'var(--primary)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            marginBottom: 24, boxShadow: '0 0 40px rgba(30,215,96,0.35)',
            animation: 'pulse 3s ease infinite',
          }}>
            <span style={{ fontFamily: 'var(--font)', fontSize: 28, fontWeight: 800, color: '#000' }}>J</span>
          </div>

          <h1 style={{ fontSize: 42, fontWeight: 800, letterSpacing: '-0.02em', lineHeight: 1.1, marginBottom: 12 }}>
            JAM<span style={{ color: 'var(--primary)' }}>SC</span>
          </h1>
          <p style={{ fontSize: 16, color: 'var(--muted)', lineHeight: 1.6, maxWidth: 280, marginBottom: 8 }}>
            Nghe nhạc cùng bạn bè — đồng bộ, theo thời gian thực.
          </p>
          <p style={{ fontSize: 13, color: 'var(--dim)', marginBottom: 48 }}>
            YouTube · SoundCloud · Không cần tài khoản
          </p>

          {/* Social proof - stacked avatars */}
          <div style={{
            display: 'flex', alignItems: 'center', gap: 8, marginBottom: 48,
            padding: '12px 20px', background: 'var(--s1)', borderRadius: 50,
            border: '1px solid var(--border)',
          }}>
            {DEMO_NAMES.map((n, i) => (
              <div key={n} style={{ marginLeft: i > 0 ? -12 : 0, zIndex: 4 - i }}>
                <Avatar name={n} size="sm" />
              </div>
            ))}
            <span style={{ fontSize: 12, color: 'var(--muted)', marginLeft: 8 }}>
              {DEMO_NAMES.length} bạn đang nghe nhạc cùng nhau
            </span>
            <div style={{ width: 8, height: 8, borderRadius: '50%', background: '#22c55e', animation: 'pulse 2s infinite' }} />
          </div>
        </div>

        {/* Actions */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12, width: '100%', maxWidth: 400, animation: 'fadeIn 0.5s 0.15s ease both', opacity: 0, animationFillMode: 'forwards' }}>
          <button
            className="btn btn-primary"
            style={{ width: '100%' }}
            onClick={() => dispatch({ type: 'SET_VIEW', view: 'create' })}
          >
            <span>✦</span> Tạo Phòng
          </button>
          <button
            className="btn btn-ghost"
            style={{ width: '100%' }}
            onClick={() => dispatch({ type: 'SET_VIEW', view: 'join' })}
          >
            Tham Gia Phòng
          </button>
          <p style={{ textAlign: 'center', fontSize: 12, color: 'var(--dim)', marginTop: 4 }}>
            Phòng riêng tư · Không cần tài khoản
          </p>
        </div>
      </div>
    </div>
  );
}
