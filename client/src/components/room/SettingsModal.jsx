import { useApp } from '../../context/AppContext';

export default function SettingsModal({ onClose, onUpdateSetting }) {
  const { state } = useApp();
  const allowSkip = state.room?.settings?.allowSkip ?? false;
  const allowSeek = state.room?.settings?.allowSeek ?? false;

  return (
    <div className="modal-overlay" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal glass-card">
        <div className="modal-header">
          <h3>Cài Đặt Phòng</h3>
          <button className="btn-icon" onClick={onClose}>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>
        <div className="modal-body">
          <div className="setting-item">
            <div className="setting-info">
              <h4>Cho phép thành viên chuyển bài</h4>
              <p>Thành viên có thể bấm Next</p>
            </div>
            <label className="toggle">
              <input
                type="checkbox"
                checked={allowSkip}
                onChange={(e) => onUpdateSetting({ allowSkip: e.target.checked })}
              />
              <span className="toggle-slider" />
            </label>
          </div>
          <div className="setting-item">
            <div className="setting-info">
              <h4>Cho phép thành viên tua</h4>
              <p>Thành viên có thể kéo thanh tiến trình</p>
            </div>
            <label className="toggle">
              <input
                type="checkbox"
                checked={allowSeek}
                onChange={(e) => onUpdateSetting({ allowSeek: e.target.checked })}
              />
              <span className="toggle-slider" />
            </label>
          </div>
        </div>
      </div>
    </div>
  );
}
