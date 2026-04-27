import { useEffect, useRef } from 'react';
import { useApp } from './context/AppContext';
import { useSocket } from './hooks/useSocket';
import ParticlesCanvas from './components/ParticlesCanvas';
import ToastContainer from './components/Toast';
import LandingView from './components/LandingView';
import CreateRoomView from './components/CreateRoomView';
import JoinRoomView from './components/JoinRoomView';
import RoomView from './components/room/RoomView';
import CreateShareView from './components/CreateShareView';

const NAME_KEY = 'jamsc-username';
const SESSION_KEY = 'jamsc-session';

function getTabId() {
  let id = sessionStorage.getItem('jamsc-tab-id');
  if (!id) {
    id = Math.random().toString(36).slice(2, 10);
    sessionStorage.setItem('jamsc-tab-id', id);
  }
  return id;
}

const TABID = getTabId();

export default function App() {
  const { state, dispatch, showToast } = useApp();
  const { view } = state;
  const socket = useSocket();
  const bcRef = useRef(null);

  const initialRoomCode = new URLSearchParams(window.location.search).get('room')?.toUpperCase() ?? '';

  useEffect(() => {
    if (initialRoomCode && view === 'landing') {
      dispatch({ type: 'SET_VIEW', view: 'join' });
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Cross-tab session coordination
  useEffect(() => {
    if (!window.BroadcastChannel) return;
    const bc = new BroadcastChannel('jamsc');
    bcRef.current = bc;

    bc.onmessage = ({ data }) => {
      if (!data || data.fromTabId === TABID) return;
      if (data.type === 'session-kick') {
        const s = socket.getSocket();
        if (s?.connected) {
          s.emit('room:leave');
          s.disconnect();
          setTimeout(() => s.connect(), 500);
        }
        localStorage.removeItem(SESSION_KEY);
        dispatch({ type: 'LEAVE_ROOM' });
        history.pushState(null, '', '/');
        showToast('Đã bị đá ra vì phòng được mở từ tab khác', 'warning');
      }
    };

    return () => { bc.close(); bcRef.current = null; };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  async function claimSession() {
    try {
      const raw = localStorage.getItem(SESSION_KEY);
      if (!raw) return true;
      const session = JSON.parse(raw);
      if (session.tabId === TABID) return true;
      const ok = window.confirm(
        `Bạn đang ở phòng ${session.roomCode} từ tab khác.\nTiếp tục sẽ đá tab đó ra.`
      );
      if (!ok) return false;
      bcRef.current?.postMessage({ type: 'session-kick', fromTabId: TABID });
      localStorage.removeItem(SESSION_KEY);
      await new Promise((r) => setTimeout(r, 150));
      return true;
    } catch {
      return true;
    }
  }

  function saveSession(roomCode, name) {
    localStorage.setItem(NAME_KEY, name);
    localStorage.setItem(SESSION_KEY, JSON.stringify({ tabId: TABID, roomCode }));
  }

  async function handleCreateRoom(hostName) {
    if (!await claimSession()) return;
    try {
      const res = await socket.emit('room:create', { hostName });
      if (res.success) {
        saveSession(res.room.id, hostName);
        dispatch({ type: 'SET_ROOM', room: res.room });
        dispatch({ type: 'SET_QUEUE', queue: { tracks: [], currentIndex: -1 } });
        history.pushState(null, '', '?room=' + res.room.id);
        dispatch({ type: 'SET_VIEW', view: 'create-share' });
        showToast(`Phòng ${res.room.id} đã được tạo!`, 'success');
      }
    } catch (err) {
      showToast(err.message, 'error');
    }
  }

  async function handleJoinRoom(code, memberName) {
    if (!await claimSession()) return;
    try {
      const res = await socket.emit('room:join', { roomCode: code, memberName });
      if (res.success) {
        saveSession(code, memberName);
        dispatch({ type: 'SET_ROOM', room: res.room });
        if (res.queue) dispatch({ type: 'SET_QUEUE', queue: res.queue });
        if (res.playback?.currentTrack) {
          dispatch({ type: 'SET_PENDING_PLAYBACK', playback: { ...res.playback, _receivedAt: Date.now() } });
        }
        history.pushState(null, '', '?room=' + res.room.id);
        dispatch({ type: 'SET_VIEW', view: 'room' });
        showToast(`Đã tham gia phòng ${code}!`, 'success');
      }
    } catch (err) {
      showToast(err.message, 'error');
    }
  }

  return (
    <>
      <ParticlesCanvas />
      <ToastContainer />

      {view === 'landing' && <LandingView />}
      {view === 'create' && <CreateRoomView onCreateRoom={handleCreateRoom} />}
      {view === 'create-share' && <CreateShareView onEnterRoom={() => dispatch({ type: 'SET_VIEW', view: 'room' })} />}
      {view === 'join' && <JoinRoomView onJoinRoom={handleJoinRoom} initialCode={initialRoomCode} />}
      {view === 'room' && <RoomView socket={socket} />}
    </>
  );
}
