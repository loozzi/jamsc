import { useEffect } from 'react';
import { useApp } from './context/AppContext';
import { useSocket } from './hooks/useSocket';
import ParticlesCanvas from './components/ParticlesCanvas';
import ToastContainer from './components/Toast';
import LandingView from './components/LandingView';
import CreateRoomView from './components/CreateRoomView';
import JoinRoomView from './components/JoinRoomView';
import RoomView from './components/room/RoomView';

export default function App() {
  const { state, dispatch, showToast } = useApp();
  const { view } = state;
  const socket = useSocket();

  // Auto-fill room code from URL ?room=XXX
  const initialRoomCode = new URLSearchParams(window.location.search).get('room')?.toUpperCase() ?? '';

  // Navigate to join view if URL has ?room=
  useEffect(() => {
    if (initialRoomCode && view === 'landing') {
      dispatch({ type: 'SET_VIEW', view: 'join' });
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  async function handleCreateRoom(hostName) {
    try {
      const res = await socket.emit('room:create', { hostName });
      if (res.success) {
        dispatch({ type: 'SET_ROOM', room: res.room });
        dispatch({ type: 'SET_QUEUE', queue: { tracks: [], currentIndex: -1 } });
        history.pushState(null, '', '?room=' + res.room.id);
        dispatch({ type: 'SET_VIEW', view: 'room' });
        showToast(`Phòng ${res.room.id} đã được tạo!`, 'success');
      }
    } catch (err) {
      showToast(err.message, 'error');
    }
  }

  async function handleJoinRoom(code, memberName) {
    try {
      const res = await socket.emit('room:join', { roomCode: code, memberName });
      if (res.success) {
        dispatch({ type: 'SET_ROOM', room: res.room });
        if (res.queue) dispatch({ type: 'SET_QUEUE', queue: res.queue });
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
      {view === 'join' && <JoinRoomView onJoinRoom={handleJoinRoom} initialCode={initialRoomCode} />}
      {view === 'room' && <RoomView socket={socket} />}
    </>
  );
}
