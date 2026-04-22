import { useState, useEffect, useRef } from 'react';
import { useApp } from '../../context/AppContext';

export default function ChatPanel({ onSendMessage }) {
  const { state } = useApp();
  const { chatMessages } = state;
  const [input, setInput] = useState('');
  const bottomRef = useRef(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [chatMessages]);

  function handleSubmit(e) {
    e.preventDefault();
    const msg = input.trim();
    if (!msg) return;
    onSendMessage(msg);
    setInput('');
  }

  return (
    <div className="chat-panel glass-card">
      <div className="panel-header">
        <h3>
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z"/>
          </svg>
          Chat
        </h3>
      </div>
      <div className="chat-messages">
        {chatMessages.map((msg, i) => (
          msg.system ? (
            <div key={i} className="chat-msg-system">{msg.text}</div>
          ) : (
            <div key={i} className="chat-msg">
              <span className={`chat-msg-name${msg.isHost ? ' host' : ''}`}>{msg.senderName}:</span>
              <span className="chat-msg-text">{msg.message}</span>
            </div>
          )
        ))}
        <div ref={bottomRef} />
      </div>
      <form className="chat-input-form" onSubmit={handleSubmit}>
        <input
          type="text"
          placeholder="Nhắn tin..."
          maxLength={500}
          autoComplete="off"
          value={input}
          onChange={(e) => setInput(e.target.value)}
        />
        <button type="submit" className="btn-icon btn-send">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
            <path d="M2.01 21L23 12 2.01 3 2 10l15 2-15 2z"/>
          </svg>
        </button>
      </form>
    </div>
  );
}
