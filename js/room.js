/**
 * VVA Meet - Meeting Room Coordinator
 * Ties together Socket.io, WebRTCManager, UI grid, floating dock, and chat persistence.
 */

(function () {
  // Parse Room ID from search param or URL path: /room/:roomId or room.php?room=...
  function getRoomIdFromUrl() {
    const params = new URLSearchParams(window.location.search);
    if (params.get('room')) {
      return decodeURIComponent(params.get('room'));
    }
    const pathParts = window.location.pathname.split('/').filter(Boolean);
    const roomIdx = pathParts.indexOf('room');
    if (roomIdx !== -1 && pathParts.length > roomIdx + 1) {
      return decodeURIComponent(pathParts[roomIdx + 1]);
    }
    if (pathParts.length >= 2 && pathParts[0] === 'room') {
      return decodeURIComponent(pathParts[1]);
    }
    return 'default-room';
  }

  const roomId = getRoomIdFromUrl();
  let username = localStorage.getItem('meet_username');
  let userId = localStorage.getItem('meet_user_id');

  if (!userId) {
    userId = `user_${Math.random().toString(36).substring(2, 9)}`;
    localStorage.setItem('meet_user_id', userId);
  }

  // If user navigated directly to /room/xyz without entering name
  if (!username) {
    username = prompt('Please enter your display name to join:') || `User_${Math.floor(Math.random() * 1000)}`;
    localStorage.setItem('meet_username', username);
  }

  // Initial media preferences from lobby
  const prefAudioMuted = sessionStorage.getItem('meet_pref_audio_muted') === 'true';
  const prefVideoOff = sessionStorage.getItem('meet_pref_video_off') === 'true';

  // DOM Elements
  const roomNameText = document.getElementById('roomNameText');
  const roomTitleBadge = document.getElementById('roomTitleBadge');
  const timerDisplay = document.getElementById('timerDisplay');
  const connectionText = document.getElementById('connectionText');
  const jitsiContainer = document.getElementById('jitsiContainer');
  const videoGrid = document.getElementById('videoGrid');
  const videoGridWrapper = document.getElementById('videoGridWrapper');
  const localVideoTile = document.getElementById('localVideoTile');
  const localVideo = document.getElementById('localVideo');
  const localVideoOffPlaceholder = document.getElementById('localVideoOffPlaceholder');
  const localAvatarCircle = document.getElementById('localAvatarCircle');
  const localNameLabel = document.getElementById('localNameLabel');
  const localMicBadge = document.getElementById('localMicBadge');

  // Control Dock Buttons
  const btnToggleMic = document.getElementById('btnToggleMic');
  const btnToggleCam = document.getElementById('btnToggleCam');
  const btnToggleScreen = document.getElementById('btnToggleScreen');
  const btnToggleReactions = document.getElementById('btnToggleReactions');
  const btnToggleChat = document.getElementById('btnToggleChat');
  const btnToggleParticipants = document.getElementById('btnToggleParticipants');
  const btnCopyInvite = document.getElementById('btnCopyInvite');
  const btnLeaveRoom = document.getElementById('btnLeaveRoom');
  const unreadBadge = document.getElementById('unreadBadge');
  const reactionsPopover = document.getElementById('reactionsPopover');
  const reactionsContainer = document.getElementById('reactionsContainer');

  // Icons
  const iconRoomMicOn = document.getElementById('iconRoomMicOn');
  const iconRoomMicOff = document.getElementById('iconRoomMicOff');
  const iconRoomCamOn = document.getElementById('iconRoomCamOn');
  const iconRoomCamOff = document.getElementById('iconRoomCamOff');

  // Side Drawer
  const sideDrawer = document.getElementById('sideDrawer');
  const btnCloseDrawer = document.getElementById('btnCloseDrawer');
  const tabChat = document.getElementById('tabChat');
  const tabParticipants = document.getElementById('tabParticipants');
  const chatPanel = document.getElementById('chatPanel');
  const participantsPanel = document.getElementById('participantsPanel');
  const drawerParticipantCount = document.getElementById('drawerParticipantCount');
  const chatMessages = document.getElementById('chatMessages');
  const chatForm = document.getElementById('chatForm');
  const chatInput = document.getElementById('chatInput');
  const participantsList = document.getElementById('participantsList');
  const btnInviteFromPanel = document.getElementById('btnInviteFromPanel');

  // Shortcuts Modal
  const shortcutsModal = document.getElementById('shortcutsModal');
  const btnHeaderShortcuts = document.getElementById('btnHeaderShortcuts');
  const btnCloseShortcuts = document.getElementById('btnCloseShortcuts');
  const toastContainer = document.getElementById('toastContainer');
  const btnToggleEngine = document.getElementById('btnToggleEngine');
  const engineBadgeText = document.getElementById('engineBadgeText');

  // Passcode Elements
  const roomPasscodeBadge = document.getElementById('roomPasscodeBadge');
  const roomPasscodeText = document.getElementById('roomPasscodeText');
  const passcodePromptModal = document.getElementById('passcodePromptModal');
  const passcodePromptForm = document.getElementById('passcodePromptForm');
  const promptUsernameInput = document.getElementById('promptUsernameInput');
  const promptPasscodeInput = document.getElementById('promptPasscodeInput');
  const passcodePromptError = document.getElementById('passcodePromptError');

  function getPasscodeFromUrl() {
    const params = new URLSearchParams(window.location.search);
    return params.get('passcode') || sessionStorage.getItem('meet_passcode_' + roomId) || '';
  }
  let currentPasscode = getPasscodeFromUrl();

  // State
  let socket = null;
  let webrtc = null;
  let jitsiApi = null;
  let myPeerId = null;
  let activePeersMap = new Map(); // peerId -> { username, userId, audioMuted, videoOff, isScreenSharing }
  let unreadCount = 0;
  let isChatOpen = false;
  let pinnedPeerId = null;
  let callStartTime = Date.now();

  // Setup UI basics
  roomNameText.textContent = roomId;
  localNameLabel.textContent = `${username} (You)`;
  localAvatarCircle.textContent = username.charAt(0).toUpperCase();

  function displayPasscodeBadge(code) {
    if (roomPasscodeBadge && code) {
      roomPasscodeBadge.style.display = 'inline-flex';
      if (roomPasscodeText) roomPasscodeText.textContent = `Passcode: ${code}`;
      roomPasscodeBadge.onclick = async () => {
        try {
          await navigator.clipboard.writeText(code);
          showToast(`Passcode "${code}" copied to clipboard!`, 'success');
        } catch (e) {
          showToast(`Meeting Passcode: ${code}`, 'info');
        }
      };
    }
  }

  if (currentPasscode) {
    displayPasscodeBadge(currentPasscode);
  }

  function showPasscodeModal(errorMessage) {
    if (passcodePromptModal) {
      passcodePromptModal.style.display = 'flex';
      if (promptUsernameInput && username) promptUsernameInput.value = username;
      if (promptPasscodeInput && currentPasscode) promptPasscodeInput.value = currentPasscode;
      if (errorMessage && passcodePromptError) {
        passcodePromptError.textContent = errorMessage;
        passcodePromptError.style.display = 'block';
      }
    }
  }

  function hidePasscodeModal() {
    if (passcodePromptModal) {
      passcodePromptModal.style.display = 'none';
    }
  }

  if (passcodePromptForm) {
    passcodePromptForm.addEventListener('submit', (e) => {
      e.preventDefault();
      const enteredName = promptUsernameInput.value.trim();
      const enteredCode = promptPasscodeInput.value.trim();

      if (!enteredName || !enteredCode) return;

      username = enteredName;
      currentPasscode = enteredCode;
      localStorage.setItem('meet_username', enteredName);
      sessionStorage.setItem('meet_passcode_' + roomId, enteredCode);
      localNameLabel.textContent = `${username} (You)`;
      localAvatarCircle.textContent = username.charAt(0).toUpperCase();

      hidePasscodeModal();

      if (socket) {
        socket.emit('join-room', {
          roomId,
          username,
          userId,
          passcode: currentPasscode,
          audioMuted: prefAudioMuted,
          videoOff: prefVideoOff
        }, (res) => {
          if (!res || !res.success) {
            showPasscodeModal(res?.error || 'Invalid passcode entered');
          } else {
            showToast('Passcode verified! Connected to meeting.', 'success');
            if (res.hasPasscode) displayPasscodeBadge(currentPasscode);
          }
        });
      }
    });
  }

  function showToast(message, type = 'info') {
    const toast = document.createElement('div');
    toast.className = `toast toast-${type}`;
    toast.textContent = message;
    toastContainer.appendChild(toast);

    setTimeout(() => {
      toast.style.opacity = '0';
      toast.style.transform = 'translateX(100%)';
      setTimeout(() => toast.remove(), 300);
    }, 3200);
  }

  // Meeting duration timer
  function startMeetingTimer() {
    setInterval(() => {
      const elapsed = Math.floor((Date.now() - callStartTime) / 1000);
      const hours = Math.floor(elapsed / 3600).toString().padStart(2, '0');
      const mins = Math.floor((elapsed % 3600) / 60).toString().padStart(2, '0');
      const secs = (elapsed % 60).toString().padStart(2, '0');
      timerDisplay.textContent = `${hours}:${mins}:${secs}`;
    }, 1000);
  }

  // Recalculate dynamic video grid layout classes
  function recalculateGridLayout() {
    const tiles = videoGrid.querySelectorAll('.video-tile');
    const count = tiles.length;

    // Reset grid layout classes
    videoGrid.className = 'video-grid';

    if (pinnedPeerId) {
      videoGrid.classList.add('grid-spotlight');
      tiles.forEach((tile) => {
        const id = tile.getAttribute('data-peer-id');
        if (id === pinnedPeerId) {
          tile.classList.add('pinned');
        } else {
          tile.classList.remove('pinned');
        }
      });
      return;
    }

    // Apply auto responsive classes based on count
    if (count <= 1) {
      videoGrid.classList.add('grid-1');
    } else if (count === 2) {
      videoGrid.classList.add('grid-2');
    } else if (count === 3) {
      videoGrid.classList.add('grid-3');
    } else if (count === 4) {
      videoGrid.classList.add('grid-4');
    } else if (count <= 6) {
      videoGrid.classList.add('grid-5');
    } else {
      videoGrid.classList.add('grid-many');
    }
  }

  // Create remote participant video tile
  function createRemoteVideoTile(peerId, peerUsername) {
    if (document.getElementById(`tile_${peerId}`)) return;

    const tile = document.createElement('div');
    tile.id = `tile_${peerId}`;
    tile.className = 'video-tile';
    tile.setAttribute('data-peer-id', peerId);

    const video = document.createElement('video');
    video.id = `video_${peerId}`;
    video.autoplay = true;
    video.playsInline = true;

    // Video off placeholder
    const placeholder = document.createElement('div');
    placeholder.id = `placeholder_${peerId}`;
    placeholder.className = 'video-off-placeholder';
    placeholder.style.display = 'none';

    const avatar = document.createElement('div');
    avatar.className = 'tile-avatar';
    avatar.textContent = (peerUsername || 'U').charAt(0).toUpperCase();

    const placeholderLabel = document.createElement('span');
    placeholderLabel.style.fontSize = '0.85rem';
    placeholderLabel.style.color = 'var(--text-muted)';
    placeholderLabel.textContent = 'Camera off';

    placeholder.appendChild(avatar);
    placeholder.appendChild(placeholderLabel);

    // Bottom overlay
    const overlayBottom = document.createElement('div');
    overlayBottom.className = 'tile-overlay-bottom';

    const label = document.createElement('div');
    label.className = 'participant-label';

    const nameSpan = document.createElement('span');
    nameSpan.textContent = peerUsername || 'Participant';

    const micBadge = document.createElement('span');
    micBadge.id = `micBadge_${peerId}`;
    micBadge.className = 'mic-badge muted';
    micBadge.style.display = 'none';
    micBadge.innerHTML = `
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <line x1="1" y1="1" x2="23" y2="23"></line>
        <path d="M9 9v3a3 3 0 0 0 5.12 2.12M15 9.34V4a3 3 0 0 0-5.94-.6"></path>
        <path d="M17 16.95A7 7 0 0 1 5 12v-2m14 0v2a7 7 0 0 1-.11 1.23"></path>
        <line x1="12" y1="19" x2="12" y2="23"></line>
        <line x1="8" y1="23" x2="16" y2="23"></line>
      </svg>
    `;

    label.appendChild(nameSpan);
    label.appendChild(micBadge);
    overlayBottom.appendChild(label);

    // Top overlay (Pin button, PiP)
    const overlayTop = document.createElement('div');
    overlayTop.className = 'tile-overlay-top';

    const pinBtn = document.createElement('button');
    pinBtn.className = 'tile-action-btn';
    pinBtn.title = 'Spotlight / Pin';
    pinBtn.innerHTML = `
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"></path>
        <circle cx="12" cy="10" r="3"></circle>
      </svg>
    `;
    pinBtn.addEventListener('click', () => togglePinTile(peerId));

    const pipBtn = document.createElement('button');
    pipBtn.className = 'tile-action-btn';
    pipBtn.title = 'Picture-in-Picture';
    pipBtn.innerHTML = `
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <rect x="2" y="3" width="20" height="14" rx="2" ry="2"></rect>
        <rect x="12" y="9" width="8" height="6" rx="1" ry="1"></rect>
      </svg>
    `;
    pipBtn.addEventListener('click', async () => {
      try {
        if (document.pictureInPictureElement) {
          await document.exitPictureInPicture();
        } else if (video.requestPictureInPicture) {
          await video.requestPictureInPicture();
        }
      } catch (e) {
        console.warn('PiP error:', e);
      }
    });

    overlayTop.appendChild(pinBtn);
    overlayTop.appendChild(pipBtn);

    tile.appendChild(video);
    tile.appendChild(placeholder);
    tile.appendChild(overlayBottom);
    tile.appendChild(overlayTop);

    videoGrid.appendChild(tile);
    recalculateGridLayout();
    updateParticipantsList();
  }

  // Remove remote participant tile
  function removeRemoteVideoTile(peerId) {
    const tile = document.getElementById(`tile_${peerId}`);
    if (tile) {
      tile.remove();
    }
    if (pinnedPeerId === peerId) {
      pinnedPeerId = null;
    }
    recalculateGridLayout();
    updateParticipantsList();
  }

  // Spotlight / Pin tile handler
  function togglePinTile(peerId) {
    if (pinnedPeerId === peerId) {
      pinnedPeerId = null;
    } else {
      pinnedPeerId = peerId;
    }
    recalculateGridLayout();
  }

  // Local pin button handler
  document.querySelector('.btn-pin-tile').addEventListener('click', () => {
    togglePinTile('local');
  });

  // Active speaker indicator
  function handleActiveSpeaker(speakerId, isSpeaking) {
    const tile = speakerId === 'local' 
      ? localVideoTile 
      : document.getElementById(`tile_${speakerId}`);

    if (tile) {
      if (isSpeaking) {
        tile.classList.add('speaking');
      } else {
        tile.classList.remove('speaking');
      }
    }
  }

  // Update participants list drawer
  function updateParticipantsList() {
    participantsList.innerHTML = '';

    // Add local user
    const localItem = document.createElement('div');
    localItem.className = 'participant-item';
    localItem.innerHTML = `
      <div class="participant-info">
        <div class="p-avatar">${username.charAt(0).toUpperCase()}</div>
        <span class="p-name">${username}</span>
        <span class="p-badge">You</span>
      </div>
      <div class="p-icons">
        <span style="color: ${webrtc && webrtc.isAudioMuted ? 'var(--danger)' : 'var(--success)'}; font-size:0.8rem;">
          ${webrtc && webrtc.isAudioMuted ? 'Muted' : 'Mic On'}
        </span>
      </div>
    `;
    participantsList.appendChild(localItem);

    // Add remote peers
    activePeersMap.forEach((p, peerId) => {
      const item = document.createElement('div');
      item.className = 'participant-item';
      item.innerHTML = `
        <div class="participant-info">
          <div class="p-avatar">${(p.username || 'U').charAt(0).toUpperCase()}</div>
          <span class="p-name">${p.username}</span>
        </div>
        <div class="p-icons">
          <span style="color: ${p.audioMuted ? 'var(--danger)' : 'var(--success)'}; font-size:0.8rem;">
            ${p.audioMuted ? 'Muted' : 'Mic On'}
          </span>
        </div>
      `;
      participantsList.appendChild(item);
    });

    const totalCount = 1 + activePeersMap.size;
    drawerParticipantCount.textContent = totalCount;
  }

  // Render chat message bubble
  function renderChatMessage(msg) {
    const isMine = msg.senderName === username;
    const bubble = document.createElement('div');
    bubble.className = `chat-bubble ${isMine ? 'mine' : 'theirs'}`;

    const meta = document.createElement('div');
    meta.className = 'message-meta';

    const sender = document.createElement('span');
    sender.className = 'message-sender';
    sender.textContent = isMine ? 'You' : msg.senderName;

    const time = document.createElement('span');
    const date = new Date(msg.sentAt || Date.now());
    time.textContent = date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

    meta.appendChild(sender);
    meta.appendChild(time);

    const content = document.createElement('div');
    content.className = 'message-content';
    content.textContent = msg.messageText;

    bubble.appendChild(meta);
    bubble.appendChild(content);

    chatMessages.appendChild(bubble);
    chatMessages.scrollTop = chatMessages.scrollHeight;
  }

  // Floating Emoji Reaction Animation
  function showFloatingReaction(emoji) {
    const el = document.createElement('div');
    el.className = 'floating-reaction';
    el.textContent = emoji;

    // Randomize horizontal location near right side of screen
    const randomOffset = Math.floor(Math.random() * 220) + 40;
    el.style.right = `${randomOffset}px`;

    reactionsContainer.appendChild(el);
    setTimeout(() => el.remove(), 2500);
  }

  // Connect to Socket.io backend for SQLite chat persistence & emoji bursts
  function initSocketBackend() {
    if (socket) return;
    socket = io();

    socket.on('connect', () => {
      socket.emit('join-room', {
        roomId,
        username,
        userId,
        passcode: currentPasscode,
        audioMuted: prefAudioMuted,
        videoOff: prefVideoOff
      }, (response) => {
        if (!response || !response.success) {
          if (response?.passcodeRequired) {
            showPasscodeModal(response?.error);
          }
          return;
        }
        myPeerId = response.myPeerId;
        if (response.hasPasscode && currentPasscode) {
          displayPasscodeBadge(currentPasscode);
        }
        if (response.chatHistory && response.chatHistory.length > 0) {
          response.chatHistory.forEach((msg) => renderChatMessage(msg));
        }
      });
    });

    socket.on('chat-message', (msg) => {
      renderChatMessage(msg);
      soundFx.playMessage();
      if (!isChatOpen) {
        unreadCount++;
        unreadBadge.textContent = unreadCount > 9 ? '9+' : unreadCount;
        unreadBadge.style.display = 'flex';
      }
    });

    socket.on('peer-reaction', ({ senderName, emoji }) => {
      soundFx.playReaction();
      showFloatingReaction(emoji);
    });
  }

  // Official Jitsi Meet External API integration
  function initJitsiMeeting() {
    if (typeof window.JitsiMeetExternalAPI === 'undefined') {
      console.warn('JitsiMeetExternalAPI is unavailable. Falling back to built-in WebRTC mesh.');
      if (jitsiContainer) jitsiContainer.style.display = 'none';
      if (videoGrid) videoGrid.style.display = 'grid';
      initConference();
      return;
    }

    console.log('Mounting Jitsi Meet External API...');
    if (jitsiContainer) jitsiContainer.style.display = 'flex';
    if (videoGrid) videoGrid.style.display = 'none';
    if (engineBadgeText) engineBadgeText.textContent = 'Jitsi Mode';
    if (connectionText) {
      connectionText.textContent = 'Jitsi Connected';
      connectionText.style.color = '#34d399';
    }

    const domain = (typeof window !== 'undefined' && window.JITSI_DOMAIN) ? window.JITSI_DOMAIN : 'meet.jit.si';
    const banner = document.getElementById('jitsiNoticeBanner');
    const btnSwitch = document.getElementById('btnSwitchToUnlimited');
    if (banner && domain === 'meet.jit.si') {
      banner.style.display = 'flex';
      if (btnSwitch) {
        btnSwitch.onclick = () => {
          localStorage.setItem('meet_engine', 'webrtc');
          showToast('Switching to Unlimited Mode (No Time Limit)...', 'info');
          setTimeout(() => window.location.reload(), 400);
        };
      }
    }

    // Format room name for Jitsi
    const cleanRoom = 'VVAMeet_' + roomId.replace(/[^a-zA-Z0-9_-]/g, '');
    const userEmail = (window.LOGGED_IN_USER && window.LOGGED_IN_USER.email) ? window.LOGGED_IN_USER.email : '';

    const options = {
      roomName: cleanRoom,
      width: '100%',
      height: '100%',
      parentNode: jitsiContainer,
      userInfo: {
        displayName: username,
        email: userEmail
      },
      configOverwrite: {
        startWithAudioMuted: prefAudioMuted,
        startWithVideoMuted: prefVideoOff,
        prejoinPageEnabled: false,
        prejoinConfig: { enabled: false },
        enableWelcomePage: false,
        enableClosePage: false,
        disableDeepLinking: true,
        enableNoisyMicDetection: true,
        toolbarButtons: [
          'microphone', 'camera', 'desktop', 'fullscreen',
          'fodeviceselection', 'hangup', 'chat', 'raisehand',
          'videoquality', 'filmstrip', 'tileview', 'select-background',
          'stats', 'shortcuts', 'participants-pane', 'settings'
        ]
      },
      interfaceConfigOverwrite: {
        SHOW_JITSI_WATERMARK: false,
        SHOW_WATERMARK_FOR_GUESTS: false,
        SHOW_BRAND_WATERMARK: false,
        DEFAULT_BACKGROUND: '#090d16',
        TOOLBAR_BUTTONS: [
          'microphone', 'camera', 'desktop', 'fullscreen',
          'fodeviceselection', 'hangup', 'chat', 'raisehand',
          'videoquality', 'filmstrip', 'tileview', 'select-background',
          'stats', 'shortcuts', 'participants-pane', 'settings'
        ]
      }
    };

    try {
      jitsiApi = new JitsiMeetExternalAPI(domain, options);

      // Reflect initial preferences
      updateLocalAudioUI(prefAudioMuted);
      updateLocalVideoUI(prefVideoOff);

      // Passcode synchronization with Jitsi
      jitsiApi.addListener('videoConferenceJoined', () => {
        console.log('Joined Jitsi conference room:', cleanRoom);
        if (currentPasscode) {
          try {
            jitsiApi.executeCommand('password', currentPasscode);
            console.log('Jitsi room password locked.');
          } catch (e) {
            console.warn('Could not set Jitsi room password:', e);
          }
        }
      });

      jitsiApi.addListener('passwordRequired', () => {
        if (currentPasscode) {
          jitsiApi.executeCommand('password', currentPasscode);
        } else {
          showPasscodeModal('Please enter meeting passcode to unlock');
        }
      });

      // Event listeners to sync Jitsi states with our custom control dock
      jitsiApi.addListener('audioMuteStatusChanged', ({ muted }) => {
        updateLocalAudioUI(muted);
        if (socket) socket.emit('media-toggle', { type: 'audio', enabled: !muted });
      });

      jitsiApi.addListener('videoMuteStatusChanged', ({ muted }) => {
        updateLocalVideoUI(muted);
        if (socket) socket.emit('media-toggle', { type: 'video', enabled: !muted });
      });

      jitsiApi.addListener('screenSharingStatusChanged', ({ on }) => {
        updateLocalScreenUI(on);
        if (socket) socket.emit('media-toggle', { type: 'screen', enabled: on });
      });

      jitsiApi.addListener('participantJoined', (p) => {
        soundFx.playJoin();
        showToast(`${p.displayName || 'Participant'} joined the meeting`, 'info');
        if (p.id) {
          activePeersMap.set(p.id, {
            username: p.displayName || 'Participant',
            userId: p.id,
            audioMuted: false,
            videoOff: false,
            isScreenSharing: false
          });
          updateParticipantsList();
        }
      });

      jitsiApi.addListener('participantLeft', (p) => {
        soundFx.playLeave();
        showToast('Participant left the meeting', 'info');
        if (p.id) {
          activePeersMap.delete(p.id);
          updateParticipantsList();
        }
      });

      jitsiApi.addListener('readyToClose', () => {
        if (socket) {
          socket.emit('leave-room');
          socket.disconnect();
        }
        window.location.href = '/';
      });

      connectionText.textContent = 'Jitsi Connected';
      connectionText.style.color = '#34d399';

      // Connect to Socket.io to keep SQLite chat persistence & reactions active
      initSocketBackend();
      updateParticipantsList();
    } catch (err) {
      console.error('Error initializing Jitsi Meet API:', err);
      if (jitsiContainer) jitsiContainer.style.display = 'none';
      if (videoGrid) videoGrid.style.display = 'grid';
      initConference();
    }
  }

  // WebRTC initialization and callbacks (Unlimited Native Mesh Mode - Zero Time Limit)
  async function initConference() {
    console.log('Mounting Unlimited Native WebRTC Conference Engine (No Time Limit)...');
    const banner = document.getElementById('jitsiNoticeBanner');
    if (banner) banner.style.display = 'none';
    if (jitsiContainer) jitsiContainer.style.display = 'none';
    if (videoGrid) videoGrid.style.display = 'grid';
    if (engineBadgeText) engineBadgeText.textContent = '⚡ Unlimited Mode';
    if (connectionText) {
      connectionText.textContent = 'Unlimited (No Limit)';
      connectionText.style.color = '#34d399';
    }

    webrtc = new WebRTCManager({
      onRemoteStream: (peerId, stream) => {
        const video = document.getElementById(`video_${peerId}`);
        if (video) {
          video.srcObject = stream;
        }
      },
      onRemoteStreamRemoved: (peerId) => {
        removeRemoteVideoTile(peerId);
      },
      onActiveSpeaker: (speakerId, isSpeaking) => {
        handleActiveSpeaker(speakerId, isSpeaking);
      },
      onMediaStatusChange: (type, enabled, stream) => {
        if (type === 'audio') {
          updateLocalAudioUI(!enabled);
          if (socket) socket.emit('media-toggle', { type: 'audio', enabled });
        } else if (type === 'video') {
          updateLocalVideoUI(!enabled);
          if (socket) socket.emit('media-toggle', { type: 'video', enabled });
        } else if (type === 'screen') {
          updateLocalScreenUI(enabled, stream);
          if (socket) socket.emit('media-toggle', { type: 'screen', enabled });
        }
        updateParticipantsList();
      }
    });

    // Acquire camera & microphone
    const localStream = await webrtc.initLocalMedia({
      video: !prefVideoOff,
      audio: !prefAudioMuted
    });

    localVideo.srcObject = localStream;
    updateLocalAudioUI(prefAudioMuted);
    updateLocalVideoUI(prefVideoOff);

    // Initialize Socket.io
    socket = io();

    socket.on('connect', () => {
      connectionText.textContent = 'Connected';
      connectionText.style.color = '#34d399';

      // Join room
      socket.emit('join-room', {
        roomId,
        username,
        userId,
        passcode: currentPasscode,
        audioMuted: webrtc.isAudioMuted,
        videoOff: webrtc.isVideoOff
      }, handleJoinAck);
    });

    socket.on('disconnect', () => {
      connectionText.textContent = 'Reconnecting...';
      connectionText.style.color = '#f59e0b';
    });

    // WebRTC Signaling: Offer
    socket.on('signal:offer', async ({ callerId, offer, callerName }) => {
      createRemoteVideoTile(callerId, callerName);
      await webrtc.handleOffer(callerId, offer, socket);
    });

    // WebRTC Signaling: Answer
    socket.on('signal:answer', async ({ responderId, answer }) => {
      await webrtc.handleAnswer(responderId, answer);
    });

    // WebRTC Signaling: ICE Candidate
    socket.on('signal:ice-candidate', async ({ senderId, candidate }) => {
      await webrtc.handleIceCandidate(senderId, candidate);
    });

    // Another user joined
    socket.on('user-joined', (data) => {
      soundFx.playJoin();
      showToast(`${data.username} joined the meeting`, 'info');

      activePeersMap.set(data.peerId, {
        username: data.username,
        userId: data.userId,
        audioMuted: data.audioMuted,
        videoOff: data.videoOff,
        isScreenSharing: false
      });

      createRemoteVideoTile(data.peerId, data.username);

      // Existing participant initiates WebRTC offer to newcomer
      webrtc.createPeerConnection(data.peerId, socket, true);

      // Reflect initial mute state
      updateRemotePeerMediaUI(data.peerId, data.audioMuted, data.videoOff);
      updateParticipantsList();
    });

    // Remote peer toggled mic/video/screen
    socket.on('peer-media-toggle', ({ peerId, type, enabled, username: senderName }) => {
      const peer = activePeersMap.get(peerId);
      if (peer) {
        if (type === 'audio') peer.audioMuted = !enabled;
        if (type === 'video') peer.videoOff = !enabled;
        if (type === 'screen') peer.isScreenSharing = enabled;
      }

      if (type === 'audio') {
        const badge = document.getElementById(`micBadge_${peerId}`);
        if (badge) badge.style.display = enabled ? 'none' : 'inline-flex';
        webrtc.setPeerAudioMuted(peerId, !enabled);
      } else if (type === 'video') {
        const placeholder = document.getElementById(`placeholder_${peerId}`);
        const video = document.getElementById(`video_${peerId}`);
        if (placeholder && video) {
          placeholder.style.display = enabled ? 'none' : 'flex';
          video.style.display = enabled ? 'block' : 'none';
        }
      } else if (type === 'screen') {
        const tile = document.getElementById(`tile_${peerId}`);
        if (tile) {
          let badge = tile.querySelector('.screen-badge');
          if (enabled && !badge) {
            badge = document.createElement('div');
            badge.className = 'screen-badge';
            badge.textContent = 'Sharing Screen';
            tile.appendChild(badge);
          } else if (!enabled && badge) {
            badge.remove();
          }
        }
      }
      updateParticipantsList();
    });

    // Remote peer left
    socket.on('user-left', ({ peerId, username: leftUsername }) => {
      soundFx.playLeave();
      showToast(`${leftUsername || 'Participant'} left the meeting`, 'info');
      activePeersMap.delete(peerId);
      webrtc.closePeer(peerId);
      removeRemoteVideoTile(peerId);
    });

    // Chat message received
    socket.on('chat-message', (msg) => {
      renderChatMessage(msg);
      soundFx.playMessage();

      if (!isChatOpen) {
        unreadCount++;
        unreadBadge.textContent = unreadCount > 9 ? '9+' : unreadCount;
        unreadBadge.style.display = 'flex';
      }
    });

    // Reaction received
    socket.on('peer-reaction', ({ senderName, emoji }) => {
      soundFx.playReaction();
      showFloatingReaction(emoji);
    });
  }

  // Handle successful room join acknowledgement from server
  function handleJoinAck(response) {
    if (!response || !response.success) {
      if (response?.passcodeRequired) {
        showPasscodeModal(response?.error);
      } else {
        showToast(response?.error || 'Failed to connect to room', 'danger');
      }
      return;
    }

    myPeerId = response.myPeerId;
    if (response.hasPasscode && currentPasscode) {
      displayPasscodeBadge(currentPasscode);
    }

    // Render persistent chat history from SQLite
    if (response.chatHistory && response.chatHistory.length > 0) {
      response.chatHistory.forEach((msg) => renderChatMessage(msg));
    }

    // Connect to existing peers
    if (response.existingPeers && response.existingPeers.length > 0) {
      response.existingPeers.forEach((peer) => {
        activePeersMap.set(peer.peerId, {
          username: peer.username,
          userId: peer.userId,
          audioMuted: peer.audioMuted,
          videoOff: peer.videoOff,
          isScreenSharing: peer.isScreenSharing
        });

        createRemoteVideoTile(peer.peerId, peer.username);
        updateRemotePeerMediaUI(peer.peerId, peer.audioMuted, peer.videoOff);
      });
    }

    updateParticipantsList();
    recalculateGridLayout();
  }

  function updateRemotePeerMediaUI(peerId, audioMuted, videoOff) {
    const badge = document.getElementById(`micBadge_${peerId}`);
    if (badge) badge.style.display = audioMuted ? 'inline-flex' : 'none';

    const placeholder = document.getElementById(`placeholder_${peerId}`);
    const video = document.getElementById(`video_${peerId}`);
    if (placeholder && video) {
      placeholder.style.display = videoOff ? 'flex' : 'none';
      video.style.display = videoOff ? 'none' : 'block';
    }
  }

  // Local UI status update helpers
  function updateLocalAudioUI(isMuted) {
    if (isMuted) {
      btnToggleMic.classList.add('danger');
      iconRoomMicOn.style.display = 'none';
      iconRoomMicOff.style.display = 'block';
      localMicBadge.style.display = 'inline-flex';
    } else {
      btnToggleMic.classList.remove('danger');
      iconRoomMicOn.style.display = 'block';
      iconRoomMicOff.style.display = 'none';
      localMicBadge.style.display = 'none';
    }
  }

  function updateLocalVideoUI(isVideoOff) {
    if (isVideoOff) {
      btnToggleCam.classList.add('danger');
      iconRoomCamOn.style.display = 'none';
      iconRoomCamOff.style.display = 'block';
      localVideoOffPlaceholder.style.display = 'flex';
      localVideo.style.display = 'none';
    } else {
      btnToggleCam.classList.remove('danger');
      iconRoomCamOn.style.display = 'block';
      iconRoomCamOff.style.display = 'none';
      localVideoOffPlaceholder.style.display = 'none';
      localVideo.style.display = 'block';
    }
  }

  function updateLocalScreenUI(isSharing, stream) {
    if (isSharing) {
      btnToggleScreen.classList.add('active');
      localVideoTile.classList.add('screen-sharing');
      localVideo.srcObject = stream;
      localVideoOffPlaceholder.style.display = 'none';
      localVideo.style.display = 'block';
    } else {
      btnToggleScreen.classList.remove('active');
      localVideoTile.classList.remove('screen-sharing');
      localVideo.srcObject = webrtc.localStream;
      updateLocalVideoUI(webrtc.isVideoOff);
    }
  }

  // Toolbar Actions
  btnToggleMic.addEventListener('click', () => {
    if (jitsiApi) {
      jitsiApi.executeCommand('toggleAudio');
    } else if (webrtc) {
      webrtc.toggleAudio();
    }
  });

  btnToggleCam.addEventListener('click', () => {
    if (jitsiApi) {
      jitsiApi.executeCommand('toggleVideo');
    } else if (webrtc) {
      webrtc.toggleVideo();
    }
  });

  btnToggleScreen.addEventListener('click', async () => {
    if (jitsiApi) {
      jitsiApi.executeCommand('toggleShareScreen');
    } else if (webrtc) {
      await webrtc.toggleScreenShare();
    }
  });

  // Reactions Popover Toggle
  btnToggleReactions.addEventListener('click', (e) => {
    e.stopPropagation();
    reactionsPopover.classList.toggle('open');
  });

  document.addEventListener('click', (e) => {
    if (!reactionsPopover.contains(e.target) && e.target !== btnToggleReactions) {
      reactionsPopover.classList.remove('open');
    }
  });

  document.querySelectorAll('.reaction-emoji-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      const emoji = btn.getAttribute('data-emoji');
      if (socket && emoji) {
        socket.emit('send-reaction', { emoji });
        showFloatingReaction(emoji);
        soundFx.playReaction();
      }
      reactionsPopover.classList.remove('open');
    });
  });

  // Chat & Participants Drawer Toggle
  function openDrawer(tabName) {
    sideDrawer.classList.add('open');
    videoGridWrapper.classList.add('drawer-open');

    if (tabName === 'chat') {
      isChatOpen = true;
      unreadCount = 0;
      unreadBadge.style.display = 'none';
      tabChat.classList.add('active');
      tabParticipants.classList.remove('active');
      chatPanel.classList.add('active');
      participantsPanel.classList.remove('active');
      chatInput.focus();
    } else {
      isChatOpen = false;
      tabChat.classList.remove('active');
      tabParticipants.classList.add('active');
      chatPanel.classList.remove('active');
      participantsPanel.classList.add('active');
    }
  }

  function closeDrawer() {
    sideDrawer.classList.remove('open');
    videoGridWrapper.classList.remove('drawer-open');
    isChatOpen = false;
  }

  btnToggleChat.addEventListener('click', () => {
    if (sideDrawer.classList.contains('open') && isChatOpen) {
      closeDrawer();
    } else {
      openDrawer('chat');
    }
  });

  btnToggleParticipants.addEventListener('click', () => {
    if (sideDrawer.classList.contains('open') && !isChatOpen) {
      closeDrawer();
    } else {
      openDrawer('participants');
    }
  });

  btnCloseDrawer.addEventListener('click', closeDrawer);
  tabChat.addEventListener('click', () => openDrawer('chat'));
  tabParticipants.addEventListener('click', () => openDrawer('participants'));

  // Chat message submit
  chatForm.addEventListener('submit', (e) => {
    e.preventDefault();
    const text = chatInput.value.trim();
    if (!text || !socket) return;

    socket.emit('send-chat-message', { messageText: text });
    chatInput.value = '';
  });

  // Copy meeting link
  async function copyMeetingLink() {
    let url = window.location.href;
    if (currentPasscode && !url.includes('passcode=')) {
      url += (url.includes('?') ? '&' : '?') + 'passcode=' + encodeURIComponent(currentPasscode);
    }
    try {
      await navigator.clipboard.writeText(url);
      showToast('Meeting invite link copied to clipboard!', 'success');
    } catch (e) {
      showToast('Could not copy automatically.', 'danger');
    }
  }

  roomTitleBadge.addEventListener('click', copyMeetingLink);
  btnCopyInvite.addEventListener('click', copyMeetingLink);
  btnInviteFromPanel.addEventListener('click', copyMeetingLink);

  // Leave room
  btnLeaveRoom.addEventListener('click', () => {
    if (confirm('Are you sure you want to leave the meeting?')) {
      if (jitsiApi) {
        try { jitsiApi.executeCommand('hangup'); } catch (e) {}
      }
      if (socket) {
        socket.emit('leave-room');
        socket.disconnect();
      }
      if (webrtc) {
        webrtc.destroy();
      }
      window.location.href = '/';
    }
  });

  // Keyboard Shortcuts Modal
  btnHeaderShortcuts.addEventListener('click', () => {
    shortcutsModal.style.display = 'flex';
  });
  btnCloseShortcuts.addEventListener('click', () => {
    shortcutsModal.style.display = 'none';
  });
  shortcutsModal.addEventListener('click', (e) => {
    if (e.target === shortcutsModal) shortcutsModal.style.display = 'none';
  });

  // Global Keyboard Shortcuts
  window.addEventListener('keydown', (e) => {
    // If user is currently typing in an input field, don't trigger hotkeys
    if (['INPUT', 'TEXTAREA'].includes(document.activeElement.tagName)) {
      return;
    }

    const key = e.key.toLowerCase();
    if (key === 'm') {
      if (jitsiApi) jitsiApi.executeCommand('toggleAudio');
      else if (webrtc) webrtc.toggleAudio();
    } else if (key === 'v') {
      if (jitsiApi) jitsiApi.executeCommand('toggleVideo');
      else if (webrtc) webrtc.toggleVideo();
    } else if (key === 's') {
      if (jitsiApi) jitsiApi.executeCommand('toggleShareScreen');
      else if (webrtc) webrtc.toggleScreenShare();
    } else if (key === 'c') {
      btnToggleChat.click();
    } else if (key === '?') {
      shortcutsModal.style.display = shortcutsModal.style.display === 'flex' ? 'none' : 'flex';
    }
  });

  // Window unload cleanup
  window.addEventListener('beforeunload', () => {
    if (jitsiApi) {
      try { jitsiApi.dispose(); } catch (e) {}
    }
    if (socket) {
      socket.emit('leave-room');
      socket.disconnect();
    }
    if (webrtc) {
      webrtc.destroy();
    }
  });

  // Start conference with configured engine (Defaults to Unlimited WebRTC - Zero Time Limit)
  window.addEventListener('DOMContentLoaded', () => {
    startMeetingTimer();

    // Check URL override: e.g. ?engine=webrtc or ?engine=jitsi
    const urlParams = new URLSearchParams(window.location.search);
    const urlEngine = urlParams.get('engine');

    // Auto-migrate away from stale public meet.jit.si localStorage setting to prevent moderator login wall & 5-min cuts
    const savedEngine = localStorage.getItem('meet_engine');
    const domain = (typeof window !== 'undefined' && window.JITSI_DOMAIN) ? window.JITSI_DOMAIN : 'meet.jit.si';
    if (savedEngine === 'jitsi' && domain === 'meet.jit.si' && !urlEngine) {
      console.log('Migrating from public meet.jit.si to Unlimited WebRTC mode for zero time limits & single login.');
      localStorage.setItem('meet_engine', 'webrtc');
    }

    let chosenEngine = (urlEngine || localStorage.getItem('meet_engine') || window.CONFERENCE_ENGINE || 'webrtc').toLowerCase();

    // Toggle engine switcher
    if (btnToggleEngine) {
      btnToggleEngine.addEventListener('click', () => {
        const next = chosenEngine === 'webrtc' ? 'jitsi' : 'webrtc';
        localStorage.setItem('meet_engine', next);
        showToast(`Switching to ${next === 'webrtc' ? 'Unlimited Mode (No Time Limit)' : 'Jitsi Mode'}...`, 'info');
        setTimeout(() => window.location.reload(), 500);
      });
    }

    if (chosenEngine === 'jitsi') {
      initJitsiMeeting();
    } else {
      initConference();
    }
  });
})();
