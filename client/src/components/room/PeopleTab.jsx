import { useState } from 'react';
import { useApp } from '../../context/AppContext';
import Avatar from '../Avatar';

export default function PeopleTab() {
  const { state } = useApp();
  const members = state.room?.members ?? [];
  const myId = state.mySocketId;
  const [selectedMember, setSelectedMember] = useState(null);

  const syncedCount = members.length;

  return (
    <div className="people-tab">
      {/* Sync status summary */}
      <div className="people-sync-row">
        <div className="people-sync-label">Trạng thái đồng bộ</div>
        <div className="people-sync-stats">
          <div className="people-sync-stat">
            <div style={{ width: 8, height: 8, borderRadius: '50%', background: '#22c55e' }} />
            {syncedCount} đồng bộ
          </div>
        </div>
      </div>

      {/* Participant cards */}
      {members.map(member => (
        <button
          key={member.id}
          className="participant-card"
          onClick={() => setSelectedMember(member)}
        >
          <Avatar name={member.name} size="md" isHost={member.isHost} syncStatus="green" />
          <div style={{ flex: 1 }}>
            <div className="participant-card-name" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              {member.name}
              {member.isHost && (
                <span style={{ fontSize: 10, background: 'var(--primary-a)', color: 'var(--primary)', padding: '2px 8px', borderRadius: 20, fontWeight: 600 }}>
                  👑 Host
                </span>
              )}
              {member.id === myId && !member.isHost && (
                <span style={{ fontSize: 10, background: 'var(--s3)', color: 'var(--muted)', padding: '2px 8px', borderRadius: 20, border: '1px solid var(--border2)' }}>
                  Bạn
                </span>
              )}
            </div>
            <div className="participant-card-status">Đang đồng bộ</div>
          </div>
          <span className="participant-card-chevron">›</span>
        </button>
      ))}

      {/* Participant bottom sheet */}
      {selectedMember && (
        <div className="sheet-overlay" onClick={() => setSelectedMember(null)}>
          <div className="sheet" onClick={e => e.stopPropagation()}>
            <div className="sheet-handle" />
            <div style={{ display: 'flex', alignItems: 'center', gap: 16, marginBottom: 0 }}>
              <Avatar name={selectedMember.name} size="lg" isHost={selectedMember.isHost} syncStatus="green" />
              <div>
                <div className="participant-sheet-name">{selectedMember.name}</div>
                <div className="participant-sheet-badges">
                  {selectedMember.isHost && (
                    <span className="badge badge-host">👑 Host</span>
                  )}
                  <span className="badge badge-guest">Guest</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
