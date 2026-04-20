/**
 * JAMSC - Room UI Module
 * Manages room state, members list, and settings
 */

const Room = (() => {
  let currentRoom = null;
  let isHost = false;
  let mySocketId = null;

  /**
   * Set current room data
   */
  function setRoom(room) {
    currentRoom = room;
    mySocketId = SocketClient.getId();
    isHost = room.hostId === mySocketId;

    updateRoomDisplay();
    renderMembers();
    updateHostUI();
    updateSettings();
  }

  /**
   * Update room code display
   */
  function updateRoomDisplay() {
    const codeEl = document.getElementById('display-room-code');
    if (codeEl && currentRoom) {
      codeEl.textContent = currentRoom.id;
    }
  }

  /**
   * Render members list
   */
  function renderMembers() {
    const listEl = document.getElementById('members-list');
    const countEl = document.getElementById('member-count');
    if (!listEl || !currentRoom) return;

    const members = currentRoom.members || [];
    countEl.textContent = members.length;

    listEl.innerHTML = members.map((member) => {
      const color = UI.getAvatarColor(member.name);
      const initial = UI.getInitials(member.name);
      const badges = [];

      if (member.isHost) {
        badges.push('<span class="member-badge host">Host</span>');
      }
      if (member.id === mySocketId) {
        badges.push('<span class="member-badge you">Bạn</span>');
      }

      return `
        <div class="member-item">
          <div class="member-avatar" style="background: ${color}30; color: ${color};">${initial}</div>
          <span class="member-name">${escapeHtml(member.name)}</span>
          ${badges.join('')}
        </div>
      `;
    }).join('');
  }

  /**
   * Add a new member
   */
  function addMember(member) {
    if (!currentRoom) return;
    currentRoom.members.push(member);
    renderMembers();
  }

  /**
   * Remove a member
   */
  function removeMember(memberId) {
    if (!currentRoom) return;
    currentRoom.members = currentRoom.members.filter((m) => m.id !== memberId);
    renderMembers();
  }

  /**
   * Transfer host
   */
  function transferHost(newHostId, newHostName) {
    if (!currentRoom) return;
    currentRoom.hostId = newHostId;
    currentRoom.hostName = newHostName;

    // Update member flags
    currentRoom.members.forEach((m) => {
      m.isHost = m.id === newHostId;
    });

    mySocketId = SocketClient.getId();
    isHost = newHostId === mySocketId;

    renderMembers();
    updateHostUI();

    if (isHost) {
      UI.showToast('Bạn đã trở thành Host!', 'info');
      // Re-render queue so drag handles appear for the new host
      if (typeof Queue !== 'undefined') Queue.render();
    }
  }

  /**
   * Update UI based on host status
   */
  function updateHostUI() {
    const roomView = document.getElementById('view-room');
    if (!roomView) return;

    if (isHost) {
      roomView.classList.add('is-host');
    } else {
      roomView.classList.remove('is-host');
    }

    // Show/hide settings button
    const settingsBtn = document.getElementById('btn-settings');
    if (settingsBtn) {
      settingsBtn.style.display = isHost ? '' : 'none';
    }

    // Update player controls based on host/permissions
    updateControlPermissions();
  }

  /**
   * Update control permissions
   */
  function updateControlPermissions() {
    const btnPlay = document.getElementById('btn-play');
    const btnNext = document.getElementById('btn-next');
    const progressBar = document.getElementById('progress-bar');

    if (btnPlay) btnPlay.classList.remove('disabled');

    const canSkip = isHost || (currentRoom && currentRoom.settings.allowSkip);
    if (btnNext) {
      if (canSkip) {
        btnNext.classList.remove('disabled');
      } else {
        btnNext.classList.add('disabled');
      }
    }

    if (progressBar) {
      if (isHost) {
        progressBar.classList.remove('disabled');
      } else {
        progressBar.classList.add('disabled');
      }
    }
  }

  /**
   * Update settings UI
   */
  function updateSettings() {
    if (!currentRoom) return;

    const skipToggle = document.getElementById('setting-allow-skip');
    if (skipToggle) skipToggle.checked = !!currentRoom.settings.allowSkip;

    updateControlPermissions();
  }

  /**
   * Apply new settings
   */
  function applySettings(settings) {
    if (!currentRoom) return;
    currentRoom.settings = { ...currentRoom.settings, ...settings };
    updateSettings();
  }

  /**
   * Get if current user is host
   */
  function getIsHost() {
    return isHost;
  }

  /**
   * Get current room
   */
  function getRoom() {
    return currentRoom;
  }

  /**
   * Escape HTML
   */
  function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }

  return {
    setRoom,
    addMember,
    removeMember,
    transferHost,
    updateHostUI,
    updateControlPermissions,
    applySettings,
    getIsHost,
    getRoom,
    renderMembers,
  };
})();
