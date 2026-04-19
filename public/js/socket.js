/**
 * JAMSC - Socket.IO Client Wrapper
 * Handles connection, reconnection, and event management
 */

const SocketClient = (() => {
  let socket = null;
  let isConnected = false;

  /**
   * Initialize socket connection
   */
  function connect() {
    if (socket && socket.connected) return socket;

    socket = io({
      transports: ['polling'],    // Polling only — Vercel doesn't support WebSocket
      reconnection: true,
      reconnectionAttempts: Infinity,
      reconnectionDelay: 1000,
      reconnectionDelayMax: 10000,
      timeout: 30000,             // 30s connection timeout
      forceNew: false,
    });

    socket.on('connect', () => {
      isConnected = true;
      updateConnectionStatus(true);
      console.log('[Socket] Connected:', socket.id);
    });

    socket.on('disconnect', (reason) => {
      isConnected = false;
      updateConnectionStatus(false);
      console.log('[Socket] Disconnected:', reason);
    });

    socket.on('reconnect', (attemptNumber) => {
      isConnected = true;
      updateConnectionStatus(true);
      console.log('[Socket] Reconnected after', attemptNumber, 'attempts');
      UI.showToast('Đã kết nối lại!', 'success');

      // Re-sync state after reconnect
      if (typeof App !== 'undefined' && App.onReconnect) {
        App.onReconnect();
      }
    });

    socket.on('reconnect_failed', () => {
      UI.showToast('Mất kết nối. Vui lòng tải lại trang.', 'error', 10000);
    });

    return socket;
  }

  /**
   * Update connection status indicator
   */
  function updateConnectionStatus(connected) {
    const statusEl = document.getElementById('connection-status');
    if (!statusEl) return;

    const textEl = statusEl.querySelector('.status-text');
    if (connected) {
      statusEl.classList.remove('disconnected');
      textEl.textContent = 'Đã kết nối';
    } else {
      statusEl.classList.add('disconnected');
      textEl.textContent = 'Mất kết nối';
    }
  }

  /**
   * Emit event with callback (promise-based)
   */
  function emit(event, data = {}) {
    return new Promise((resolve, reject) => {
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
  }

  /**
   * Listen for an event
   */
  function on(event, handler) {
    if (socket) {
      socket.on(event, handler);
    }
  }

  /**
   * Remove event listener
   */
  function off(event, handler) {
    if (socket) {
      socket.off(event, handler);
    }
  }

  /**
   * Get socket instance
   */
  function getSocket() {
    return socket;
  }

  /**
   * Get socket ID
   */
  function getId() {
    return socket ? socket.id : null;
  }

  /**
   * Check if connected
   */
  function connected() {
    return isConnected;
  }

  return {
    connect,
    emit,
    on,
    off,
    getSocket,
    getId,
    connected,
  };
})();
