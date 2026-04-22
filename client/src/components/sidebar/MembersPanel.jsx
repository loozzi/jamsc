import { useApp } from '../../context/AppContext';
import { getAvatarColor, getInitials } from '../../utils/helpers';

export default function MembersPanel() {
  const { state } = useApp();
  const members = state.room?.members ?? [];
  const myId = state.mySocketId;

  return (
    <div className="members-panel glass-card">
      <div className="panel-header">
        <h3>
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2"/>
            <circle cx="9" cy="7" r="4"/>
            <path d="M23 21v-2a4 4 0 00-3-3.87M16 3.13a4 4 0 010 7.75"/>
          </svg>
          Thành Viên
        </h3>
        <span className="badge">{members.length}</span>
      </div>
      <div className="members-list">
        {members.map((member) => {
          const color = getAvatarColor(member.name);
          return (
            <div key={member.id} className="member-item">
              <div
                className="member-avatar"
                style={{ background: `${color}30`, color }}
              >
                {getInitials(member.name)}
              </div>
              <span className="member-name">{member.name}</span>
              {member.isHost && <span className="member-badge host">Host</span>}
              {member.id === myId && <span className="member-badge you">Bạn</span>}
            </div>
          );
        })}
      </div>
    </div>
  );
}
