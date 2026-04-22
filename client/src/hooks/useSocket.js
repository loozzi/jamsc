import { useEffect, useRef, useCallback } from 'react';
import { io } from 'socket.io-client';
import { useApp } from '../context/AppContext';

const BACKEND_URL = import.meta.env.VITE_BACKEND_URL || '';

export function useSocket() {
  const { dispatch, showToast } = useApp();
  const socketRef = useRef(null);

  useEffect(() => {
    const socket = io(BACKEND_URL, {
      transports: ['websocket', 'polling'],
      reconnection: true,
      reconnectionAttempts: Infinity,
      reconnectionDelay: 1000,
      reconnectionDelayMax: 10000,
      timeout: 30000,
      forceNew: false,
    });

    socketRef.current = socket;

    socket.on('connect', () => {
      dispatch({ type: 'SET_MY_SOCKET_ID', id: socket.id });
      dispatch({ type: 'SET_CONNECTED', connected: true });
    });

    socket.on('disconnect', () => {
      dispatch({ type: 'SET_CONNECTED', connected: false });
    });

    socket.on('reconnect', () => {
      dispatch({ type: 'SET_MY_SOCKET_ID', id: socket.id });
      dispatch({ type: 'SET_CONNECTED', connected: true });
      showToast('Đã kết nối lại!', 'success');
    });

    socket.on('reconnect_failed', () => {
      showToast('Mất kết nối. Vui lòng tải lại trang.', 'error', 10000);
    });

    return () => {
      socket.disconnect();
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const emit = useCallback((event, data = {}) => {
    return new Promise((resolve, reject) => {
      const socket = socketRef.current;
      if (!socket || !socket.connected) {
        reject(new Error('Chưa kết nối tới server'));
        return;
      }
      socket.emit(event, data, (response) => {
        if (response && response.success === false) {
          reject(new Error(response.error || 'Có lỗi xảy ra'));
        } else {
          resolve(response);
        }
      });
    });
  }, []);

  const on = useCallback((event, handler) => {
    socketRef.current?.on(event, handler);
  }, []);

  const off = useCallback((event, handler) => {
    socketRef.current?.off(event, handler);
  }, []);

  const getSocket = useCallback(() => socketRef.current, []);

  const getId = useCallback(() => socketRef.current?.id ?? null, []);

  return { emit, on, off, getSocket, getId };
}
