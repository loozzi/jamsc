import { getAvatarColor, getInitials } from '../utils/helpers';

const HOST_COLOR = '#1ed760';

export default function Avatar({ name, size = 'md', syncStatus, isHost }) {
  const bg = isHost ? HOST_COLOR : getAvatarColor(name);
  const textColor = isHost ? '#000' : '#fff';
  return (
    <div className={`avatar avatar-${size}`} style={{ background: bg, color: textColor }}>
      {isHost && <span className="crown">👑</span>}
      {getInitials(name)}
      {syncStatus && <div className={`sync-dot sync-${syncStatus}`} />}
    </div>
  );
}
