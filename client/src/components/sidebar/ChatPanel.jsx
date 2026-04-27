import { useState, useEffect, useRef } from 'react';
import { useApp } from '../../context/AppContext';
import Avatar from '../Avatar';

const QUICK_EMOJIS = ['🔥', '❤️', '🎶'];

export default function ChatPanel({ onSendMessage }) {
  const { state } = useApp();
  const { chatMessages, mySocketId } = state;
  const [input, setInput] = useState('');
  const bottomRef = useRef(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [chatMessages]);

  function send() {
    const text = input.trim();
    if (!text) return;
    onSendMessage(text);
    setInput('');
  }

  function handleKey(e) {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(); }
  }

  // Group consecutive messages from same sender
  const groups = [];
  chatMessages.forEach((msg, i) => {
    if (msg.system) {
      groups.push({ type: 'system', msg });
      return;
    }
    const prev = chatMessages[i - 1];
    const isSelf = msg.senderId === mySocketId;
    const sameAsPrev = !msg.system && prev && !prev.system &&
      prev.senderId === msg.senderId;

    if (!sameAsPrev) {
      groups.push({ type: 'group', isSelf, name: msg.senderName, isHost: msg.isHost, messages: [msg] });
    } else {
      groups[groups.length - 1].messages.push(msg);
    }
  });

  return (
    <div className="chat-panel-v2">
      <div className="chat-messages-v2">
        <div className="chat-date-stamp">
          <span>Hôm nay</span>
        </div>

        {groups.map((g, gi) => {
          if (g.type === 'system') {
            return <div key={gi} className="chat-system-msg">{g.msg.text}</div>;
          }
          return (
            <div key={gi} className={`chat-group${g.isSelf ? ' self' : ''}`}>
              {/* Avatar column (non-self only) */}
              {!g.isSelf && (
                <div className="chat-avatar-col">
                  <Avatar name={g.name} size="sm" />
                </div>
              )}
              <div className="chat-bubbles">
                {!g.isSelf && (
                  <div className="chat-sender-name">{g.name}</div>
                )}
                {g.messages.map((msg, mi) => {
                  const isLast = mi === g.messages.length - 1;
                  return (
                    <div key={msg.timestamp ?? mi}>
                      <div className={`chat-bubble ${g.isSelf ? 'self' : 'other'}${isLast ? ' last' : ''}`}>
                        {msg.message}
                      </div>
                      {isLast && (
                        <div className="chat-bubble-time">
                          {new Date(msg.timestamp).toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' })}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })}
        <div ref={bottomRef} />
      </div>

      <div className="chat-input-v2">
        <div className="chat-input-pill">
          <input
            value={input}
            onChange={e => setInput(e.target.value)}
            onKeyDown={handleKey}
            placeholder="Nhắn tin…"
            maxLength={500}
            autoComplete="off"
          />
          <div className="chat-emoji-picks">
            {QUICK_EMOJIS.map(e => (
              <button key={e} className="chat-emoji-pick" onClick={() => setInput(i => i + e)}>{e}</button>
            ))}
          </div>
          <button
            onClick={send}
            disabled={!input.trim()}
            className={`chat-send-btn ${input.trim() ? 'active' : 'inactive'}`}
            aria-label="Gửi"
          >
            ▶
          </button>
        </div>
      </div>
    </div>
  );
}
