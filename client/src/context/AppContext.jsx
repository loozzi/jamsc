import { createContext, useContext, useReducer, useCallback } from 'react';

const AppContext = createContext(null);

const initialState = {
  view: 'landing', // 'landing' | 'create' | 'join' | 'room'
  room: null,
  isHost: false,
  mySocketId: null,
  queue: { tracks: [], currentIndex: -1 },
  playback: { isPlaying: false, currentTime: 0, currentTrack: null },
  pendingPlayback: null, // playback state received on join, applied once RoomView mounts
  chatMessages: [],
  toasts: [],
  connected: false,
};

function reducer(state, action) {
  switch (action.type) {
    case 'SET_VIEW':
      return { ...state, view: action.view };

    case 'SET_ROOM':
      return {
        ...state,
        room: action.room,
        isHost: action.room.hostId === state.mySocketId,
      };

    case 'SET_MY_SOCKET_ID':
      return {
        ...state,
        mySocketId: action.id,
        isHost: state.room ? state.room.hostId === action.id : false,
      };

    case 'LEAVE_ROOM':
      return {
        ...state,
        room: null,
        isHost: false,
        queue: { tracks: [], currentIndex: -1 },
        playback: { isPlaying: false, currentTime: 0, currentTrack: null },
        chatMessages: [],
        view: 'landing',
      };

    case 'ADD_MEMBER':
      if (!state.room) return state;
      return {
        ...state,
        room: { ...state.room, members: [...state.room.members, action.member] },
      };

    case 'REMOVE_MEMBER':
      if (!state.room) return state;
      return {
        ...state,
        room: { ...state.room, members: state.room.members.filter((m) => m.id !== action.memberId) },
      };

    case 'TRANSFER_HOST': {
      if (!state.room) return state;
      const updatedMembers = state.room.members.map((m) => ({
        ...m,
        isHost: m.id === action.newHostId,
      }));
      return {
        ...state,
        isHost: action.newHostId === state.mySocketId,
        room: {
          ...state.room,
          hostId: action.newHostId,
          hostName: action.newHostName,
          members: updatedMembers,
        },
      };
    }

    case 'APPLY_SETTINGS':
      if (!state.room) return state;
      return {
        ...state,
        room: { ...state.room, settings: { ...state.room.settings, ...action.settings } },
      };

    case 'SET_QUEUE':
      return { ...state, queue: action.queue };

    case 'ADD_TRACK':
      return {
        ...state,
        queue: { ...state.queue, tracks: [...state.queue.tracks, action.track] },
      };

    case 'ADD_BATCH':
      return {
        ...state,
        queue: { ...state.queue, tracks: [...state.queue.tracks, ...action.tracks] },
      };

    case 'REMOVE_TRACK': {
      const idx = state.queue.tracks.findIndex((t) => t.id === action.trackId);
      if (idx === -1) return state;
      const newTracks = state.queue.tracks.filter((t) => t.id !== action.trackId);
      let newIndex = state.queue.currentIndex;
      if (idx < newIndex) newIndex--;
      else if (idx === newIndex && newTracks.length === 0) newIndex = -1;
      else if (idx === newIndex && newIndex >= newTracks.length) newIndex = newTracks.length - 1;
      return { ...state, queue: { tracks: newTracks, currentIndex: newIndex } };
    }

    case 'SET_CURRENT_INDEX':
      return { ...state, queue: { ...state.queue, currentIndex: action.index } };

    case 'UPDATE_TRACK_TITLE': {
      const tracks = state.queue.tracks.map((t) =>
        t.id === action.trackId ? { ...t, title: action.title } : t
      );
      return { ...state, queue: { ...state.queue, tracks } };
    }

    case 'SET_PLAYBACK':
      return { ...state, playback: { ...state.playback, ...action.playback } };

    case 'SET_PENDING_PLAYBACK':
      return { ...state, pendingPlayback: action.playback };

    case 'ADD_CHAT_MESSAGE':
      return { ...state, chatMessages: [...state.chatMessages, action.message] };

    case 'CLEAR_CHAT':
      return { ...state, chatMessages: [] };

    case 'ADD_TOAST':
      return { ...state, toasts: [...state.toasts, action.toast] };

    case 'REMOVE_TOAST':
      return { ...state, toasts: state.toasts.filter((t) => t.id !== action.id) };

    case 'SET_CONNECTED':
      return { ...state, connected: action.connected };

    default:
      return state;
  }
}

let toastId = 0;

export function AppProvider({ children }) {
  const [state, dispatch] = useReducer(reducer, initialState);

  const showToast = useCallback((message, type = 'info', duration = 4000) => {
    const id = ++toastId;
    dispatch({ type: 'ADD_TOAST', toast: { id, message, type, duration } });
    setTimeout(() => dispatch({ type: 'REMOVE_TOAST', id }), duration + 300);
  }, []);

  return (
    <AppContext.Provider value={{ state, dispatch, showToast }}>
      {children}
    </AppContext.Provider>
  );
}

export function useApp() {
  return useContext(AppContext);
}
