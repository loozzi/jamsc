import { useApp } from '../context/AppContext';

export default function LandingView() {
  const { dispatch } = useApp();

  return (
    <div className="view active" id="view-landing">
      <div className="landing-container">
        <div className="logo-section">
          <div className="logo-icon">
            <svg viewBox="0 0 100 100" className="logo-svg">
              <defs>
                <linearGradient id="logo-gradient" x1="0%" y1="0%" x2="100%" y2="100%">
                  <stop offset="0%" style={{ stopColor: '#00f5d4' }} />
                  <stop offset="50%" style={{ stopColor: '#7b2ff7' }} />
                  <stop offset="100%" style={{ stopColor: '#f72585' }} />
                </linearGradient>
              </defs>
              <circle cx="50" cy="50" r="45" fill="none" stroke="url(#logo-gradient)" strokeWidth="3" />
              <path d="M 35 25 L 35 75 L 72 50 Z" fill="url(#logo-gradient)" />
            </svg>
            <div className="logo-glow" />
          </div>
          <h1 className="logo-title">JAMSC</h1>
          <p className="logo-subtitle">Listen Together, Feel Together</p>
        </div>

        <div className="landing-actions">
          <button className="btn btn-primary btn-glow" onClick={() => dispatch({ type: 'SET_VIEW', view: 'create' })}>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <circle cx="12" cy="12" r="10" />
              <path d="M12 8v8M8 12h8" />
            </svg>
            Tạo Phòng
          </button>
          <button className="btn btn-secondary" onClick={() => dispatch({ type: 'SET_VIEW', view: 'join' })}>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M15 3h4a2 2 0 012 2v14a2 2 0 01-2 2h-4M10 17l5-5-5-5M15 12H3" />
            </svg>
            Tham Gia Phòng
          </button>
        </div>

        <div className="features-grid">
          <div className="feature-card glass-card">
            <div className="feature-icon">🎵</div>
            <h3>Đồng bộ hoàn hảo</h3>
            <p>Nghe cùng lúc, cùng nhịp điệu</p>
          </div>
          <div className="feature-card glass-card">
            <div className="feature-icon">🎧</div>
            <h3>Đa nguồn nhạc</h3>
            <p>YouTube, YouTube Music, SoundCloud</p>
          </div>
          <div className="feature-card glass-card">
            <div className="feature-icon">👥</div>
            <h3>Cùng bạn bè</h3>
            <p>Chia sẻ mã phòng, mời tham gia</p>
          </div>
        </div>
      </div>
    </div>
  );
}
