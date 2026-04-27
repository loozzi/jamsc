import { useApp } from '../../context/AppContext';
import { copyToClipboard } from '../../utils/helpers';

export default function RoomHeader({ onLeave, onOpenSettings }) {
  const { state, showToast } = useApp();
  const { room, isHost, connected } = state;

  const sessionName = room ? `${room.hostName}'s Jam` : 'Jam';

  async function handleCopyCode() {
    if (!room) return;
    const url = window.location.origin + '?room=' + room.id;
    const ok = await copyToClipboard(url);
    if (ok) showToast('Đã sao chép link mời!', 'success');
  }

  return (
    <header className="room-header glass-card">
      <div className="room-header-left">
        <div>
          <div className="room-session-name">{sessionName}</div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 2 }}>
            <span className="room-live-badge">● LIVE</span>
            <button
              className="btn-icon btn-copy"
              onClick={handleCopyCode}
              title="Sao chép link mời"
              style={{ width: 24, height: 24 }}
            >
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <rect x="9" y="9" width="13" height="13" rx="2"/>
                <path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1"/>
              </svg>
            </button>
            <span style={{ fontSize: 11, color: 'var(--dim)', letterSpacing: '0.1em' }}>{room?.id ?? '------'}</span>
          </div>
        </div>
      </div>

      <div className="room-header-right">
        <div className={`connection-status${connected ? '' : ' disconnected'}`}>
          <span className="status-dot" />
          {connected ? 'Online' : 'Offline'}
        </div>

        {isHost && (
          <button className="btn-icon" onClick={onOpenSettings} title="Cài đặt phòng">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <circle cx="12" cy="12" r="3"/>
              <path d="M19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 01-2.83 2.83l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 01-4 0v-.09A1.65 1.65 0 009 19.4a1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 01-2.83-2.83l.06-.06A1.65 1.65 0 004.68 15a1.65 1.65 0 00-1.51-1H3a2 2 0 010-4h.09A1.65 1.65 0 004.6 9a1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 012.83-2.83l.06.06A1.65 1.65 0 009 4.68a1.65 1.65 0 001-1.51V3a2 2 0 014 0v.09a1.65 1.65 0 001 1.51 1.65 1.65 0 001.82-.33l.06-.06a2 2 0 012.83 2.83l-.06.06A1.65 1.65 0 0019.4 9a1.65 1.65 0 001.51 1H21a2 2 0 010 4h-.09a1.65 1.65 0 00-1.51 1z"/>
            </svg>
          </button>
        )}

        <button className="btn-icon btn-danger" onClick={onLeave} title="Rời phòng">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M9 21H5a2 2 0 01-2-2V5a2 2 0 012-2h4M16 17l5-5-5-5M21 12H9"/>
          </svg>
        </button>
      </div>
    </header>
  );
}
