/**
 * VVA Meet - Meeting Room Coordinator
 * Ties together Socket.io, WebRTCManager, UI grid, floating dock, and chat persistence.
 */

(function () {
  // Parse Room ID from search param or URL path: /room/:roomId or room.php?room=...
  function getRoomIdFromUrl() {
    if (typeof window !== 'undefined' && window.MEETING_ROOM_ID) {
      return String(window.MEETING_ROOM_ID).trim();
    }
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

  // 1. Resolve user identity: strictly prioritize logged-in server session, then guest name
  let username = '';
  let userId = '';

  const urlParams = new URLSearchParams(window.location.search);
  const paramUser = urlParams.get('asUser') || urlParams.get('user') || urlParams.get('name');

  if (paramUser) {
    if (paramUser === 'user_karan' || paramUser.toLowerCase() === 'karan') {
      username = 'Karan';
      userId = 'user_karan';
    } else if (paramUser === 'user_navdeep' || paramUser.toLowerCase() === 'navdeep') {
      username = 'Navdeep';
      userId = 'user_navdeep';
    } else if (paramUser === 'user_kashish' || paramUser.toLowerCase() === 'kashish') {
      username = 'Kashish';
      userId = 'user_kashish';
    } else if (paramUser === 'user_vishesha' || paramUser.toLowerCase() === 'vishesha' || paramUser.toLowerCase() === 'vishesh') {
      username = 'Vishesha';
      userId = 'user_vishesha';
    } else {
      const clean = paramUser.split('@')[0].replace(/[._-]/g, ' ');
      username = clean.split(' ').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
      userId = `usr_${paramUser.toLowerCase().replace(/[^a-z0-9_]/g, '')}`;
    }
  } else if (window.LOGGED_IN_USER && window.LOGGED_IN_USER.username) {
    const rawName = window.LOGGED_IN_USER.username;
    const rawEmail = window.LOGGED_IN_USER.email || '';
    if (rawName && !/^User_\d+$/i.test(rawName) && !/^Guest_\d+$/i.test(rawName) && rawName !== 'User') {
      username = rawName;
    } else if (rawEmail) {
      const clean = rawEmail.split('@')[0].replace(/[._-]/g, ' ');
      username = clean.split(' ').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
    } else {
      username = rawName;
    }
    userId = window.LOGGED_IN_USER.id || `usr_${Math.random().toString(36).substring(2, 9)}`;

    // Strictly synchronize localStorage to the logged in account to avoid stale multi-account leakage
    try {
      localStorage.setItem('meet_username', username);
      localStorage.setItem('meet_user_id', userId);
      if (rawEmail) localStorage.setItem('meet_email', rawEmail);
    } catch (e) {}
  }

  if (!username) {
    const savedName = localStorage.getItem('meet_username');
    const savedId = localStorage.getItem('meet_user_id');
    const savedEmail = localStorage.getItem('meet_email') || sessionStorage.getItem('meet_email');

    if (paramUser) {
      const clean = paramUser.split('@')[0].replace(/[._-]/g, ' ');
      username = clean.split(' ').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
      userId = `guest_${Math.random().toString(36).substring(2, 8)}`;
    } else if (savedEmail) {
      // Derive clean name from registered Gmail
      const clean = savedEmail.split('@')[0].replace(/[._-]/g, ' ');
      username = clean.split(' ').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
      userId = savedId || `guest_${Math.random().toString(36).substring(2, 8)}`;
    } else if (savedName && !/^User_\d+$/i.test(savedName) && !/^Guest_\d+$/i.test(savedName) && savedName !== 'User') {
      username = savedName;
      userId = savedId || `guest_${Math.random().toString(36).substring(2, 8)}`;
    }
  }

  if (!userId) {
    userId = `guest_${Math.random().toString(36).substring(2, 9)}`;
  }

  if (!username) {
    username = `Guest_${Math.floor(Math.random() * 900 + 100)}`;
  }

  try {
    localStorage.setItem('meet_username', username);
    localStorage.setItem('meet_user_id', userId);
  } catch (e) {}

  // Initial media preferences from lobby
  let prefAudioMuted = sessionStorage.getItem('meet_pref_audio_muted') === 'true';
  let prefVideoOff = sessionStorage.getItem('meet_pref_video_off') === 'true';

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
  const localOutputCanvas = document.getElementById('localOutputCanvas');
  const bgPreviewCanvas = document.getElementById('bgPreviewCanvas');
  const localVideoOffPlaceholder = document.getElementById('localVideoOffPlaceholder');
  const localAvatarCircle = document.getElementById('localAvatarCircle');
  const localNameLabel = document.getElementById('localNameLabel');
  const localMicBadge = document.getElementById('localMicBadge');
  const localTileHandBadge = document.getElementById('localTileHandBadge');

  // Control Dock Buttons
  const btnToggleMic = document.getElementById('btnToggleMic');
  const btnToggleCam = document.getElementById('btnToggleCam');
  const btnToggleBackgrounds = document.getElementById('btnToggleBackgrounds');
  const btnToggleScreen = document.getElementById('btnToggleScreen');
  const btnRaiseHand = document.getElementById('btnRaiseHand');
  const btnToggleReactions = document.getElementById('btnToggleReactions');
  const btnToggleChat = document.getElementById('btnToggleChat');
  const btnToggleParticipants = document.getElementById('btnToggleParticipants');
  const btnCopyInvite = document.getElementById('btnCopyInvite');
  const btnLeaveRoom = document.getElementById('btnLeaveRoom');
  const unreadBadge = document.getElementById('unreadBadge');
  const reactionsPopover = document.getElementById('reactionsPopover');
  const reactionsContainer = document.getElementById('reactionsContainer');

  // Background Effects Panel Elements
  const backgroundEffectsPanel = document.getElementById('backgroundEffectsPanel');
  const btnCloseBgEffects = document.getElementById('btnCloseBgEffects');
  const bgPreviewVideo = document.getElementById('bgPreviewVideo');
  const bgPreviewVirtualLayer = document.getElementById('bgPreviewVirtualLayer');
  const bgPreviewPlaceholder = document.getElementById('bgPreviewPlaceholder');
  const bgPreviewStatusLabel = document.getElementById('bgPreviewStatusLabel');
  const btnResetBackground = document.getElementById('btnResetBackground');
  const btnTriggerUpload = document.getElementById('btnTriggerUpload');
  const customBgFileInput = document.getElementById('customBgFileInput');
  const customBackgroundsContainer = document.getElementById('customBackgroundsContainer');

  // Teams & Zoom Inbuilt Video Effects Elements
  const camControlGroup = document.getElementById('camControlGroup');
  const btnCamEffectsTrigger = document.getElementById('btnCamEffectsTrigger');
  const cameraEffectsPopover = document.getElementById('cameraEffectsPopover');
  const btnCloseEffectsPopover = document.getElementById('btnCloseEffectsPopover');
  const cameraDeviceList = document.getElementById('cameraDeviceList');
  const labelCurrentCamera = document.getElementById('labelCurrentCamera');
  const teamsAdjustBrightness = document.getElementById('teamsAdjustBrightness');
  const teamsSoftFocus = document.getElementById('teamsSoftFocus');
  const teamsSoftFocusRange = document.getElementById('teamsSoftFocusRange');
  const teamsSoftFocusControl = document.getElementById('teamsSoftFocusControl');
  const btnTeamsMoreEffects = document.getElementById('btnTeamsMoreEffects');

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

  // Fullscreen Elements
  const btnToggleFullscreen = document.getElementById('btnToggleFullscreen');
  const iconFullscreenEnter = document.getElementById('iconFullscreenEnter');
  const iconFullscreenExit = document.getElementById('iconFullscreenExit');

  // Jitsi Loader & Error Elements
  const jitsiLoadingOverlay = document.getElementById('jitsiLoadingOverlay');
  const jitsiErrorState = document.getElementById('jitsiErrorState');
  const jitsiErrorMessage = document.getElementById('jitsiErrorMessage');
  const btnRetryJitsi = document.getElementById('btnRetryJitsi');
  const btnFallbackWebRTC = document.getElementById('btnFallbackWebRTC');

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

  // Pre-Meeting Setup Screen (Microsoft Teams Lobby Style) Elements
  const preMeetingSetup = document.getElementById('preMeetingSetup');
  const prejoinTitleDisplay = document.getElementById('prejoinTitleDisplay');
  const prejoinVideo = document.getElementById('prejoinVideo');
  const prejoinCanvas = document.getElementById('prejoinCanvas');
  const prejoinCtx = prejoinCanvas ? prejoinCanvas.getContext('2d') : null;
  const prejoinCamOffView = document.getElementById('prejoinCamOffView');
  const prejoinCamToggle = document.getElementById('prejoinCamToggle');
  const prejoinCamSelect = document.getElementById('prejoinCamSelect');
  const btnPrejoinCamIcon = document.getElementById('btnPrejoinCamIcon');
  const prejoinCamIconSvg = document.getElementById('prejoinCamIconSvg');
  const btnPrejoinBgFilters = document.getElementById('btnPrejoinBgFilters');

  const optComputerAudio = document.getElementById('optComputerAudio');
  const optPhoneAudio = document.getElementById('optPhoneAudio');
  const optNoAudio = document.getElementById('optNoAudio');
  const prejoinMicToggle = document.getElementById('prejoinMicToggle');
  const prejoinMicSelect = document.getElementById('prejoinMicSelect');
  const prejoinSpeakerSelect = document.getElementById('prejoinSpeakerSelect');
  const btnPrejoinTestAudio = document.getElementById('btnPrejoinTestAudio');
  const prejoinAudioMeter = document.getElementById('prejoinAudioMeter');
  const prejoinAudioMeterFill = document.getElementById('prejoinAudioMeterFill');
  const prejoinAudioMeterText = document.getElementById('prejoinAudioMeterText');

  const prejoinSecurityBox = document.getElementById('prejoinSecurityBox');
  const prejoinPasscodeInput = document.getElementById('prejoinPasscodeInput');
  const prejoinSecurityError = document.getElementById('prejoinSecurityError');
  const prejoinUsernameInput = document.getElementById('prejoinUsernameInput');
  const btnPrejoinCancel = document.getElementById('btnPrejoinCancel');
  const btnPrejoinJoinNow = document.getElementById('btnPrejoinJoinNow');
  const linkPrejoinHelp = document.getElementById('linkPrejoinHelp');

  let isPrejoinActive = Boolean(preMeetingSetup);
  let prejoinStream = null;
  let prejoinAudioContext = null;
  let prejoinAudioAnalyser = null;
  let prejoinAudioAnimId = null;

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
  let isLocalAudioMuted = prefAudioMuted;
  let isLocalVideoOff = prefVideoOff;
  let isLocalScreenSharing = false;
  let isLocalHandRaised = false;
  let activeScreenSharerId = null; // null, 'local', or remote peerId
  let isFilmstripCollapsed = false;
  let currentViewMode = 'speaker'; // 'speaker' (Zoom active-speaker with minimized self-view) or 'grid' (equal split)
  let maximizedPeerId = null; // null (auto remote), 'local', or remote peerId
  const btnToggleViewMode = document.getElementById('btnToggleViewMode');
  const viewModeText = document.getElementById('viewModeText');

  // Presentation Mode Elements
  const filmstripTray = document.getElementById('filmstripTray');
  const presentationControlsBar = document.getElementById('presentationControlsBar');
  const presentationSharerBadge = document.getElementById('presentationSharerBadge');
  const btnToggleFilmstrip = document.getElementById('btnToggleFilmstrip');
  const toggleFilmstripText = document.getElementById('toggleFilmstripText');
  const btnMaximizePresentation = document.getElementById('btnMaximizePresentation');

  // Host & Waiting Room (Lobby) State
  let isMeetingHost = Boolean(window.IS_HOST);
  let isWaitingInLobby = false;
  let cachedExistingPeers = [];
  let waitingPeersMap = new Map(); // peerId -> { peerId, userId, username }
  let admissionBannerTimer = null;

  function checkIsHost() {
    if (isMeetingHost) return true;
    if (window.IS_HOST) return true;
    const hostId = window.MEETING_HOST_ID || null;
    if (hostId) {
      if (window.LOGGED_IN_USER && window.LOGGED_IN_USER.id === hostId) return true;
      if (userId && userId === hostId) return true;
    }
    return false;
  }

  // Lobby & Host UI Elements
  const nativeWaitingRoom = document.getElementById('nativeWaitingRoom');
  const waitingTitle = document.getElementById('waitingTitle');
  const waitingSubtitle = document.getElementById('waitingSubtitle');
  const hostAdmissionBanner = document.getElementById('hostAdmissionBanner');
  const admissionBannerAvatar = document.getElementById('admissionBannerAvatar');
  const admissionBannerName = document.getElementById('admissionBannerName');
  const btnBannerAdmit = document.getElementById('btnBannerAdmit');
  const btnBannerDeny = document.getElementById('btnBannerDeny');

  const hostControlsBar = document.getElementById('hostControlsBar');
  const btnHostMuteAll = document.getElementById('btnHostMuteAll');
  const waitingRoomSection = document.getElementById('waitingRoomSection');
  const waitingCountBadge = document.getElementById('waitingCountBadge');
  const waitingParticipantsList = document.getElementById('waitingParticipantsList');
  const btnAdmitAll = document.getElementById('btnAdmitAll');

  const participantPromptModal = document.getElementById('participantPromptModal');
  const promptModalTitle = document.getElementById('promptModalTitle');
  const promptModalMessage = document.getElementById('promptModalMessage');
  const btnPromptConfirm = document.getElementById('btnPromptConfirm');
  const btnPromptDismiss = document.getElementById('btnPromptDismiss');

  const hostActionModal = document.getElementById('hostActionModal');
  const hostActionTitle = document.getElementById('hostActionTitle');
  const hostActionMessage = document.getElementById('hostActionMessage');
  const btnHostActionConfirm = document.getElementById('btnHostActionConfirm');
  const btnHostActionCancel = document.getElementById('btnHostActionCancel');

  const removedFromMeetingModal = document.getElementById('removedFromMeetingModal');

  function showWaitingRoom() {
    isWaitingInLobby = true;
    window._isWaitingInLobby = true;
    if (nativeWaitingRoom) {
      nativeWaitingRoom.style.display = 'flex';
      nativeWaitingRoom.style.zIndex = '99999';
    }
    if (videoGrid) videoGrid.style.display = 'none';
    const controlDock = document.querySelector('.control-dock');
    if (controlDock) controlDock.style.display = 'none';
    const roomHeader = document.querySelector('.room-header');
    if (roomHeader) roomHeader.style.display = 'none';
  }

  function hideWaitingRoom() {
    isWaitingInLobby = false;
    window._isWaitingInLobby = false;
    if (nativeWaitingRoom) nativeWaitingRoom.style.display = 'none';
    if (videoGrid) videoGrid.style.display = 'grid';
    const controlDock = document.querySelector('.control-dock');
    if (controlDock) controlDock.style.display = 'flex';
    const roomHeader = document.querySelector('.room-header');
    if (roomHeader) roomHeader.style.display = 'flex';
  }

  function showHostAdmissionBanner(peer) {
    if (!checkIsHost() || !peer) return;
    if (admissionBannerAvatar) admissionBannerAvatar.textContent = (peer.username || 'U').charAt(0).toUpperCase();
    if (admissionBannerName) admissionBannerName.textContent = peer.username || 'Attendee';
    if (btnBannerAdmit) {
      btnBannerAdmit.onclick = () => admitWaitingParticipant(peer.peerId);
    }
    if (btnBannerDeny) {
      btnBannerDeny.onclick = () => denyWaitingParticipant(peer.peerId);
    }
    if (hostAdmissionBanner) {
      hostAdmissionBanner.style.display = 'flex';
      clearTimeout(admissionBannerTimer);
      admissionBannerTimer = setTimeout(() => {
        if (hostAdmissionBanner) hostAdmissionBanner.style.display = 'none';
      }, 9000);
    }
  }

  function updateWaitingRoomUI() {
    const isLocalHost = checkIsHost();
    if (!isLocalHost) {
      if (waitingRoomSection) waitingRoomSection.style.display = 'none';
      if (hostControlsBar) hostControlsBar.style.display = 'none';
      return;
    }

    if (hostControlsBar) hostControlsBar.style.display = 'flex';

    const count = waitingPeersMap.size;
    if (waitingCountBadge) waitingCountBadge.textContent = count;

    if (waitingRoomSection) {
      waitingRoomSection.style.display = count > 0 ? 'block' : 'none';
    }

    if (waitingParticipantsList) {
      waitingParticipantsList.innerHTML = '';
      waitingPeersMap.forEach((peer, peerId) => {
        const item = document.createElement('div');
        item.className = 'waiting-participant-item';
        item.innerHTML = `
          <div style="display:flex; align-items:center; gap:8px;">
            <div class="admission-avatar" style="width:28px; height:28px; font-size:0.8rem;">
              ${(peer.username || 'U').charAt(0).toUpperCase()}
            </div>
            <span style="font-size:0.84rem; font-weight:600; color:#fff;">${escapeHtml(peer.username || 'Guest')}</span>
          </div>
          <div style="display:flex; align-items:center; gap:6px;">
            <button class="btn btn-sm btn-admit" data-peer="${escapeHtml(peerId)}" style="background:#10b981; color:#fff; border:none; padding:3px 8px; border-radius:5px; font-size:0.75rem; font-weight:700; cursor:pointer;" title="Admit">Admit</button>
            <button class="btn btn-sm btn-deny" data-peer="${escapeHtml(peerId)}" style="background:rgba(239,68,68,0.2); color:#ef4444; border:1px solid rgba(239,68,68,0.4); padding:3px 7px; border-radius:5px; font-size:0.75rem; cursor:pointer;" title="Deny">&times;</button>
          </div>
        `;
        const bAdm = item.querySelector('.btn-admit');
        const bDen = item.querySelector('.btn-deny');
        if (bAdm) bAdm.onclick = () => admitWaitingParticipant(peerId);
        if (bDen) bDen.onclick = () => denyWaitingParticipant(peerId);
        waitingParticipantsList.appendChild(item);
      });
    }
  }

  async function admitWaitingParticipant(peerId) {
    const peer = waitingPeersMap.get(peerId);
    const peerName = peer ? peer.username : 'Participant';
    waitingPeersMap.delete(peerId);
    updateWaitingRoomUI();
    if (hostAdmissionBanner) hostAdmissionBanner.style.display = 'none';

    if (peer && !activePeersMap.has(peerId)) {
      activePeersMap.set(peerId, {
        username: peer.username,
        userId: peer.userId,
        audioMuted: false,
        videoOff: false,
        isScreenSharing: false
      });
      createRemoteVideoTile(peerId, peer.username);
      updateParticipantsList();
      recalculateGridLayout();
    }

    if (socket) {
      socket.emit('lobby:admit', { targetId: peerId, admitted: true });
    }
    try {
      await fetch('api/admit.php', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ roomId, peerId, action: 'admit' })
      });
    } catch (e) {}
    showToast(`Admitted ${peerName} to the meeting`, 'success');
  }

  async function admitAllWaitingParticipants() {
    const peers = Array.from(waitingPeersMap.values());
    if (peers.length === 0) return;
    waitingPeersMap.clear();
    updateWaitingRoomUI();
    if (hostAdmissionBanner) hostAdmissionBanner.style.display = 'none';

    for (const p of peers) {
      if (!activePeersMap.has(p.peerId)) {
        activePeersMap.set(p.peerId, {
          username: p.username,
          userId: p.userId,
          audioMuted: false,
          videoOff: false,
          isScreenSharing: false
        });
        createRemoteVideoTile(p.peerId, p.username);
      }
      if (socket) {
        socket.emit('lobby:admit', { targetId: p.peerId, admitted: true });
      }
      try {
        await fetch('api/admit.php', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ roomId, peerId: p.peerId, action: 'admit' })
        });
      } catch (e) {}
    }
    updateParticipantsList();
    recalculateGridLayout();
    showToast(`Admitted all ${peers.length} waiting participants`, 'success');
  }

  async function denyWaitingParticipant(peerId) {
    const peer = waitingPeersMap.get(peerId);
    const peerName = peer ? peer.username : 'Participant';
    waitingPeersMap.delete(peerId);
    updateWaitingRoomUI();
    if (hostAdmissionBanner) hostAdmissionBanner.style.display = 'none';

    if (socket) {
      socket.emit('lobby:deny', { targetId: peerId, denied: true });
    }
    try {
      await fetch('api/admit.php', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ roomId, peerId, action: 'deny' })
      });
    } catch (e) {}
    showToast(`Declined entry for ${peerName}`, 'info');
  }

  function requestMuteParticipant(targetPeerId, targetName) {
    if (socket) {
      socket.emit('host:mute-request', { targetId: targetPeerId, senderName: username });
    }
    showToast(`Sent mute request to ${targetName}`, 'info');
  }

  function requestUnmuteParticipant(targetPeerId, targetName) {
    if (socket) {
      socket.emit('host:unmute-request', { targetId: targetPeerId, senderName: username });
    }
    showToast(`Sent unmute request to ${targetName}`, 'info');
  }

  function requestMuteAll() {
    if (socket) {
      socket.emit('host:mute-request', { targetId: 'all', senderName: username });
    }
    showToast('Sent mute request to all participants', 'info');
  }

  function confirmMakeHost(targetPeerId, targetUserId, targetName) {
    if (!hostActionModal) return;
    hostActionTitle.textContent = 'Make Meeting Host';
    hostActionMessage.textContent = `Make ${targetName} the host of this meeting? They will receive full host permissions.`;
    btnHostActionConfirm.textContent = 'Make Host';
    btnHostActionConfirm.className = 'btn btn-primary';
    hostActionModal.style.display = 'flex';

    btnHostActionConfirm.onclick = async () => {
      hostActionModal.style.display = 'none';
      if (socket) {
        socket.emit('host:make-host', {
          targetId: 'all',
          newHostId: targetUserId,
          newHostName: targetName,
          newHostPeerId: targetPeerId
        });
      }
      try {
        await fetch('api/make_host.php', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ roomId, newHostId: targetUserId, newHostName: targetName })
        });
      } catch (e) {}

      window.MEETING_HOST_ID = targetUserId;
      window.MEETING_HOST_NAME = targetName;
      window.IS_HOST = false;
      isMeetingHost = false;
      updateLocalNameLabel();
      updateParticipantsList();
      updateWaitingRoomUI();
      showToast(`${targetName} is now the meeting host`, 'success');
    };

    btnHostActionCancel.onclick = () => {
      hostActionModal.style.display = 'none';
    };
  }

  function confirmRemoveParticipant(targetPeerId, targetName) {
    if (!hostActionModal) return;
    hostActionTitle.textContent = 'Remove Participant';
    hostActionMessage.textContent = `Remove ${targetName} from the meeting? They will be immediately disconnected.`;
    btnHostActionConfirm.textContent = 'Remove';
    btnHostActionConfirm.className = 'btn btn-danger';
    hostActionModal.style.display = 'flex';

    btnHostActionConfirm.onclick = async () => {
      hostActionModal.style.display = 'none';
      if (socket) {
        socket.emit('host:remove', { targetId: targetPeerId, targetName });
      }
      try {
        await fetch('api/leave.php', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ roomId, peerId: targetPeerId })
        });
      } catch (e) {}

      activePeersMap.delete(targetPeerId);
      if (webrtc) webrtc.closePeer(targetPeerId);
      removeRemoteVideoTile(targetPeerId);
      updateParticipantsList();
      showToast(`Removed ${targetName} from meeting`, 'info');
    };

    btnHostActionCancel.onclick = () => {
      hostActionModal.style.display = 'none';
    };
  }

  if (btnHostMuteAll) {
    btnHostMuteAll.addEventListener('click', () => {
      requestMuteAll();
    });
  }
  if (btnAdmitAll) {
    btnAdmitAll.addEventListener('click', () => {
      admitAllWaitingParticipants();
    });
  }

  // Setup UI basics
  if (roomNameText) roomNameText.textContent = roomId;
  function updateLocalNameLabel() {
    const isLocalHost = checkIsHost();
    if (localNameLabel) {
      localNameLabel.innerHTML = `${escapeHtml(username)} (You)${isLocalHost ? ' <span class="tile-host-badge" style="margin-left:4px;">👑 Host</span>' : ''}`;
    }
    const headerUserName = document.getElementById('headerUserName');
    if (headerUserName) {
      headerUserName.textContent = username;
    }
    const headerChip = document.querySelector('.current-user-chip');
    if (headerChip) {
      headerChip.style.display = 'inline-flex';
      headerChip.title = `You are in meeting as ${username}${isLocalHost ? ' (Host)' : ''}`;
    }
    if (localAvatarCircle) {
      localAvatarCircle.textContent = username.charAt(0).toUpperCase();
    }
    if (hostControlsBar) {
      hostControlsBar.style.display = isLocalHost ? 'flex' : 'none';
    }
  }
  updateLocalNameLabel();

  function displayPasscodeBadge(code) {
    return;
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
      updateLocalNameLabel();
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

  // Maximize any screen to become the full main view (Zoom style)
  function maximizeScreen(peerId) {
    if (maximizedPeerId === peerId) {
      // Toggle back to the other peer if already maximized
      if (peerId === 'local') {
        const firstRemotePeerId = Array.from(activePeersMap.keys())[0];
        maximizedPeerId = firstRemotePeerId || null;
      } else {
        maximizedPeerId = 'local';
      }
    } else {
      maximizedPeerId = peerId;
    }
    currentViewMode = 'speaker';
    recalculateGridLayout();
    const targetName = peerId === 'local' ? 'Your screen' : (activePeersMap.get(peerId)?.username || 'Participant');
    showToast(`${targetName} maximized to main view`, 'info', 1800);
  }

  // Minimize / Maximize tile handler (Google Meet / Zoom style)
  function toggleTileMinimize(peerId) {
    const tile = peerId === 'local' 
      ? localVideoTile 
      : document.getElementById(`tile_${peerId}`);
    if (!tile) return;

    const isMinimized = tile.classList.toggle('minimized');
    const btn = tile.querySelector('.btn-minimize-tile');
    if (btn) {
      btn.title = isMinimized ? 'Maximize Tile' : 'Minimize Tile';
      const iconMin = btn.querySelector('.icon-minimize');
      const iconMax = btn.querySelector('.icon-maximize');
      if (iconMin) iconMin.style.display = isMinimized ? 'none' : 'inline-block';
      if (iconMax) iconMax.style.display = isMinimized ? 'inline-block' : 'none';
    }
    recalculateGridLayout();
  }

  // Recalculate dynamic video grid layout classes (Presentation, Spotlight, and Zoom Speaker mode)
  function recalculateGridLayout() {
    const tray = document.getElementById('filmstripTray');
    const pBar = document.getElementById('presentationControlsBar');
    const sharerBadge = document.getElementById('presentationSharerBadge');
    const allTiles = Array.from(document.querySelectorAll('.video-tile'));

    // Reset grid layout classes
    videoGrid.className = 'video-grid';
    if (isFilmstripCollapsed) {
      videoGrid.classList.add('filmstrip-collapsed');
    }

    const heroId = activeScreenSharerId || pinnedPeerId;

    if (heroId) {
      if (btnToggleViewMode) btnToggleViewMode.style.display = 'none';
      videoGrid.classList.add(activeScreenSharerId ? 'presentation-mode' : 'grid-spotlight');

      // Update floating presentation bar info
      if (pBar) {
        pBar.style.display = activeScreenSharerId ? 'flex' : 'none';
        if (sharerBadge) {
          if (activeScreenSharerId === 'local') {
            sharerBadge.textContent = 'You are sharing your screen';
          } else {
            const peer = activePeersMap.get(activeScreenSharerId);
            sharerBadge.textContent = `${peer?.username || 'Participant'} is presenting`;
          }
        }
      }

      // Move hero tile into videoGrid root before tray, and move all attendee camera tiles into filmstrip tray
      if (tray) {
        tray.style.display = 'flex';
        allTiles.forEach((tile) => {
          const id = tile.getAttribute('data-peer-id');
          if (id === heroId) {
            tile.classList.add(activeScreenSharerId ? 'presentation-hero' : 'pinned');
            if (tile.parentElement !== videoGrid || tile.nextSibling !== tray) {
              videoGrid.insertBefore(tile, tray);
            }
          } else {
            tile.classList.remove('presentation-hero', 'pinned');
            if (tile.parentElement !== tray) {
              tray.appendChild(tile);
            }
          }
          const v = tile.querySelector('video');
          if (v) {
            if (v.srcObject && v.paused) {
              v.play().catch(() => {});
            }
            if (id === heroId && activeScreenSharerId) {
              const ph = tile.querySelector('.video-off-placeholder');
              if (ph) ph.style.display = 'none';
              v.style.display = 'block';
            }
          }
        });
      }
      return;
    }

    // Normal Grid Mode: restore all tiles to main videoGrid
    if (pBar) pBar.style.display = 'none';
    if (tray) {
      tray.style.display = 'none';
      const trayTiles = Array.from(tray.querySelectorAll('.video-tile'));
      trayTiles.forEach((tile) => {
        videoGrid.appendChild(tile);
      });
    }

    allTiles.forEach((tile) => {
      tile.classList.remove('presentation-hero', 'pinned', 'zoom-hero');
    });

    const hasRemotePeers = activePeersMap.size > 0;
    if (btnToggleViewMode) {
      btnToggleViewMode.style.display = hasRemotePeers ? 'inline-flex' : 'none';
      if (viewModeText) {
        viewModeText.textContent = currentViewMode === 'speaker' ? 'Speaker View' : 'Grid View';
      }
    }

    // Zoom Speaker Mode when another participant is in the call
    if (hasRemotePeers && currentViewMode === 'speaker') {
      videoGrid.classList.add('zoom-speaker-mode');

      // Find remote host if someone else is hosting
      let remoteHostPeerId = null;
      for (const [pId, pData] of activePeersMap.entries()) {
        const hName = (window.MEETING_HOST_NAME || '').toLowerCase().trim();
        const pName = (pData.username || '').toLowerCase().trim();
        if ((hName && pName === hName) ||
            (window.MEETING_HOST_ID && pData.userId == window.MEETING_HOST_ID)) {
          remoteHostPeerId = pId;
          break;
        }
      }

      const firstRemotePeerId = Array.from(activePeersMap.keys())[0];
      // In speaker view with participants, the remote opponent is hero, and local self-view is minimized on the right
      const defaultRemoteHero = remoteHostPeerId || firstRemotePeerId || 'local';
      const heroPeerId = maximizedPeerId || defaultRemoteHero;

      if (tray) {
        tray.style.display = 'flex';
        allTiles.forEach((tile) => {
          const id = tile.getAttribute('data-peer-id');
          if (id === heroPeerId) {
            tile.classList.add('zoom-hero');
            tile.classList.remove('zoom-thumbnail', 'zoom-self-view');
            if (tile.parentElement !== videoGrid) {
              videoGrid.insertBefore(tile, tray);
            }
          } else {
            tile.classList.remove('zoom-hero');
            tile.classList.add(id === 'local' ? 'zoom-self-view' : 'zoom-thumbnail');
            if (tile.parentElement !== tray) {
              tray.appendChild(tile);
            }
          }
          const v = tile.querySelector('video');
          if (v && v.srcObject && v.paused) {
            v.play().catch(() => {});
          }
        });
      }
      return;
    }

    // Standard Grid Mode
    allTiles.forEach((tile) => {
      tile.classList.remove('zoom-hero', 'zoom-thumbnail', 'zoom-self-view');
    });

    if (localVideoTile) {
      if (localVideoTile.classList.contains('minimized')) {
        videoGrid.classList.add('has-local-minimized');
      }
    }

    const activeTiles = videoGrid.querySelectorAll('.video-tile');
    const count = activeTiles.length;

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
    if (!peerId || peerId === 'local' || peerId === myPeerId) return;
    if (document.getElementById(`tile_${peerId}`)) return;

    const tile = document.createElement('div');
    tile.id = `tile_${peerId}`;
    tile.className = 'video-tile';
    tile.setAttribute('data-peer-id', peerId);

    const video = document.createElement('video');
    video.id = `video_${peerId}`;
    video.autoplay = true;
    video.playsInline = true;
    video.setAttribute('playsinline', 'true');
    video.setAttribute('autoplay', 'true');
    video.muted = true; // Crucial: muted ensures browser permits autoplay without user gesture
    video.style.display = 'block'; // Always visible; placeholder covers it until frames arrive

    // Dedicated companion audio element for remote peer speech
    const audio = document.createElement('audio');
    audio.id = `audio_${peerId}`;
    audio.autoplay = true;
    audio.playsInline = true;
    audio.className = 'remote-peer-audio';

    const checkAndShowVideo = () => {
      const peer = activePeersMap.get(peerId);
      const isSharing = Boolean(peer && peer.isScreenSharing);
      const hasTracks = video.srcObject && video.srcObject.getVideoTracks && video.srcObject.getVideoTracks().length > 0;
      const isVideoOff = peer ? (Boolean(peer.videoOff) && !isSharing) : false;
      const hasDecodedFrames = (video.videoWidth > 0 && video.videoHeight > 0 && video.readyState >= 2) || (video.currentTime > 0);
      if (placeholder) {
        placeholder.style.display = (isSharing || (!isVideoOff && (hasTracks || hasDecodedFrames))) ? 'none' : 'flex';
      }
      video.style.display = 'block';
      video.play().catch(() => {});
    };

    video.onloadedmetadata = () => {
      video.play().catch(() => {});
      checkAndShowVideo();
    };
    video.onloadeddata = checkAndShowVideo;
    video.onresize = checkAndShowVideo;
    video.onplaying = checkAndShowVideo;
    video.ontimeupdate = () => {
      if (video.currentTime > 0) checkAndShowVideo();
    };

    // Video off placeholder (active by default until video track is confirmed)
    const placeholder = document.createElement('div');
    placeholder.id = `placeholder_${peerId}`;
    placeholder.className = 'video-off-placeholder';
    placeholder.style.display = 'flex';

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
    nameSpan.id = `name_${peerId}`;
    nameSpan.textContent = peerUsername || 'Participant';

    const hostName = window.MEETING_HOST_NAME || '';
    const hostId = window.MEETING_HOST_ID || null;
    const isPeerHost = (hostName && peerUsername === hostName) || (hostId && activePeersMap.get(peerId)?.userId == hostId);

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

    if (isPeerHost) {
      const hostBadge = document.createElement('span');
      hostBadge.className = 'tile-host-badge';
      hostBadge.textContent = '👑 Host';
      label.appendChild(hostBadge);
    }

    label.appendChild(micBadge);

    const handBadge = document.createElement('span');
    handBadge.id = `handBadge_${peerId}`;
    handBadge.className = 'tile-hand-badge';
    handBadge.style.display = 'none';
    handBadge.title = 'Hand Raised';
    handBadge.textContent = '✋';
    label.appendChild(handBadge);

    overlayBottom.appendChild(label);

    // Top overlay (Maximize button, Minimize button, Pin button, PiP)
    const overlayTop = document.createElement('div');
    overlayTop.className = 'tile-overlay-top';

    const maxBtn = document.createElement('button');
    maxBtn.className = 'tile-action-btn btn-maximize-screen';
    maxBtn.title = 'Maximize this screen to main view';
    maxBtn.innerHTML = `
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <polyline points="15 3 21 3 21 9"></polyline>
        <polyline points="9 21 3 21 3 15"></polyline>
        <line x1="21" y1="3" x2="14" y2="10"></line>
        <line x1="3" y1="21" x2="10" y2="14"></line>
      </svg>
    `;
    maxBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      maximizeScreen(peerId);
    });

    const minBtn = document.createElement('button');
    minBtn.className = 'tile-action-btn btn-minimize-tile';
    minBtn.title = 'Collapse / Minimize';
    minBtn.innerHTML = `
      <svg class="icon-minimize" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <line x1="5" y1="12" x2="19" y2="12"></line>
      </svg>
      <svg class="icon-maximize" style="display:none;" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <polyline points="15 3 21 3 21 9"></polyline>
        <polyline points="9 21 3 21 3 15"></polyline>
        <line x1="21" y1="3" x2="14" y2="10"></line>
        <line x1="3" y1="21" x2="10" y2="14"></line>
      </svg>
    `;
    minBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      toggleTileMinimize(peerId);
    });

    tile.addEventListener('click', (e) => {
      if ((tile.classList.contains('zoom-thumbnail') || tile.closest('#filmstripTray') || tile.classList.contains('minimized')) && !e.target.closest('.tile-action-btn')) {
        maximizeScreen(peerId);
      }
    });

    tile.addEventListener('dblclick', (e) => {
      if (e.target.closest('.tile-action-btn')) return;
      const isFit = tile.classList.toggle('fit-contain');
      showToast(isFit ? 'Fit to Screen (Full Camera View)' : 'Fill Screen', 'info', 1500);
    });

    overlayTop.appendChild(maxBtn);
    overlayTop.appendChild(minBtn);

    const pinBtn = document.createElement('button');
    pinBtn.className = 'tile-action-btn btn-pin-tile';
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
    tile.appendChild(audio);
    tile.appendChild(placeholder);
    tile.appendChild(overlayBottom);
    tile.appendChild(overlayTop);

    videoGrid.appendChild(tile);

    // If WebRTC already holds an active stream for this peer, attach it immediately
    if (webrtc && webrtc.peers.has(peerId)) {
      const p = webrtc.peers.get(peerId);
      if (p && p.remoteStream && p.remoteStream.getTracks().length > 0) {
        // Attach stream, let checkAndShowVideo event handlers manage placeholder
        video.srcObject = p.remoteStream;
        audio.srcObject = p.remoteStream;
        audio.play().catch(() => {});
        video.play().catch(() => {});
        checkAndShowVideo();
      }
    }

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
    if (activeScreenSharerId === peerId) {
      activeScreenSharerId = null;
    }
    if (maximizedPeerId === peerId) {
      maximizedPeerId = null;
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

  // Local maximize, pin & minimize button handlers
  const localMaxBtn = document.querySelector('.btn-maximize-screen[data-peer="local"]');
  if (localMaxBtn) {
    localMaxBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      maximizeScreen('local');
    });
  }

  const localPinBtn = document.querySelector('.btn-pin-tile[data-peer="local"]');
  if (localPinBtn) {
    localPinBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      togglePinTile('local');
    });
  }

  const localMinBtn = document.querySelector('.btn-minimize-tile[data-peer="local"]');
  if (localMinBtn) {
    localMinBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      toggleTileMinimize('local');
    });
  }

  if (localVideoTile) {
    localVideoTile.addEventListener('click', (e) => {
      if ((localVideoTile.classList.contains('zoom-self-view') || localVideoTile.closest('#filmstripTray') || localVideoTile.classList.contains('minimized')) && !e.target.closest('.tile-action-btn')) {
        maximizeScreen('local');
      }
    });

    localVideoTile.addEventListener('dblclick', (e) => {
      if (e.target.closest('.tile-action-btn')) return;
      const isFit = localVideoTile.classList.toggle('fit-contain');
      showToast(isFit ? 'Fit to Screen (Full Camera View)' : 'Fill Screen', 'info', 1500);
    });
  }

  // Zoom Speaker View vs Grid View Switcher
  if (btnToggleViewMode) {
    btnToggleViewMode.addEventListener('click', () => {
      currentViewMode = currentViewMode === 'speaker' ? 'grid' : 'speaker';
      if (viewModeText) {
        viewModeText.textContent = currentViewMode === 'speaker' ? 'Speaker View' : 'Grid View';
      }
      showToast(`Switched to ${currentViewMode === 'speaker' ? 'Zoom Speaker View' : 'Grid View'}`, 'info', 1800);
      recalculateGridLayout();
    });
  }

  // Presentation Mode Filmstrip & Maximize Toolbar
  if (btnToggleFilmstrip) {
    btnToggleFilmstrip.addEventListener('click', () => {
      isFilmstripCollapsed = !isFilmstripCollapsed;
      const tray = document.getElementById('filmstripTray');
      const count = tray ? tray.querySelectorAll('.video-tile').length : 0;
      if (toggleFilmstripText) {
        toggleFilmstripText.textContent = isFilmstripCollapsed ? `Show Participants (${count})` : 'Hide Participants';
      }
      recalculateGridLayout();
    });
  }

  if (btnMaximizePresentation) {
    btnMaximizePresentation.addEventListener('click', () => {
      const heroTile = document.querySelector('.presentation-hero') || videoGrid;
      if (document.fullscreenElement) {
        document.exitFullscreen().catch(() => {});
      } else if (heroTile && heroTile.requestFullscreen) {
        heroTile.requestFullscreen().catch(() => {});
      }
    });
  }

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

    const isLocalHost = checkIsHost();
    const hostName = window.MEETING_HOST_NAME || '';
    const hostId = window.MEETING_HOST_ID || null;

    if (hostControlsBar) {
      hostControlsBar.style.display = isLocalHost ? 'flex' : 'none';
    }

    // Add local user
    const localItem = document.createElement('div');
    localItem.className = 'participant-item';
    localItem.innerHTML = `
      <div class="participant-info">
        <div class="p-avatar">${username.charAt(0).toUpperCase()}</div>
        <span class="p-name">${username}</span>
        ${isLocalHost ? '<span class="host-badge">👑 Host</span>' : ''}
        <span class="p-badge">You</span>
        ${isLocalHandRaised ? '<span class="p-hand-badge" title="Hand Raised">✋ Raised</span>' : ''}
      </div>
      <div class="p-icons">
        <span style="color: ${isLocalAudioMuted ? 'var(--danger)' : 'var(--success)'}; font-size:0.8rem;">
          ${isLocalAudioMuted ? 'Muted' : 'Mic On'}
        </span>
      </div>
    `;
    participantsList.appendChild(localItem);

    // Add remote peers
    activePeersMap.forEach((p, peerId) => {
      const isRemoteHost = (hostName && p.username === hostName) || (hostId && p.userId == hostId);
      const item = document.createElement('div');
      item.className = 'participant-item';
      item.innerHTML = `
        <div class="participant-info">
          <div class="p-avatar">${(p.username || 'U').charAt(0).toUpperCase()}</div>
          <span class="p-name">${p.username}</span>
          ${isRemoteHost ? '<span class="host-badge">👑 Host</span>' : ''}
          ${p.isHandRaised ? '<span class="p-hand-badge" title="Hand Raised">✋ Raised</span>' : ''}
        </div>
        <div class="p-icons">
          <span style="color: ${p.audioMuted ? 'var(--danger)' : 'var(--success)'}; font-size:0.8rem; margin-right:4px;">
            ${p.audioMuted ? 'Muted' : 'Mic On'}
          </span>
          ${isLocalHost && !isRemoteHost ? `
            <div class="p-host-actions">
              <button type="button" class="btn-p-action ${p.audioMuted ? 'primary' : 'warning'} btn-host-mic" title="${p.audioMuted ? 'Ask to Unmute' : 'Ask to Mute'}">
                ${p.audioMuted ? `
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z"></path>
                    <path d="M19 10v2a7 7 0 0 1-14 0v-2"></path>
                  </svg>
                ` : `
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <line x1="1" y1="1" x2="23" y2="23"></line>
                    <path d="M9 9v3a3 3 0 0 0 5.12 2.12M15 9.34V4a3 3 0 0 0-5.94-.6"></path>
                    <path d="M17 16.95A7 7 0 0 1 5 12v-2m14 0v2a7 7 0 0 1-.11 1.23"></path>
                  </svg>
                `}
              </button>
              <button type="button" class="btn-p-action warning btn-host-make" title="Make Host">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                  <path d="M2 4l3 12h14l3-12-6 7-4-7-4 7-6-7z"></path>
                  <circle cx="12" cy="19" r="2"></circle>
                </svg>
              </button>
              <button type="button" class="btn-p-action danger btn-host-remove" title="Remove from Meeting">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                  <path d="M16 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"></path>
                  <circle cx="8.5" cy="7.5" r="4"></circle>
                  <line x1="18" y1="8" x2="23" y2="13"></line>
                  <line x1="23" y1="8" x2="18" y2="13"></line>
                </svg>
              </button>
            </div>
          ` : ''}
        </div>
      `;

      if (isLocalHost && !isRemoteHost) {
        const btnMic = item.querySelector('.btn-host-mic');
        if (btnMic) {
          btnMic.onclick = (e) => {
            e.stopPropagation();
            if (p.audioMuted) {
              requestUnmuteParticipant(peerId, p.username);
            } else {
              requestMuteParticipant(peerId, p.username);
            }
          };
        }
        const btnMake = item.querySelector('.btn-host-make');
        if (btnMake) {
          btnMake.onclick = (e) => {
            e.stopPropagation();
            confirmMakeHost(peerId, p.userId, p.username);
          };
        }
        const btnRemove = item.querySelector('.btn-host-remove');
        if (btnRemove) {
          btnRemove.onclick = (e) => {
            e.stopPropagation();
            confirmRemoveParticipant(peerId, p.username);
          };
        }
      }

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

  // Connect to backend for MySQL chat persistence, emoji bursts & session tracking
  function initSocketBackend() {
    if (socket) return;
    const socketUrl = (typeof window !== 'undefined' && window.SOCKET_SERVER_URL) ? window.SOCKET_SERVER_URL : undefined;
    if (typeof io === 'function') {
      try {
        socket = io(socketUrl, {
          reconnectionAttempts: 4,
          timeout: 4000,
          transports: ['websocket', 'polling']
        });
      } catch (e) {}
    }
    if (!socket && typeof VVARealtimeClient === 'function') {
      socket = new VVARealtimeClient();
    }

    let hasJoined = false;
    function emitJoin() {
      if (hasJoined || !socket) return;
      hasJoined = true;
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
        if (Array.isArray(response.existingPeers)) {
          response.existingPeers.forEach((p) => {
            if (p.peerId !== myPeerId && !activePeersMap.has(p.peerId)) {
              activePeersMap.set(p.peerId, {
                username: p.username || 'Participant',
                userId: p.userId || p.peerId,
                audioMuted: Boolean(p.audioMuted),
                videoOff: Boolean(p.videoOff),
                isScreenSharing: Boolean(p.isScreenSharing)
              });
            }
          });
          updateParticipantsList();
        }
      });
    }

    socket.on('connect', emitJoin);
    emitJoin();

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

    socket.on('user-left', ({ peerId }) => {
      if (activePeersMap.has(peerId)) {
        activePeersMap.delete(peerId);
        updateParticipantsList();
      }
    });
  }

  // Official Jitsi Meet External API integration
  function initJitsiMeeting() {
    console.log('Mounting Jitsi Meet External API...');
    if (jitsiContainer) jitsiContainer.style.display = 'flex';
    if (videoGrid) videoGrid.style.display = 'none';
    if (engineBadgeText) engineBadgeText.textContent = 'Jitsi Mode';
    if (connectionText) {
      connectionText.textContent = 'Connecting...';
      connectionText.style.color = '#f59e0b';
    }

    // Show loading overlay
    if (jitsiLoadingOverlay) {
      jitsiLoadingOverlay.classList.remove('fade-out');
      jitsiLoadingOverlay.style.display = 'flex';
    }
    if (jitsiErrorState) {
      jitsiErrorState.style.display = 'none';
    }

    const domain = (typeof window !== 'undefined' && window.JITSI_DOMAIN) ? window.JITSI_DOMAIN : 'meet.jit.si';
    const cleanRoom = (typeof window !== 'undefined' && window.JITSI_ROOM_NAME)
      ? window.JITSI_ROOM_NAME
      : ('VVAMeet_' + roomId.replace(/[^a-zA-Z0-9_\-]/g, ''));
    const userEmail = (window.LOGGED_IN_USER && window.LOGGED_IN_USER.email) ? window.LOGGED_IN_USER.email : '';

    const banner = document.getElementById('jitsiNoticeBanner');
    const btnSwitch = document.getElementById('btnSwitchToUnlimited');
    if (banner && domain === 'meet.jit.si') {
      banner.style.display = 'flex';
      if (btnSwitch) {
        btnSwitch.onclick = () => {
          localStorage.setItem('meet_engine', 'webrtc');
          showToast('Switching to Native WebRTC Mode...', 'info');
          setTimeout(() => window.location.reload(), 400);
        };
      }
    } else if (banner) {
      banner.style.display = 'none';
    }

    // Check if script is available
    if (typeof window.JitsiMeetExternalAPI === 'undefined') {
      console.warn('JitsiMeetExternalAPI is undefined. Showing error overlay.');
      if (jitsiLoadingOverlay) jitsiLoadingOverlay.style.display = 'none';
      if (jitsiErrorState) {
        jitsiErrorState.style.display = 'flex';
        if (jitsiErrorMessage) {
          jitsiErrorMessage.textContent = `Could not load external_api.js from "${domain}". Check network, DNS, or domain setting in config.php.`;
        }
      }
      return;
    }

    // Clean up any stale iframe in the container before mounting
    const existingIframe = jitsiContainer.querySelector('iframe');
    if (existingIframe) {
      existingIframe.remove();
    }

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

      // Reflect initial preferences on our custom dock
      updateLocalAudioUI(prefAudioMuted);
      updateLocalVideoUI(prefVideoOff);

      // Conference Joined
      jitsiApi.addListener('videoConferenceJoined', () => {
        console.log('Joined Jitsi conference room:', cleanRoom);
        if (connectionText) {
          connectionText.textContent = 'Jitsi Connected';
          connectionText.style.color = '#34d399';
        }
        if (jitsiLoadingOverlay) {
          jitsiLoadingOverlay.classList.add('fade-out');
          setTimeout(() => { jitsiLoadingOverlay.style.display = 'none'; }, 400);
        }

        // Apply display name & email explicitly to ensure reflection
        try {
          jitsiApi.executeCommand('displayName', username);
          if (userEmail) jitsiApi.executeCommand('email', userEmail);
        } catch (e) {}

        // Room passcode synchronization
        if (currentPasscode) {
          try {
            jitsiApi.executeCommand('password', currentPasscode);
            console.log('Jitsi room password set.');
          } catch (e) {
            console.warn('Could not set Jitsi room password:', e);
          }
        }

        // Apply saved virtual background effect if configured
        if (activeBgEffect && activeBgEffect.type !== 'none') {
          setTimeout(() => {
            applyBackgroundEffect(activeBgEffect.type, activeBgEffect.value, activeBgEffect.title, true);
          }, 1500);
        }
      });

      jitsiApi.addListener('passwordRequired', () => {
        if (currentPasscode) {
          jitsiApi.executeCommand('password', currentPasscode);
        } else {
          showPasscodeModal('Please enter meeting passcode to unlock');
        }
      });

      // Synchronize Jitsi media events with our floating dock and MySQL
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
        const pName = p.displayName || 'Participant';
        showToast(`${pName} joined the meeting`, 'info');
        if (p.id) {
          activePeersMap.set(p.id, {
            username: pName,
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
        const leftName = activePeersMap.get(p.id)?.username || 'Participant';
        showToast(`${leftName} left the meeting`, 'info');
        if (p.id) {
          activePeersMap.delete(p.id);
          updateParticipantsList();
        }
      });

      jitsiApi.addListener('displayNameChange', ({ id, displayname }) => {
        if (id && activePeersMap.has(id)) {
          activePeersMap.get(id).username = displayname;
          updateParticipantsList();
        }
      });

      jitsiApi.addListener('readyToClose', () => {
        if (socket) {
          socket.emit('leave-room');
          socket.disconnect();
        }
        if (jitsiApi) {
          try { jitsiApi.dispose(); } catch (e) {}
          jitsiApi = null;
        }
        window.location.href = 'index.php';
      });

      // Connect to backend for MySQL chat persistence & attendance tracking
      initSocketBackend();
      updateParticipantsList();
    } catch (err) {
      console.error('Error initializing Jitsi Meet API:', err);
      if (jitsiLoadingOverlay) jitsiLoadingOverlay.style.display = 'none';
      if (jitsiErrorState) {
        jitsiErrorState.style.display = 'flex';
        if (jitsiErrorMessage) {
          jitsiErrorMessage.textContent = `Jitsi initialization failed: ${err.message || err}`;
        }
      }
    }
  }

  // WebRTC initialization and callbacks (Unlimited Native Mesh Mode - Zero Time Limit)
  async function initConference() {
    console.log('Mounting Unlimited Native WebRTC Conference Engine (No Time Limit)...');
    if (!window.DYNAMIC_ICE_SERVERS || window.DYNAMIC_ICE_SERVERS.length === 0) {
      try {
        const iceRes = await fetch('api/ice_servers.php');
        if (iceRes.ok) {
          const iceData = await iceRes.json();
          if (iceData && Array.isArray(iceData.iceServers)) {
            window.DYNAMIC_ICE_SERVERS = iceData.iceServers;
          }
        }
      } catch (e) {
        console.warn('Could not pre-fetch dynamic ice servers:', e);
      }
    }
    const banner = document.getElementById('jitsiNoticeBanner');
    if (banner) banner.style.display = 'none';
    if (jitsiContainer) jitsiContainer.style.display = 'none';
    if (videoGrid) videoGrid.style.display = isWaitingInLobby ? 'none' : 'grid';
    if (engineBadgeText) engineBadgeText.textContent = '⚡ Unlimited Mode';
    if (connectionText) {
      connectionText.textContent = 'Unlimited (No Limit)';
      connectionText.style.color = '#34d399';
    }

    webrtc = new WebRTCManager({
      localUsername: username,
      onRemoteStream: (peerId, stream) => {
        let video = document.getElementById(`video_${peerId}`);
        let audio = document.getElementById(`audio_${peerId}`);
        const placeholder = document.getElementById(`placeholder_${peerId}`);
        if (!video) {
          const peer = activePeersMap.get(peerId);
          createRemoteVideoTile(peerId, peer?.username || 'Participant');
          video = document.getElementById(`video_${peerId}`);
          audio = document.getElementById(`audio_${peerId}`);
        }
        if (audio && audio.srcObject !== stream) {
          audio.srcObject = stream;
          audio.play().catch(() => {});
        }
        if (video) {
          const videoTracks = stream ? stream.getVideoTracks() : [];
          const currentVideoTrack = (video.srcObject && video.srcObject.getVideoTracks) ? video.srcObject.getVideoTracks()[0] : null;
          if (videoTracks.length > 0 && (!currentVideoTrack || currentVideoTrack.id !== videoTracks[0].id)) {
            video.srcObject = null;
            video.srcObject = stream;
          } else if (!video.srcObject) {
            video.srcObject = stream;
          }
          video.style.display = 'block';
          video.play().catch(e => {
            console.warn('Video auto-play suppressed, forcing muted:', e);
            video.muted = true;
            video.play().catch(() => {});
          });
          const updateRemotePlaceholder = () => {
            const placeholder = document.getElementById(`placeholder_${peerId}`);
            const peer = activePeersMap.get(peerId);
            const isSharing = Boolean(peer && peer.isScreenSharing);
            const isOff = peer ? (Boolean(peer.videoOff) && !isSharing) : false;
            const hasFrames = (video.videoWidth > 0 && video.videoHeight > 0 && video.readyState >= 2) || (video.currentTime > 0);
            if (placeholder) {
              placeholder.style.display = (isSharing || (!isOff && hasFrames)) ? 'none' : 'flex';
            }
          };
          video.onloadedmetadata = updateRemotePlaceholder;
          video.onloadeddata = updateRemotePlaceholder;
          video.onresize = updateRemotePlaceholder;
          video.onplaying = updateRemotePlaceholder;
          video.ontimeupdate = () => { if (video.currentTime > 0) updateRemotePlaceholder(); };
          updateRemotePlaceholder();
        }
        if (audio && stream && stream.getAudioTracks().length > 0) {
          if (audio.srcObject !== stream) {
            audio.srcObject = stream;
          }
          audio.play().catch(e => console.warn('Audio auto-play waiting for user interaction:', e));
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
    window._webrtc = webrtc;

    // Acquire camera & microphone safely
    let localStream = null;
    try {
      localStream = await webrtc.initLocalMedia({
        video: !prefVideoOff,
        audio: !prefAudioMuted
      });
    } catch (mediaErr) {
      console.warn('Could not acquire local camera/mic stream:', mediaErr);
    }

    if (localStream && localVideo) {
      localVideo.srcObject = (webrtc && webrtc.rawCameraStream) ? webrtc.rawCameraStream : localStream;
      localVideo.style.display = isWaitingInLobby ? 'none' : (prefVideoOff ? 'none' : 'block');
    }
    updateLocalAudioUI(prefAudioMuted);
    updateLocalVideoUI(prefVideoOff);

    if (activeBgEffect.type !== 'none' && !prefVideoOff) {
      startSegmentationLoop();
    }

    // Initialize Socket.io with fallback to VVARealtimeClient for BigRock PHP/MySQL hosting
    const socketUrl = (typeof window !== 'undefined' && window.SOCKET_SERVER_URL) ? window.SOCKET_SERVER_URL : undefined;
    if (typeof io === 'function') {
      try {
        socket = io(socketUrl, {
          reconnectionAttempts: 4,
          timeout: 4000,
          transports: ['websocket', 'polling']
        });
      } catch (err) {
        console.warn('[Socket.io] Initialization error:', err);
      }
    }
    if (!socket && typeof VVARealtimeClient === 'function') {
      socket = new VVARealtimeClient();
    }

    // Global document interaction listener: unlock any browser-muted audio on first click
    document.addEventListener('click', () => {
      document.querySelectorAll('audio.remote-peer-audio').forEach(a => {
        if (a.paused && a.srcObject) a.play().catch(() => {});
      });
      document.querySelectorAll('.video-tile video').forEach(v => {
        if (v.paused && v.srcObject) v.play().catch(() => {});
      });
    });

    // Watchdog interval: ensure remote videos don't stall or pause on black frames
    setInterval(() => {
      activePeersMap.forEach((peer, peerId) => {
        const video = document.getElementById(`video_${peerId}`);
        const audio = document.getElementById(`audio_${peerId}`);
        const placeholder = document.getElementById(`placeholder_${peerId}`);
        if (webrtc && webrtc.peers.has(peerId)) {
          const peerData = webrtc.peers.get(peerId);
          if (peerData && peerData.remoteStream) {
            const hasVideo = peerData.remoteStream.getVideoTracks().length > 0;
            if (video) {
              if (video.srcObject !== peerData.remoteStream) {
                video.srcObject = peerData.remoteStream;
              }
              if (hasVideo && !peer.videoOff) {
                video.style.display = 'block';
                if (placeholder) placeholder.style.display = 'none';
              }
              if (video.paused && video.srcObject) {
                video.play().catch(() => {});
              }
            }
            if (audio && peerData.remoteStream.getAudioTracks().length > 0) {
              if (audio.srcObject !== peerData.remoteStream) {
                audio.srcObject = peerData.remoteStream;
              }
              if (audio.paused && audio.srcObject) {
                audio.play().catch(() => {});
              }
            }
          }
        }
      });
    }, 1200);

    let hasJoined = false;
    function emitJoin() {
      if (hasJoined || !socket) return;
      hasJoined = true;
      socket.emit('join-room', {
        roomId,
        username,
        userId,
        passcode: currentPasscode,
        audioMuted: webrtc ? webrtc.isAudioMuted : prefAudioMuted,
        videoOff: webrtc ? webrtc.isVideoOff : prefVideoOff
      }, handleJoinAck);
    }

    function attachSocketListeners(s) {
      if (!s) return;

      s.on('connect', () => {
        if (connectionText) {
          connectionText.textContent = 'Connected (Real-time)';
          connectionText.style.color = '#34d399';
        }
        emitJoin();
      });

      s.on('disconnect', () => {
        if (connectionText) {
          connectionText.textContent = 'Reconnecting...';
          connectionText.style.color = '#f59e0b';
        }
      });

      // WebRTC Signaling: Offer
      s.on('signal:offer', async ({ callerId, offer, callerName }) => {
        if (!callerId || callerId === myPeerId) return;
        if (isWaitingInLobby || window._isWaitingInLobby) {
          console.warn('[Lobby] Rejecting incoming offer while in waiting room from', callerId);
          return;
        }
        if (waitingPeersMap.has(callerId)) {
          console.warn('[Lobby] Rejecting offer from waiting participant:', callerId);
          return;
        }
        if (!activePeersMap.has(callerId)) {
          activePeersMap.set(callerId, {
            username: callerName || 'Participant',
            userId: null,
            audioMuted: false,
            videoOff: false,
            isScreenSharing: false
          });
        }
        createRemoteVideoTile(callerId, callerName);
        await webrtc.handleOffer(callerId, offer, s);
        updateParticipantsList();
      });

      // WebRTC Signaling: Answer
      s.on('signal:answer', async ({ responderId, answer }) => {
        if (isWaitingInLobby || window._isWaitingInLobby) return;
        if (waitingPeersMap.has(responderId)) return;
        await webrtc.handleAnswer(responderId, answer);
      });

      // WebRTC Signaling: ICE Candidate
      s.on('signal:ice-candidate', async ({ senderId, candidate }) => {
        if (isWaitingInLobby || window._isWaitingInLobby) return;
        if (waitingPeersMap.has(senderId)) return;
        await webrtc.handleIceCandidate(senderId, candidate);
      });

      // Another user joined
      s.on('user-joined', (data) => {
        if (!data || !data.peerId || data.peerId === myPeerId) {
          return;
        }
        if (isWaitingInLobby || window._isWaitingInLobby) {
          return;
        }
        if (data.status === 'waiting' || waitingPeersMap.has(data.peerId)) {
          console.log('[Lobby] Not adding video tile for waiting participant:', data.username);
          return;
        }
        const isExisting = activePeersMap.has(data.peerId);
        if (!isExisting) {
          soundFx.playJoin();
          showToast(`${data.username} joined the meeting`, 'info');
        }

        activePeersMap.set(data.peerId, {
          username: data.username,
          userId: data.userId,
          audioMuted: data.audioMuted,
          videoOff: data.videoOff,
          isScreenSharing: false
        });

        createRemoteVideoTile(data.peerId, data.username);
        // Only initiate new connection if not already created or connected
        if (!webrtc || !webrtc.peers.has(data.peerId) || webrtc.peers.get(data.peerId).pc.connectionState !== 'connected') {
          webrtc.createPeerConnection(data.peerId, s, true);
        }
        updateRemotePeerMediaUI(data.peerId, data.audioMuted, data.videoOff);
        updateParticipantsList();
      });

      // Remote peer toggled mic/video/screen
      s.on('peer-media-toggle', ({ peerId, type, enabled, username: senderName }) => {
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
            const hasFrames = (video.videoWidth > 0 && video.readyState >= 2) || (video.currentTime > 0);
            placeholder.style.display = (!enabled || !hasFrames) ? 'flex' : 'none';
            video.style.display = 'block';
            if (enabled && video.srcObject && video.paused) {
              video.play().catch(() => {});
            }
          }
        } else if (type === 'screen') {
          const peer = activePeersMap.get(peerId);
          if (peer) {
            peer.isScreenSharing = Boolean(enabled);
            if (enabled) {
              peer.videoOff = false;
            }
          }
          if (enabled) {
            // Enforce single active screen sharer: if local user is sharing, stop local share!
            if (isLocalScreenSharing && peerId !== myPeerId) {
              if (webrtc && webrtc.isScreenSharing) {
                webrtc.stopScreenShare();
              }
              updateLocalScreenUI(false);
              showToast(`${senderName || peer?.username || 'Another participant'} started sharing. Your screen share was ended.`, 'warning');
            }
            // Reset any other remote peers that were sharing
            activePeersMap.forEach((otherP, otherId) => {
              if (otherId !== peerId && otherP.isScreenSharing) {
                otherP.isScreenSharing = false;
                const otherTile = document.getElementById(`tile_${otherId}`);
                if (otherTile) {
                  otherTile.classList.remove('screen-sharing');
                  const b = otherTile.querySelector('.screen-badge');
                  if (b) b.remove();
                }
              }
            });
            activeScreenSharerId = peerId;
          } else {
            if (activeScreenSharerId === peerId || !peerId || activePeersMap.get(peerId)?.isScreenSharing) {
              activeScreenSharerId = null;
            }
          }

          const tile = document.getElementById(`tile_${peerId}`);
          const placeholder = document.getElementById(`placeholder_${peerId}`);
          const video = document.getElementById(`video_${peerId}`);
          if (tile) {
            let badge = tile.querySelector('.screen-badge');
            if (enabled) {
              if (!badge) {
                badge = document.createElement('div');
                badge.className = 'screen-badge';
                badge.textContent = 'Sharing Screen';
                tile.appendChild(badge);
              }
              tile.classList.add('screen-sharing');
              if (placeholder) placeholder.style.display = 'none';
              if (video) {
                video.style.display = 'block';
                if (webrtc) {
                  const pData = webrtc.peers.get(peerId);
                  if (pData && pData.remoteStream) {
                    if (video.srcObject !== pData.remoteStream) {
                      video.srcObject = pData.remoteStream;
                    }
                    video.play().catch(() => {});
                  }
                }
              }
            } else {
              if (badge) badge.remove();
              tile.classList.remove('screen-sharing');
              const peer = activePeersMap.get(peerId);
              if (peer && placeholder && video) {
                placeholder.style.display = peer.videoOff ? 'flex' : 'none';
                video.style.display = peer.videoOff ? 'none' : 'block';
              }
              // Re-bind remote stream and play video to eliminate black screen after screenshare stops
              if (webrtc && video) {
                const pData = webrtc.peers.get(peerId);
                if (pData && pData.remoteStream) {
                  video.srcObject = null;
                  video.srcObject = pData.remoteStream;
                  video.load();
                  video.play().catch(() => {});
                }
              }
            }
          }
          if (!activeScreenSharerId) {
            const pBar = document.getElementById('presentationControlsBar');
            if (pBar) pBar.style.display = 'none';
            const sharerBadge = document.getElementById('presentationSharerBadge');
            if (sharerBadge) sharerBadge.textContent = '';
            if (videoGrid) videoGrid.classList.remove('presentation-mode');
          }
          recalculateGridLayout();
        } else if (type === 'hand') {
          const badge = document.getElementById(`handBadge_${peerId}`);
          if (badge) badge.style.display = enabled ? 'inline-flex' : 'none';
          if (enabled) {
            soundFx.playReaction();
            showFloatingReaction('✋');
            showToast(`${peer?.username || senderName || 'Participant'} raised their hand ✋`, 'info');
          }
        }
        updateParticipantsList();
      });

      // Immediate screen share takeover broadcast signals
      s.on('screen:started', ({ peerId, senderName }) => {
        if (peerId && peerId !== myPeerId) {
          if (isLocalScreenSharing) {
            if (webrtc && webrtc.isScreenSharing) {
              webrtc.stopScreenShare();
            }
            updateLocalScreenUI(false);
            showToast(`${senderName || 'Another participant'} started sharing. Your screen share was ended.`, 'warning');
          }
          activePeersMap.forEach((otherP, otherId) => {
            if (otherId !== peerId && otherP.isScreenSharing) {
              otherP.isScreenSharing = false;
              const ot = document.getElementById(`tile_${otherId}`);
              if (ot) {
                ot.classList.remove('screen-sharing');
                const b = ot.querySelector('.screen-badge');
                if (b) b.remove();
              }
            }
          });
          const p = activePeersMap.get(peerId);
          if (p) {
            p.isScreenSharing = true;
            p.videoOff = false;
          }
          activeScreenSharerId = peerId;
          const tile = document.getElementById(`tile_${peerId}`);
          const placeholder = document.getElementById(`placeholder_${peerId}`);
          const video = document.getElementById(`video_${peerId}`);
          if (tile) {
            tile.classList.add('screen-sharing');
            let b = tile.querySelector('.screen-badge');
            if (!b) {
              b = document.createElement('div');
              b.className = 'screen-badge';
              b.textContent = 'Sharing Screen';
              tile.appendChild(b);
            }
            if (placeholder) placeholder.style.display = 'none';
            if (video) {
              video.style.display = 'block';
              if (webrtc) {
                const pData = webrtc.peers.get(peerId);
                if (pData && pData.remoteStream) {
                  if (video.srcObject !== pData.remoteStream) {
                    video.srcObject = pData.remoteStream;
                  }
                  video.play().catch(() => {});
                }
              }
            }
          }
          recalculateGridLayout();
        }
      });

      s.on('screen:stopped', (data) => {
        const id = (data && (data.peerId || data.senderId)) || activeScreenSharerId;
        if (id) {
          const p = activePeersMap.get(id);
          if (p) p.isScreenSharing = false;
          const tile = document.getElementById(`tile_${id}`);
          if (tile) {
            tile.classList.remove('screen-sharing');
            const b = tile.querySelector('.screen-badge');
            if (b) b.remove();
          }
          const video = document.getElementById(`video_${id}`);
          if (webrtc && video) {
            const pData = webrtc.peers.get(id);
            if (pData && pData.remoteStream) {
              video.srcObject = null;
              video.srcObject = pData.remoteStream;
              video.load();
              video.play().catch(() => {});
            }
          }
        }
        activeScreenSharerId = null;
        const pBar = document.getElementById('presentationControlsBar');
        if (pBar) pBar.style.display = 'none';
        const sharerBadge = document.getElementById('presentationSharerBadge');
        if (sharerBadge) sharerBadge.textContent = '';
        if (videoGrid) videoGrid.classList.remove('presentation-mode');
        recalculateGridLayout();
      });

      // Remote peer raised / lowered hand
      s.on('peer-raise-hand', ({ peerId, username: peerName, isRaised }) => {
        const peer = activePeersMap.get(peerId);
        if (peer) peer.isHandRaised = isRaised;
        const badge = document.getElementById(`handBadge_${peerId}`);
        if (badge) badge.style.display = isRaised ? 'inline-flex' : 'none';
        updateParticipantsList();
        if (isRaised) {
          soundFx.playReaction();
          showFloatingReaction('✋');
          showToast(`${peerName || peer?.username || 'Participant'} raised their hand ✋`, 'info');
        }
      });

      // Remote peer left
      s.on('user-left', ({ peerId, username: leftUsername }) => {
        if (!peerId || peerId === myPeerId) return;
        if (!activePeersMap.has(peerId)) return;
        soundFx.playLeave();
        showToast(`${leftUsername || 'Participant'} left the meeting`, 'info');
        activePeersMap.delete(peerId);
        if (activeScreenSharerId === peerId) {
          activeScreenSharerId = null;
        }
        webrtc.closePeer(peerId);
        removeRemoteVideoTile(peerId);
        updateParticipantsList();
        recalculateGridLayout();
      });

      // Chat message received
      s.on('chat-message', (msg) => {
        renderChatMessage(msg);
        soundFx.playMessage();

        if (!isChatOpen) {
          unreadCount++;
          unreadBadge.textContent = unreadCount > 9 ? '9+' : unreadCount;
          unreadBadge.style.display = 'flex';
        }
      });

      // Reaction received
      s.on('peer-reaction', ({ senderName, emoji }) => {
        soundFx.playReaction();
        showFloatingReaction(emoji);
      });

      // Host Moderation: Mute Request
      s.on('host:mute-request', ({ senderName }) => {
        if (isLocalAudioMuted) return;
        if (checkIsHost()) return;

        if (participantPromptModal) {
          promptModalTitle.textContent = 'Mute your microphone?';
          promptModalMessage.textContent = `${senderName || 'The host'} has requested that you mute your microphone.`;
          btnPromptConfirm.textContent = 'Mute Microphone';
          btnPromptConfirm.className = 'btn btn-primary';
          btnPromptConfirm.style.background = '';
          btnPromptConfirm.style.borderColor = '';
          participantPromptModal.style.display = 'flex';

          btnPromptConfirm.onclick = () => {
            participantPromptModal.style.display = 'none';
            if (!isLocalAudioMuted && webrtc) {
              webrtc.toggleAudio();
              isLocalAudioMuted = true;
              updateLocalAudioUI(true);
              if (socket) socket.emit('media-toggle', { type: 'audio', enabled: false });
              showToast('Microphone muted by host request', 'info');
            }
          };

          btnPromptDismiss.onclick = () => {
            participantPromptModal.style.display = 'none';
          };
        }
      });

      // Host Moderation: Unmute Request
      s.on('host:unmute-request', ({ senderName }) => {
        if (!isLocalAudioMuted) return;
        if (checkIsHost()) return;

        if (participantPromptModal) {
          promptModalTitle.textContent = 'Unmute your microphone?';
          promptModalMessage.textContent = `${senderName || 'The host'} would like you to speak.`;
          btnPromptConfirm.textContent = 'Unmute Microphone';
          btnPromptConfirm.className = 'btn btn-primary';
          btnPromptConfirm.style.background = '#10b981';
          btnPromptConfirm.style.borderColor = '#10b981';
          participantPromptModal.style.display = 'flex';

          btnPromptConfirm.onclick = () => {
            participantPromptModal.style.display = 'none';
            btnPromptConfirm.style.background = '';
            btnPromptConfirm.style.borderColor = '';
            if (isLocalAudioMuted && webrtc) {
              webrtc.toggleAudio();
              isLocalAudioMuted = false;
              updateLocalAudioUI(false);
              if (socket) socket.emit('media-toggle', { type: 'audio', enabled: true });
              showToast('Microphone unmuted', 'success');
            }
          };

          btnPromptDismiss.onclick = () => {
            participantPromptModal.style.display = 'none';
            btnPromptConfirm.style.background = '';
            btnPromptConfirm.style.borderColor = '';
          };
        }
      });

      // Host Moderation: Removed from meeting
      s.on('host:remove', () => {
        if (webrtc && webrtc.localStream) {
          webrtc.localStream.getTracks().forEach(t => t.stop());
        }
        if (webrtc && webrtc.screenStream) {
          webrtc.screenStream.getTracks().forEach(t => t.stop());
        }
        if (removedFromMeetingModal) {
          removedFromMeetingModal.style.display = 'flex';
        }
        setTimeout(() => {
          window.location.href = 'index.php';
        }, 3500);
      });

      // Host Moderation: Make Host Transfer
      s.on('host:make-host', (data) => {
        window.MEETING_HOST_ID = data.newHostId;
        window.MEETING_HOST_NAME = data.newHostName;
        const amINewHost = (userId == data.newHostId || (window.LOGGED_IN_USER && window.LOGGED_IN_USER.id == data.newHostId));
        window.IS_HOST = amINewHost;
        isMeetingHost = amINewHost;
        updateLocalNameLabel();
        updateParticipantsList();
        updateWaitingRoomUI();
        if (amINewHost) {
          soundFx.playJoin();
          showToast('👑 You are now the host of this meeting!', 'success', 5000);
        } else {
          showToast(`👑 ${data.newHostName || 'Another participant'} is now the meeting host`, 'info', 4000);
        }
      });

      // Waiting Lobby: Waiting Peers Update (for Host)
      s.on('lobby:waiting-peers', ({ waitingPeers }) => {
        if (!checkIsHost()) return;
        waitingPeersMap.clear();
        (waitingPeers || []).forEach(p => {
          waitingPeersMap.set(p.peerId, p);
        });
        updateWaitingRoomUI();
        if (waitingPeers && waitingPeers.length > 0) {
          showHostAdmissionBanner(waitingPeers[waitingPeers.length - 1]);
        }
      });

      // Waiting Lobby: Attendee Admitted
      s.on('lobby:admit', () => {
        if (isWaitingInLobby) {
          hideWaitingRoom();
          startMeetingTimer();
          if (localVideo) {
            localVideo.style.display = prefVideoOff ? 'none' : 'block';
            localVideo.play().catch(() => {});
          }
          showToast('Host admitted you to the meeting!', 'success');
          const peersToConnect = new Map();
          (cachedExistingPeers || []).forEach(p => {
            if (p && p.peerId && p.peerId !== myPeerId) peersToConnect.set(p.peerId, p);
          });
          if (socket && socket.knownParticipants) {
            socket.knownParticipants.forEach((p, pId) => {
              const safeId = p.peerId || pId;
              if (safeId && safeId !== myPeerId) peersToConnect.set(safeId, p);
            });
          }
          peersToConnect.forEach((peer, peerId) => {
            if (!activePeersMap.has(peerId)) {
              activePeersMap.set(peerId, {
                username: peer.username || 'Host',
                userId: peer.userId || peerId,
                audioMuted: Boolean(peer.audioMuted),
                videoOff: Boolean(peer.videoOff),
                isScreenSharing: Boolean(peer.isScreenSharing)
              });
              createRemoteVideoTile(peerId, peer.username || 'Host');
              updateRemotePeerMediaUI(peerId, Boolean(peer.audioMuted), Boolean(peer.videoOff));
            }
            if (webrtc) {
              webrtc.createPeerConnection(peerId, socket, false);
              setTimeout(() => {
                if (webrtc && socket && activePeersMap.has(peerId)) {
                  const p = webrtc.peers.get(peerId);
                  if (!p || (p.pc.connectionState !== 'connected' && p.pc.signalingState === 'stable')) {
                    console.log(`[Lobby Auto-Connect] Fallback offer to ${peerId}`);
                    webrtc.createPeerConnection(peerId, socket, true);
                  }
                }
              }, 4000);
            }
          });
          updateParticipantsList();
          recalculateGridLayout();
        }
      });

      // Waiting Lobby: Attendee Denied
      s.on('lobby:deny', () => {
        if (nativeWaitingRoom) {
          if (waitingTitle) waitingTitle.textContent = 'Meeting Admission Declined';
          if (waitingSubtitle) waitingSubtitle.textContent = 'The meeting host has declined your request to join this session.';
          const spinner = nativeWaitingRoom.querySelector('div[style*="animation"]');
          if (spinner) spinner.style.display = 'none';
        }
        showToast('Your request to join the meeting was declined.', 'danger');
      });
    }

    attachSocketListeners(socket);

    // Watch for connection errors on BigRock hosting without Node.js
    let hasFallbackSwitched = false;
    if (socket && typeof VVARealtimeClient === 'function' && !(socket instanceof VVARealtimeClient)) {
      socket.on('connect_error', (err) => {
        console.warn('[Socket.io] Connect error:', err?.message || err);
        if (!socket.connected && !hasFallbackSwitched) {
          hasFallbackSwitched = true;
          console.log('[Realtime] Falling back to BigRock PHP/MySQL Realtime Engine...');
          try { socket.disconnect(); } catch (e) {}
          socket = new VVARealtimeClient();
          attachSocketListeners(socket);
          hasJoined = false;
          emitJoin();
        }
      });
    }

    // Directly emit join so we don't hang if connect listener already processed
    emitJoin();
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
    if (response.hostName) {
      window.MEETING_HOST_NAME = response.hostName;
      const hostEl = document.getElementById('meetingHostNameDisplay');
      if (hostEl) hostEl.textContent = response.hostName;
      const hostChip = document.getElementById('meetingHostBadge');
      if (hostChip) hostChip.title = `Meeting Host: ${response.hostName}`;
    }
    if (response.hostId) {
      window.MEETING_HOST_ID = response.hostId;
    }
    if (response.isHost !== undefined) {
      window.IS_HOST = Boolean(response.isHost);
      isMeetingHost = Boolean(response.isHost);
    }
    updateLocalNameLabel();
    updateWaitingRoomUI();

    cachedExistingPeers = Array.isArray(response.existingPeers) ? response.existingPeers : [];

    // Check admission status: If attendee and status is 'waiting', show native waiting room!
    if (response.status === 'waiting' && !checkIsHost()) {
      showWaitingRoom();
      if (socket) {
        socket.emit('lobby:waiting', {
          targetId: 'all',
          peerId: myPeerId,
          userId,
          username
        });
      }
      return; // Do not connect to existing peers or start WebRTC until host admits!
    } else {
      hideWaitingRoom();
    }

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
        if (!peer || !peer.peerId || peer.peerId === myPeerId) {
          return; // Skip self
        }
        if (peer.status === 'waiting' || waitingPeersMap.has(peer.peerId)) {
          return; // Skip waiting peers until admitted
        }
        activePeersMap.set(peer.peerId, {
          username: peer.username,
          userId: peer.userId,
          audioMuted: peer.audioMuted,
          videoOff: peer.videoOff,
          isScreenSharing: peer.isScreenSharing
        });

        createRemoteVideoTile(peer.peerId, peer.username);
        updateRemotePeerMediaUI(peer.peerId, peer.audioMuted, peer.videoOff);

        // Prepare peer connection as responder; existing peer initiates offer via user-joined event
        if (webrtc && socket) {
          webrtc.createPeerConnection(peer.peerId, socket, false);
        }

        // Safety fallback: only if no offer arrives after 5s and not yet connected, initiate connection
        setTimeout(() => {
          if (webrtc && socket && activePeersMap.has(peer.peerId)) {
            const p = webrtc.peers.get(peer.peerId);
            if (!p || (p.pc.connectionState !== 'connected' && p.pc.signalingState === 'stable')) {
              console.log(`[Mesh Auto-Connect] Fallback offer to existing peer ${peer.peerId}`);
              webrtc.createPeerConnection(peer.peerId, socket, true);
            }
          }
        }, 5000);
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
      const hasFrames = (video.videoWidth > 0 && video.readyState >= 2) || (video.currentTime > 0);
      placeholder.style.display = (videoOff || !hasFrames) ? 'flex' : 'none';
      video.style.display = 'block';
      if (!videoOff && video.srcObject && video.paused) {
        video.play().catch(() => {});
      }
    }
  }

  // Local UI status update helpers
  function updateLocalAudioUI(isMuted) {
    isLocalAudioMuted = isMuted;
    if (btnToggleMic) {
      if (isMuted) {
        btnToggleMic.classList.add('danger');
        if (iconRoomMicOn) iconRoomMicOn.style.display = 'none';
        if (iconRoomMicOff) iconRoomMicOff.style.display = 'block';
      } else {
        btnToggleMic.classList.remove('danger');
        if (iconRoomMicOn) iconRoomMicOn.style.display = 'block';
        if (iconRoomMicOff) iconRoomMicOff.style.display = 'none';
      }
    }
    if (localMicBadge) {
      localMicBadge.style.display = isMuted ? 'inline-flex' : 'none';
    }
    updateParticipantsList();
  }

  function updateLocalVideoUI(isVideoOff) {
    isLocalVideoOff = isVideoOff;
    if (btnToggleCam) {
      if (isVideoOff) {
        btnToggleCam.classList.add('danger');
        if (iconRoomCamOn) iconRoomCamOn.style.display = 'none';
        if (iconRoomCamOff) iconRoomCamOff.style.display = 'block';
      } else {
        btnToggleCam.classList.remove('danger');
        if (iconRoomCamOn) iconRoomCamOn.style.display = 'block';
        if (iconRoomCamOff) iconRoomCamOff.style.display = 'none';
      }
    }
    if (localVideoOffPlaceholder && localVideo) {
      localVideoOffPlaceholder.style.display = isVideoOff ? 'flex' : 'none';
      localVideo.style.display = isVideoOff ? 'none' : 'block';
    }
    if (typeof isBgPanelOpen !== 'undefined' && isBgPanelOpen) {
      if (isVideoOff) {
        if (bgPreviewPlaceholder) bgPreviewPlaceholder.style.display = 'flex';
        if (bgPreviewVideo) bgPreviewVideo.style.display = 'none';
      } else {
        if (bgPreviewPlaceholder) bgPreviewPlaceholder.style.display = 'none';
        if (bgPreviewVideo) bgPreviewVideo.style.display = 'block';
        if (typeof startBgPreviewCamera === 'function') startBgPreviewCamera();
      }
    }
  }

  function updateLocalScreenUI(isSharing, stream) {
    isLocalScreenSharing = isSharing;
    if (btnToggleScreen) {
      if (isSharing) {
        btnToggleScreen.classList.add('active');
        btnToggleScreen.setAttribute('data-tooltip', 'Stop Sharing (Ctrl+S)');
      } else {
        btnToggleScreen.classList.remove('active');
        btnToggleScreen.setAttribute('data-tooltip', 'Share Screen (Ctrl+S)');
      }
    }

    if (isSharing) {
      activeScreenSharerId = 'local';
      // Reset any remote peers from sharing state
      activePeersMap.forEach((otherP, otherId) => {
        if (otherP.isScreenSharing) {
          otherP.isScreenSharing = false;
          const ot = document.getElementById(`tile_${otherId}`);
          if (ot) {
            ot.classList.remove('screen-sharing');
            const b = ot.querySelector('.screen-badge');
            if (b) b.remove();
          }
        }
      });
      if (socket) {
        socket.emit('screen:started', { roomId, peerId: myPeerId, senderName: username });
      }
    } else {
      activeScreenSharerId = null;
      if (socket) {
        socket.emit('screen:stopped', { roomId, peerId: myPeerId });
      }
      const pBar = document.getElementById('presentationControlsBar');
      if (pBar) pBar.style.display = 'none';
      const sharerBadge = document.getElementById('presentationSharerBadge');
      if (sharerBadge) sharerBadge.textContent = '';
      if (videoGrid) videoGrid.classList.remove('presentation-mode');
    }

    if (localVideoTile && localVideo) {
      if (isSharing) {
        localVideoTile.classList.add('screen-sharing');
        if (localOutputCanvas) localOutputCanvas.style.display = 'none';
        isCanvasStreamAttached = false;
        localVideo.style.filter = 'none';
        if (stream) localVideo.srcObject = stream;
        if (localVideoOffPlaceholder) localVideoOffPlaceholder.style.display = 'none';
        localVideo.style.display = 'block';
        localVideo.play().catch(() => {});
      } else {
        localVideoTile.classList.remove('screen-sharing');
        if (typeof applyLocalVideoEnhancements === 'function') {
          applyLocalVideoEnhancements();
        }
        const camStream = (webrtc && (webrtc.rawCameraStream || webrtc.localStream)) || stream || null;
        if (camStream) {
          localVideo.srcObject = null;
          localVideo.srcObject = camStream;
          localVideo.load();
          localVideo.play().catch(() => {});
          updateLocalVideoUI(webrtc ? webrtc.isVideoOff : false);
        }
        if (activeBgEffect.type !== 'none' && !isLocalVideoOff) {
          startSegmentationLoop();
        } else {
          if (localOutputCanvas) localOutputCanvas.style.display = 'none';
          localVideo.style.display = (webrtc && webrtc.isVideoOff) ? 'none' : 'block';
        }
      }
    }

    recalculateGridLayout();
  }

  // Toolbar Actions
  btnToggleMic.addEventListener('click', () => {
    if (jitsiApi) {
      jitsiApi.executeCommand('toggleAudio');
    } else if (webrtc) {
      webrtc.toggleAudio();
    }
  });

  btnToggleCam.addEventListener('click', async () => {
    if (jitsiApi) {
      jitsiApi.executeCommand('toggleVideo');
    } else if (webrtc) {
      const isOff = await webrtc.toggleVideo();
      if (!isOff && localVideo && (webrtc.rawCameraStream || webrtc.localStream)) {
        localVideo.srcObject = webrtc.rawCameraStream || webrtc.localStream;
        localVideo.play().catch(e => console.warn('Local video play error:', e));
        if (activeBgEffect.type !== 'none') {
          startSegmentationLoop();
        }
      }
    }
  });

  btnToggleScreen.addEventListener('click', async () => {
    if (jitsiApi) {
      jitsiApi.executeCommand('toggleShareScreen');
    } else if (webrtc) {
      if (!isLocalScreenSharing && activeScreenSharerId && activeScreenSharerId !== 'local') {
        showToast('Starting your screen share...', 'info');
      }
      await webrtc.toggleScreenShare();
    }
  });

  // Raise Hand Controls
  function updateRaiseHandUI(isRaised) {
    isLocalHandRaised = Boolean(isRaised);
    if (btnRaiseHand) {
      if (isLocalHandRaised) {
        btnRaiseHand.classList.add('active', 'hand-raised');
        btnRaiseHand.setAttribute('data-tooltip', 'Lower Hand (H)');
        btnRaiseHand.title = 'Lower Hand';
      } else {
        btnRaiseHand.classList.remove('active', 'hand-raised');
        btnRaiseHand.setAttribute('data-tooltip', 'Raise Hand (H)');
        btnRaiseHand.title = 'Raise Hand';
      }
    }
    const badge = document.getElementById('localTileHandBadge');
    if (badge) {
      badge.style.display = isLocalHandRaised ? 'inline-flex' : 'none';
    }
    updateParticipantsList();
  }

  function toggleRaiseHand(forceState = null) {
    const nextState = forceState !== null ? forceState : !isLocalHandRaised;
    updateRaiseHandUI(nextState);

    if (nextState) {
      soundFx.playReaction();
      showFloatingReaction('✋');
      showToast('You raised your hand ✋', 'info');
    } else {
      showToast('You lowered your hand', 'info');
    }

    if (jitsiApi) {
      try {
        jitsiApi.executeCommand('toggleRaiseHand');
      } catch (e) {}
    }

    if (socket) {
      socket.emit('peer-raise-hand', {
        roomId,
        isRaised: nextState
      });
      socket.emit('media-toggle', { type: 'hand', enabled: nextState });
      if (nextState) {
        socket.emit('send-reaction', { emoji: '✋' });
      }
    }
  }

  if (btnRaiseHand) {
    btnRaiseHand.addEventListener('click', () => toggleRaiseHand());
  }

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
    if (typeof closeBackgroundEffects === 'function') {
      closeBackgroundEffects();
    }
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

  // ========================================================================
  // Inbuilt Video Effects & Backgrounds Module (Teams & Zoom Style)
  // AI MediaPipe Selfie Segmentation: Real-time person detection, sharp human tracking,
  // motion compensation, background blur & virtual backdrop compositing
  // ========================================================================
  let isBgPanelOpen = false;
  let isEffectsPopoverOpen = false;
  let bgPreviewStream = null;

  const localOutputCtx = localOutputCanvas ? localOutputCanvas.getContext('2d') : null;
  const bgPreviewCtx = bgPreviewCanvas ? bgPreviewCanvas.getContext('2d') : null;

  // Active virtual background state
  let activeBgEffect = {
    type: 'none',
    value: 'none',
    title: 'None'
  };

  try {
    const saved = localStorage.getItem('meet_selected_bg');
    if (saved) activeBgEffect = JSON.parse(saved);
  } catch (e) {}

  // Inbuilt Video Filter Preferences (auto-restored from localStorage like Teams/Zoom)
  let videoFilterSettings = {
    adjustBrightness: false,
    softFocus: true,
    softFocusIntensity: 50,
    selectedCameraId: 'default'
  };

  try {
    const savedFilter = localStorage.getItem('meet_inbuilt_video_effects');
    if (savedFilter) {
      videoFilterSettings = Object.assign(videoFilterSettings, JSON.parse(savedFilter));
    }
  } catch (e) {}

  function saveVideoFilterSettings() {
    try {
      localStorage.setItem('meet_inbuilt_video_effects', JSON.stringify(videoFilterSettings));
    } catch (e) {}
  }

  function escapeHtml(str) {
    if (!str) return '';
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }

  // Virtual background image loader & caching
  let loadedVirtualBgImg = null;

  function loadVirtualBgImage(url) {
    if (!url || url === 'none') {
      loadedVirtualBgImg = null;
      return;
    }
    const img = new Image();
    if (/^https?:\/\//i.test(url) && !url.startsWith(window.location.origin)) {
      img.crossOrigin = 'anonymous';
    }
    img.onload = () => {
      loadedVirtualBgImg = img;
    };
    img.onerror = () => {
      if (img.crossOrigin) {
        img.crossOrigin = null;
        img.src = url;
      }
    };
    img.src = url;
    if (img.complete && (img.naturalWidth > 0 || img.width > 0)) {
      loadedVirtualBgImg = img;
    }
  }

  if (activeBgEffect.type === 'image' && activeBgEffect.value) {
    loadVirtualBgImage(activeBgEffect.value);
  }

  // Combined real-time filter application (Brightness, Soft Focus, Decorate)
  function applyLocalVideoEnhancements() {
    let filterParts = [];

    // 1. Inbuilt Adjust Brightness (auto light compensation like Teams/Zoom)
    if (videoFilterSettings.adjustBrightness) {
      filterParts.push('brightness(1.15) contrast(1.06) saturate(1.04)');
    }

    // 2. Inbuilt Soft Focus (Zoom/Teams touch up appearance / skin smoothing)
    if (videoFilterSettings.softFocus) {
      const intensity = Math.min(100, Math.max(0, videoFilterSettings.softFocusIntensity ?? 50));
      const blurPx = (intensity / 100) * 1.2;
      filterParts.push(`blur(${blurPx.toFixed(2)}px) contrast(0.98)`);
    }

    // 3. Decorate / Studio filter
    if (activeBgEffect.type === 'decorate') {
      filterParts.push('brightness(1.16) contrast(1.08) saturate(1.12)');
    }

    const filterString = filterParts.length > 0 ? filterParts.join(' ') : 'none';

    // Apply to local WebRTC video and canvases
    if (localVideo) localVideo.style.filter = filterString;
    if (localOutputCanvas) localOutputCanvas.style.filter = filterString;
    if (bgPreviewVideo) bgPreviewVideo.style.filter = filterString;
    if (bgPreviewCanvas) bgPreviewCanvas.style.filter = filterString;

    // Apply to Jitsi container/iframe if in Jitsi mode
    const jitsiIframe = document.querySelector('#jitsiMeetContainer iframe');
    if (jitsiIframe) {
      let jitsiFilters = [];
      if (videoFilterSettings.adjustBrightness) jitsiFilters.push('brightness(1.12) contrast(1.05)');
      if (videoFilterSettings.softFocus) {
        const blurPx = ((videoFilterSettings.softFocusIntensity ?? 50) / 100) * 0.7;
        jitsiFilters.push(`blur(${blurPx.toFixed(2)}px)`);
      }
      if (activeBgEffect.type === 'decorate') jitsiFilters.push('saturate(1.1)');
      jitsiIframe.style.filter = jitsiFilters.length > 0 ? jitsiFilters.join(' ') : 'none';
    }
  }

  // ========================================================================
  // MediaPipe Selfie Segmentation Engine (Live Human Foreground / Motion Blur)
  // ========================================================================
  let selfieSegmentation = null;
  let isMediaPipeReady = false;
  let isMediaPipeInitializing = false;
  let segmentationLoopRunning = false;
  let hasAiSegmentationResults = false;
  let isCanvasStreamAttached = false;
  let lastSegmentationSendTime = 0;

  function initMediaPipeSelfieSegmentation() {
    if (selfieSegmentation || isMediaPipeInitializing) return;
    if (typeof window.SelfieSegmentation === 'undefined') {
      console.warn('SelfieSegmentation library not loaded yet on window.');
      return;
    }

    isMediaPipeInitializing = true;
    try {
      // Prefer fast local assets (instant 0ms latency, works offline), fallback to jsDelivr CDN
      selfieSegmentation = new window.SelfieSegmentation({
        locateFile: (file) => `assets/mediapipe/${file}`
      });
      selfieSegmentation.setOptions({
        modelSelection: 1, // landscape model for webcams
        selfieMode: false
      });
      selfieSegmentation.onResults(onSelfieSegmentationResults);
      isMediaPipeReady = true;
      isMediaPipeInitializing = false;
      console.log('Local MediaPipe Selfie Segmentation initialized.');
    } catch (err) {
      console.warn('Local MediaPipe failed, trying CDN fallback:', err);
      try {
        selfieSegmentation = new window.SelfieSegmentation({
          locateFile: (file) => `https://cdn.jsdelivr.net/npm/@mediapipe/selfie_segmentation/${file}`
        });
        selfieSegmentation.setOptions({ modelSelection: 1, selfieMode: false });
        selfieSegmentation.onResults(onSelfieSegmentationResults);
        isMediaPipeReady = true;
        isMediaPipeInitializing = false;
        console.log('CDN MediaPipe Selfie Segmentation initialized.');
      } catch (e2) {
        isMediaPipeInitializing = false;
        console.error('All MediaPipe SelfieSegmentation initializations failed:', e2);
      }
    }
  }

  // Fast crash-proof compositor: Renders immediately on canvas while AI mask is warming up or if AI is unavailable
  function renderFallbackFrame(ctx, canvas, sourceVideo) {
    if (!ctx || !canvas || !sourceVideo) return;
    const w = canvas.width;
    const h = canvas.height;
    if (w === 0 || h === 0) return;

    ctx.save();
    ctx.clearRect(0, 0, w, h);

    if (activeBgEffect.type === 'blur') {
      const isStrong = activeBgEffect.value === 'strong';
      const blurPx = isStrong ? '18px' : '8px';
      ctx.filter = `blur(${blurPx})`;
      ctx.drawImage(sourceVideo, 0, 0, w, h);
      ctx.filter = 'none';
    } else if (activeBgEffect.type === 'image') {
      if (loadedVirtualBgImg && loadedVirtualBgImg.complete && (loadedVirtualBgImg.naturalWidth > 0 || loadedVirtualBgImg.width > 0)) {
        // Draw the virtual background
        ctx.drawImage(loadedVirtualBgImg, 0, 0, w, h);
        // Draw centered user video with a soft feathered oval crop so the user is visible while AI initializes
        ctx.save();
        ctx.beginPath();
        ctx.ellipse(w / 2, h * 0.55, w * 0.35, h * 0.45, 0, 0, Math.PI * 2);
        ctx.clip();
        ctx.drawImage(sourceVideo, 0, 0, w, h);
        ctx.restore();
      } else {
        ctx.filter = 'blur(16px)';
        ctx.drawImage(sourceVideo, 0, 0, w, h);
        ctx.filter = 'none';
      }
    } else if (activeBgEffect.type === 'decorate') {
      ctx.filter = 'blur(10px) brightness(1.15) saturate(1.2)';
      ctx.drawImage(sourceVideo, 0, 0, w, h);
      ctx.filter = 'none';
    } else {
      ctx.drawImage(sourceVideo, 0, 0, w, h);
    }

    ctx.restore();
  }

  // Compositor: Draws sharp human foreground, and blur/virtual scene around human using Google MediaPipe compositing
  function renderSegmentedFrame(ctx, canvas, results) {
    if (!ctx || !canvas || !results) return;
    const w = canvas.width;
    const h = canvas.height;
    if (w === 0 || h === 0) return;

    ctx.save();
    ctx.clearRect(0, 0, w, h);

    // 1. Draw human segmentation mask (white silhouette of person)
    ctx.drawImage(results.segmentationMask, 0, 0, w, h);

    // 2. Draw replacement background into surroundings ('source-out' fills ONLY where mask is absent)
    ctx.globalCompositeOperation = 'source-out';

    if (activeBgEffect.type === 'blur') {
      const isStrong = activeBgEffect.value === 'strong';
      const blurPx = isStrong ? '22px' : '10px';
      ctx.filter = `blur(${blurPx})`;
      ctx.drawImage(results.image, 0, 0, w, h);
      ctx.filter = 'none';
    } else if (activeBgEffect.type === 'image') {
      if (loadedVirtualBgImg && loadedVirtualBgImg.complete && (loadedVirtualBgImg.naturalWidth > 0 || loadedVirtualBgImg.width > 0)) {
        ctx.drawImage(loadedVirtualBgImg, 0, 0, w, h);
      } else {
        ctx.filter = 'blur(16px)';
        ctx.drawImage(results.image, 0, 0, w, h);
        ctx.filter = 'none';
      }
    } else if (activeBgEffect.type === 'decorate') {
      // Warm studio ambient glow around person
      ctx.filter = 'blur(14px) brightness(1.2) saturate(1.25)';
      ctx.drawImage(results.image, 0, 0, w, h);
      ctx.filter = 'none';
    }

    // 3. Composite original video onto the human silhouette ('destination-atop' keeps sharp foreground person)
    ctx.globalCompositeOperation = 'destination-atop';
    ctx.drawImage(results.image, 0, 0, w, h);

    ctx.restore();
  }

  function attachCanvasStreamToPeers() {
    if (isCanvasStreamAttached || activeBgEffect.type === 'none' || isLocalVideoOff || isLocalScreenSharing) return;
    if (!localOutputCanvas || !localOutputCanvas.captureStream || !webrtc) return;
    try {
      const processedStream = localOutputCanvas.captureStream(30);
      const track = processedStream.getVideoTracks()[0];
      if (track) {
        isCanvasStreamAttached = true;
        webrtc.replaceVideoTrackInPeers(track);
      }
    } catch (e) {
      console.warn('Canvas stream capture error:', e);
    }
  }

  function onSelfieSegmentationResults(results) {
    hasAiSegmentationResults = true;

    // Render to main meeting room local canvas
    if (localOutputCanvas && localOutputCtx && localOutputCanvas.style.display !== 'none') {
      renderSegmentedFrame(localOutputCtx, localOutputCanvas, results);
      attachCanvasStreamToPeers();
    }
    // Render to preview canvas if drawer is open
    if (bgPreviewCanvas && bgPreviewCtx && isBgPanelOpen && bgPreviewCanvas.style.display !== 'none') {
      renderSegmentedFrame(bgPreviewCtx, bgPreviewCanvas, results);
    }
    // Render to prejoin canvas if pre-meeting setup is active
    if (prejoinCanvas && prejoinCtx && isPrejoinActive && prejoinCanvas.style.display !== 'none') {
      renderSegmentedFrame(prejoinCtx, prejoinCanvas, results);
    }
  }

  async function processSegmentationFrame() {
    const isCamEffectOff = isPrejoinActive ? (!prejoinCamToggle || !prejoinCamToggle.checked) : isLocalVideoOff;
    if (!segmentationLoopRunning || activeBgEffect.type === 'none' || isCamEffectOff || isLocalScreenSharing) {
      segmentationLoopRunning = false;
      isCanvasStreamAttached = false;
      hasAiSegmentationResults = false;
      if (localOutputCanvas) localOutputCanvas.style.display = 'none';
      if (bgPreviewCanvas) bgPreviewCanvas.style.display = 'none';
      if (prejoinCanvas) prejoinCanvas.style.display = 'none';

      // Restore raw track in WebRTC only if not actively sharing screen
      if (!isLocalScreenSharing && webrtc) {
        if (typeof webrtc.restoreRawCameraTrackInPeers === 'function') {
          webrtc.restoreRawCameraTrackInPeers();
        } else if (webrtc.localStream) {
          const rawTrack = webrtc.localStream.getVideoTracks()[0];
          if (rawTrack) webrtc.replaceVideoTrackInPeers(rawTrack);
        }
      }
      return;
    }

    if (!isMediaPipeReady) {
      initMediaPipeSelfieSegmentation();
    }

    const sourceVideo = (localVideo && localVideo.readyState >= 2 && !localVideo.paused)
      ? localVideo
      : ((bgPreviewVideo && bgPreviewVideo.readyState >= 2 && !bgPreviewVideo.paused)
          ? bgPreviewVideo
          : ((prejoinVideo && prejoinVideo.readyState >= 2 && !prejoinVideo.paused) ? prejoinVideo : null));

    if (sourceVideo && sourceVideo.videoWidth > 0) {
      const vw = sourceVideo.videoWidth;
      const vh = sourceVideo.videoHeight;

      if (localOutputCanvas && !isPrejoinActive) {
        if (localOutputCanvas.width !== vw || localOutputCanvas.height !== vh) {
          localOutputCanvas.width = vw;
          localOutputCanvas.height = vh;
        }
        localOutputCanvas.style.display = 'block';
        // Keep localVideo.style.display = 'block' so browser never pauses hardware video decoder!
      }

      if (bgPreviewCanvas && isBgPanelOpen) {
        if (bgPreviewCanvas.width !== vw || bgPreviewCanvas.height !== vh) {
          bgPreviewCanvas.width = vw;
          bgPreviewCanvas.height = vh;
        }
        bgPreviewCanvas.style.display = 'block';
      }

      if (prejoinCanvas && isPrejoinActive) {
        if (prejoinCanvas.width !== vw || prejoinCanvas.height !== vh) {
          prejoinCanvas.width = vw;
          prejoinCanvas.height = vh;
        }
        prejoinCanvas.style.display = 'block';
      }

      // If MediaPipe hasn't output AI frames yet, render instant fallback frame so video NEVER freezes or blanks
      if (!hasAiSegmentationResults) {
        if (localOutputCanvas && !isPrejoinActive) {
          renderFallbackFrame(localOutputCtx, localOutputCanvas, sourceVideo);
          attachCanvasStreamToPeers();
        }
        if (bgPreviewCanvas && isBgPanelOpen) {
          renderFallbackFrame(bgPreviewCtx, bgPreviewCanvas, sourceVideo);
        }
        if (prejoinCanvas && isPrejoinActive) {
          renderFallbackFrame(prejoinCtx, prejoinCanvas, sourceVideo);
        }
      }

      // Feed frame to MediaPipe SelfieSegmentation
      if (selfieSegmentation && isMediaPipeReady) {
        const now = performance.now();
        if (now - lastSegmentationSendTime >= 30) {
          lastSegmentationSendTime = now;
          try {
            await selfieSegmentation.send({ image: sourceVideo });
          } catch (err) {}
        }
      }
    }

    if (segmentationLoopRunning) {
      if ('requestVideoFrameCallback' in HTMLVideoElement.prototype && sourceVideo) {
        sourceVideo.requestVideoFrameCallback(processSegmentationFrame);
      } else {
        requestAnimationFrame(processSegmentationFrame);
      }
    }
  }

  function startSegmentationLoop() {
    if (activeBgEffect.type === 'none' || isLocalVideoOff || isLocalScreenSharing) return;
    isCanvasStreamAttached = false;
    hasAiSegmentationResults = false;
    if (activeBgEffect.type === 'image') {
      loadVirtualBgImage(activeBgEffect.value);
    }
    if (!isMediaPipeReady) {
      initMediaPipeSelfieSegmentation();
    }
    if (!segmentationLoopRunning) {
      segmentationLoopRunning = true;
      processSegmentationFrame();
    }
  }

  // Camera device enumeration and switching
  async function populateCameraDevices() {
    if (!navigator.mediaDevices || !navigator.mediaDevices.enumerateDevices) return;
    try {
      const devices = await navigator.mediaDevices.enumerateDevices();
      const videoDevices = devices.filter(d => d.kind === 'videoinput');
      if (videoDevices.length > 0 && cameraDeviceList) {
        cameraDeviceList.innerHTML = videoDevices.map((dev, idx) => {
          const label = dev.label || `Camera ${idx + 1}`;
          const isChecked = (videoFilterSettings.selectedCameraId === dev.deviceId) || (idx === 0 && (!videoFilterSettings.selectedCameraId || videoFilterSettings.selectedCameraId === 'default'));
          return `
            <label class="teams-camera-radio">
              <input type="radio" name="cameraDeviceRadio" value="${escapeHtml(dev.deviceId)}" ${isChecked ? 'checked' : ''}>
              <span class="teams-camera-name" title="${escapeHtml(label)}">${escapeHtml(label)}</span>
            </label>
          `;
        }).join('');

        cameraDeviceList.querySelectorAll('input[name="cameraDeviceRadio"]').forEach(radio => {
          radio.addEventListener('change', async (e) => {
            const devId = e.target.value;
            videoFilterSettings.selectedCameraId = devId;
            saveVideoFilterSettings();
            await switchCameraDevice(devId);
          });
        });
      }
    } catch (err) {
      console.warn('Could not enumerate video devices:', err);
    }
  }

  async function switchCameraDevice(deviceId) {
    if (jitsiApi) {
      try {
        if (typeof jitsiApi.setVideoInputDevice === 'function') {
          jitsiApi.setVideoInputDevice('', deviceId);
        }
      } catch (e) {}
    } else if (webrtc) {
      try {
        const constraints = {
          video: deviceId === 'default' ? true : { deviceId: { exact: deviceId } },
          audio: false
        };
        const newStream = await navigator.mediaDevices.getUserMedia(constraints);
        const newTrack = newStream.getVideoTracks()[0];
        if (newTrack && webrtc.localStream) {
          const oldTrack = webrtc.localStream.getVideoTracks()[0];
          if (oldTrack) {
            webrtc.localStream.removeTrack(oldTrack);
            oldTrack.stop();
          }
          webrtc.localStream.addTrack(newTrack);
          webrtc.rawCameraTrack = newTrack;
          webrtc.rawCameraStream = new MediaStream([newTrack]);
          if (localVideo) {
            localVideo.srcObject = webrtc.rawCameraStream;
            localVideo.play().catch(() => {});
          }
          applyLocalVideoEnhancements();
          if (activeBgEffect.type !== 'none') {
            isCanvasStreamAttached = false;
            startSegmentationLoop();
          } else {
            webrtc.replaceVideoTrackInPeers(newTrack);
          }
        }
      } catch (err) {
        console.warn('Could not switch camera device:', err);
      }
    }
  }

  // Teams/Zoom Popover Controls
  function toggleTeamsEffectsPopover() {
    if (!cameraEffectsPopover) return;
    if (isEffectsPopoverOpen) {
      closeTeamsEffectsPopover();
    } else {
      openTeamsEffectsPopover();
    }
  }

  function openTeamsEffectsPopover() {
    if (!cameraEffectsPopover) return;
    cameraEffectsPopover.classList.add('open');
    if (btnCamEffectsTrigger) btnCamEffectsTrigger.classList.add('active');
    isEffectsPopoverOpen = true;
    populateCameraDevices();
    updatePreviewDisplay();
  }

  function closeTeamsEffectsPopover() {
    if (!cameraEffectsPopover) return;
    cameraEffectsPopover.classList.remove('open');
    if (btnCamEffectsTrigger) btnCamEffectsTrigger.classList.remove('active');
    isEffectsPopoverOpen = false;
  }

  function toggleBackgroundEffects() {
    if (!backgroundEffectsPanel) return;
    if (isBgPanelOpen) {
      closeBackgroundEffects();
    } else {
      openBackgroundEffects();
    }
  }

  function openBackgroundEffects() {
    if (!backgroundEffectsPanel) return;
    if (sideDrawer && sideDrawer.classList.contains('open')) {
      closeDrawer();
    }
    backgroundEffectsPanel.style.display = 'flex';
    requestAnimationFrame(() => {
      backgroundEffectsPanel.classList.add('open');
    });
    if (btnToggleBackgrounds) btnToggleBackgrounds.classList.add('active');
    isBgPanelOpen = true;
    startBgPreviewCamera();
    renderCustomBackgrounds();
    updatePreviewDisplay();
    if (activeBgEffect.type !== 'none') {
      startSegmentationLoop();
    }
  }

  function closeBackgroundEffects() {
    if (!backgroundEffectsPanel) return;
    backgroundEffectsPanel.classList.remove('open');
    if (btnToggleBackgrounds) btnToggleBackgrounds.classList.remove('active');
    isBgPanelOpen = false;
    setTimeout(() => {
      if (!isBgPanelOpen && backgroundEffectsPanel) {
        backgroundEffectsPanel.style.display = 'none';
      }
    }, 350);
    stopBgPreviewCamera();
  }

  async function startBgPreviewCamera() {
    if (!bgPreviewVideo) return;

    if (isPrejoinActive) {
      if (!prejoinCamToggle || !prejoinCamToggle.checked) {
        if (bgPreviewPlaceholder) bgPreviewPlaceholder.style.display = 'flex';
        bgPreviewVideo.style.display = 'none';
        if (bgPreviewCanvas) bgPreviewCanvas.style.display = 'none';
        return;
      }
      if (prejoinStream && prejoinStream.getVideoTracks().length > 0) {
        if (bgPreviewPlaceholder) bgPreviewPlaceholder.style.display = 'none';
        bgPreviewVideo.srcObject = prejoinStream;
        bgPreviewVideo.style.display = 'block';
        bgPreviewVideo.play().catch(() => {});
        return;
      }
    }

    if (isLocalVideoOff) {
      if (bgPreviewPlaceholder) bgPreviewPlaceholder.style.display = 'flex';
      bgPreviewVideo.style.display = 'none';
      if (bgPreviewCanvas) bgPreviewCanvas.style.display = 'none';
      return;
    }

    if (bgPreviewPlaceholder) bgPreviewPlaceholder.style.display = 'none';

    try {
      const liveStream = (webrtc && webrtc.rawCameraStream) ? webrtc.rawCameraStream : (webrtc && webrtc.localStream ? webrtc.localStream : null);
      if (liveStream && liveStream.getVideoTracks().length > 0) {
        bgPreviewVideo.srcObject = liveStream;
      } else if (!bgPreviewStream) {
        bgPreviewStream = await navigator.mediaDevices.getUserMedia({
          video: { width: { ideal: 640 }, height: { ideal: 360 } },
          audio: false
        }).catch(() => navigator.mediaDevices.getUserMedia({ video: true }));
        bgPreviewVideo.srcObject = bgPreviewStream;
      } else {
        bgPreviewVideo.srcObject = bgPreviewStream;
      }
      bgPreviewVideo.play().catch(() => {});
    } catch (err) {
      console.warn('Could not acquire local preview stream:', err);
      if (bgPreviewPlaceholder) bgPreviewPlaceholder.style.display = 'flex';
    }

    updatePreviewDisplay();
  }

  function stopBgPreviewCamera() {
    if (bgPreviewStream && (!webrtc || webrtc.localStream !== bgPreviewStream)) {
      bgPreviewStream.getTracks().forEach(t => t.stop());
      bgPreviewStream = null;
    }
    if (bgPreviewVideo) bgPreviewVideo.srcObject = null;
    if (bgPreviewCanvas) bgPreviewCanvas.style.display = 'none';
  }

  function updatePreviewDisplay() {
    if (bgPreviewStatusLabel) {
      bgPreviewStatusLabel.textContent = activeBgEffect.title || 'None';
    }

    // Apply combined filters (brightness, soft focus, decorate)
    applyLocalVideoEnhancements();

    // Trigger AI segmentation if active
    if (activeBgEffect.type !== 'none' && !isLocalVideoOff) {
      startSegmentationLoop();
    } else {
      segmentationLoopRunning = false;
      isCanvasStreamAttached = false;
      hasAiSegmentationResults = false;
      if (localOutputCanvas) localOutputCanvas.style.display = 'none';
      if (localVideo) localVideo.style.display = isLocalVideoOff ? 'none' : 'block';
      if (bgPreviewCanvas) bgPreviewCanvas.style.display = 'none';
      if (bgPreviewVideo) bgPreviewVideo.style.display = isLocalVideoOff ? 'none' : 'block';
      if (webrtc && typeof webrtc.restoreRawCameraTrackInPeers === 'function') {
        webrtc.restoreRawCameraTrackInPeers();
      }
    }

    // Update active highlight classes on drawer buttons
    document.querySelectorAll('.bg-option-card, .bg-virtual-card').forEach(card => {
      const type = card.getAttribute('data-bg-type');
      const val = card.getAttribute('data-bg-value');
      if (type === activeBgEffect.type && val === activeBgEffect.value) {
        card.classList.add('active');
      } else {
        card.classList.remove('active');
      }
    });

    // Update active highlight classes on Teams popover cards
    document.querySelectorAll('.teams-bg-card').forEach(card => {
      const type = card.getAttribute('data-bg-type');
      const val = card.getAttribute('data-bg-value');
      if (type === activeBgEffect.type && val === activeBgEffect.value) {
        card.classList.add('active');
      } else {
        card.classList.remove('active');
      }
    });
  }

  function applyBackgroundEffect(type, value, title, isInitialJoin = false) {
    activeBgEffect = {
      type,
      value,
      title: title || (type === 'none' ? 'None' : (type === 'blur' ? `${value === 'strong' ? 'Strong' : 'Light'} Blur` : (type === 'decorate' ? 'Decorate' : 'Virtual Scene')))
    };
    try {
      localStorage.setItem('meet_selected_bg', JSON.stringify(activeBgEffect));
    } catch (e) {}

    if (type === 'image') {
      loadVirtualBgImage(value);
    }

    updatePreviewDisplay();

    // 1. Send command to Jitsi External API if present
    if (jitsiApi) {
      try {
        if (type === 'none') {
          jitsiApi.executeCommand('setVirtualBackground', false);
          jitsiApi.executeCommand('setVideoBackgroundEffect', {
            enabled: false,
            backgroundEffectEnabled: false
          });
        } else if (type === 'blur') {
          const isStrong = value === 'strong';
          jitsiApi.executeCommand('setVirtualBackground', true, 'blur');
          jitsiApi.executeCommand('setVideoBackgroundEffect', {
            enabled: true,
            backgroundEffectEnabled: true,
            backgroundType: 'BLUR',
            blurValue: isStrong ? 25 : 8
          });
        } else if (type === 'decorate') {
          jitsiApi.executeCommand('setVirtualBackground', true, 'blur');
          jitsiApi.executeCommand('setVideoBackgroundEffect', {
            enabled: true,
            backgroundEffectEnabled: true,
            backgroundType: 'BLUR',
            blurValue: 8
          });
        } else if (type === 'image') {
          const fullUrl = value.startsWith('data:') ? value : (window.location.origin + '/' + value.replace(/^\//, ''));
          jitsiApi.executeCommand('setVirtualBackground', true, fullUrl);
          jitsiApi.executeCommand('setVideoBackgroundEffect', {
            enabled: true,
            backgroundEffectEnabled: true,
            backgroundType: 'IMAGE',
            virtualBackground: {
              backgroundType: 'image',
              virtualSource: fullUrl
            }
          });
        }
      } catch (err) {
        console.warn('Jitsi setVirtualBackground call warning:', err);
      }
    }

    if (!isInitialJoin) {
      showToast(`Filter applied: ${activeBgEffect.title}`, 'info');
    }
  }

  function renderCustomBackgrounds() {
    if (!customBackgroundsContainer) return;
    let list = [];
    try {
      list = JSON.parse(localStorage.getItem('meet_custom_bg_list') || '[]');
    } catch (e) {
      list = [];
    }

    if (list.length === 0) {
      customBackgroundsContainer.innerHTML = '';
      return;
    }

    customBackgroundsContainer.innerHTML = list.map((item, idx) => {
      const isActive = (activeBgEffect.type === 'image' && activeBgEffect.value === item.dataUrl);
      return `
        <button type="button" class="bg-virtual-card ${isActive ? 'active' : ''}" data-bg-type="image" data-bg-value="${escapeHtml(item.dataUrl)}" data-bg-title="${escapeHtml(item.name || 'Custom Image')}">
          <div class="bg-virtual-thumb" style="background-image: url('${escapeHtml(item.dataUrl)}');">
            <div class="bg-card-check">✓</div>
            <span class="bg-custom-del-btn" data-del-idx="${idx}" title="Remove custom background">✕</span>
          </div>
          <span class="bg-virtual-label">${escapeHtml(item.name || 'Custom Image')}</span>
        </button>
      `;
    }).join('');

    // Attach click listeners to custom cards
    customBackgroundsContainer.querySelectorAll('.bg-virtual-card').forEach(card => {
      card.addEventListener('click', (e) => {
        const delBtn = e.target.closest('.bg-custom-del-btn');
        if (delBtn) {
          e.stopPropagation();
          const delIdx = parseInt(delBtn.getAttribute('data-del-idx'), 10);
          deleteCustomBackground(delIdx);
          return;
        }
        const val = card.getAttribute('data-bg-value');
        const title = card.getAttribute('data-bg-title');
        applyBackgroundEffect('image', val, title);
      });
    });
  }

  function deleteCustomBackground(idx) {
    try {
      let list = JSON.parse(localStorage.getItem('meet_custom_bg_list') || '[]');
      const removed = list.splice(idx, 1)[0];
      localStorage.setItem('meet_custom_bg_list', JSON.stringify(list));
      if (removed && activeBgEffect.value === removed.dataUrl) {
        applyBackgroundEffect('none', 'none', 'None');
      }
      renderCustomBackgrounds();
      showToast('Custom background removed.', 'info');
    } catch (e) {}
  }

  // Toolbar & Popover Button triggers
  if (btnCamEffectsTrigger) {
    btnCamEffectsTrigger.addEventListener('click', (e) => {
      e.stopPropagation();
      toggleTeamsEffectsPopover();
    });
  }

  if (btnCloseEffectsPopover) {
    btnCloseEffectsPopover.addEventListener('click', (e) => {
      e.stopPropagation();
      closeTeamsEffectsPopover();
    });
  }

  if (btnTeamsMoreEffects) {
    btnTeamsMoreEffects.addEventListener('click', (e) => {
      e.stopPropagation();
      closeTeamsEffectsPopover();
      openBackgroundEffects();
    });
  }

  if (cameraEffectsPopover) {
    cameraEffectsPopover.addEventListener('click', (e) => {
      e.stopPropagation();
    });
  }

  document.addEventListener('click', (e) => {
    if (isEffectsPopoverOpen && cameraEffectsPopover) {
      if (!cameraEffectsPopover.contains(e.target) && !btnCamEffectsTrigger?.contains(e.target) && !btnToggleBackgrounds?.contains(e.target)) {
        closeTeamsEffectsPopover();
      }
    }
  });

  // Teams Popover Background Presets Click Listeners
  document.querySelectorAll('.teams-bg-card').forEach(card => {
    card.addEventListener('click', () => {
      const type = card.getAttribute('data-bg-type');
      const val = card.getAttribute('data-bg-value');
      const title = card.getAttribute('title') || 'Background';
      applyBackgroundEffect(type, val, title);
    });
  });

  // Adjust Brightness Switch
  if (teamsAdjustBrightness) {
    teamsAdjustBrightness.checked = Boolean(videoFilterSettings.adjustBrightness);
    teamsAdjustBrightness.addEventListener('change', (e) => {
      videoFilterSettings.adjustBrightness = e.target.checked;
      saveVideoFilterSettings();
      applyLocalVideoEnhancements();
      showToast(e.target.checked ? 'Brightness auto-adjustment enabled' : 'Brightness auto-adjustment disabled', 'info');
    });
  }

  // Soft Focus (Skin smoothing touch-up) Switch & Slider
  if (teamsSoftFocus) {
    teamsSoftFocus.checked = Boolean(videoFilterSettings.softFocus);
    teamsSoftFocus.addEventListener('change', (e) => {
      videoFilterSettings.softFocus = e.target.checked;
      if (teamsSoftFocusControl) {
        if (e.target.checked) teamsSoftFocusControl.classList.remove('disabled');
        else teamsSoftFocusControl.classList.add('disabled');
      }
      saveVideoFilterSettings();
      applyLocalVideoEnhancements();
      showToast(e.target.checked ? 'Soft focus enabled' : 'Soft focus disabled', 'info');
    });
  }

  if (teamsSoftFocusRange) {
    teamsSoftFocusRange.value = videoFilterSettings.softFocusIntensity ?? 50;
    teamsSoftFocusRange.addEventListener('input', (e) => {
      videoFilterSettings.softFocusIntensity = parseInt(e.target.value, 10);
      saveVideoFilterSettings();
      applyLocalVideoEnhancements();
    });
  }

  if (teamsSoftFocusControl && teamsSoftFocus) {
    if (!teamsSoftFocus.checked) {
      teamsSoftFocusControl.classList.add('disabled');
    }
  }

  if (btnToggleBackgrounds) {
    btnToggleBackgrounds.addEventListener('click', (e) => {
      e.stopPropagation();
      toggleTeamsEffectsPopover();
    });
  }

  if (btnCloseBgEffects) {
    btnCloseBgEffects.addEventListener('click', closeBackgroundEffects);
  }
  if (btnResetBackground) {
    btnResetBackground.addEventListener('click', () => {
      applyBackgroundEffect('none', 'none', 'None');
    });
  }

  // Setup Blur / None Cards click listeners (Drawer)
  document.querySelectorAll('.bg-blur-grid .bg-option-card').forEach(card => {
    card.addEventListener('click', () => {
      const type = card.getAttribute('data-bg-type');
      const val = card.getAttribute('data-bg-value');
      const name = card.querySelector('.bg-card-name') ? card.querySelector('.bg-card-name').textContent : val;
      applyBackgroundEffect(type, val, name);
    });
  });

  // Setup Virtual Background Cards click listeners (Drawer)
  document.querySelectorAll('.bg-virtual-grid .bg-virtual-card').forEach(card => {
    card.addEventListener('click', () => {
      const type = card.getAttribute('data-bg-type');
      const val = card.getAttribute('data-bg-value');
      const title = card.getAttribute('data-bg-title') || 'Virtual Scene';
      applyBackgroundEffect(type, val, title);
    });
  });

  // Auto-initialize device list & apply saved filters
  populateCameraDevices();
  applyLocalVideoEnhancements();
  updatePreviewDisplay();

  // Custom File Upload Trigger & Handler
  if (btnTriggerUpload && customBgFileInput) {
    btnTriggerUpload.addEventListener('click', () => {
      customBgFileInput.click();
    });

    customBgFileInput.addEventListener('change', (e) => {
      const file = e.target.files && e.target.files[0];
      if (!file) return;

      if (!file.type.startsWith('image/')) {
        showToast('Please upload an image file (PNG, JPG, WebP).', 'error');
        return;
      }

      if (file.size > 10 * 1024 * 1024) {
        showToast('Image size exceeds 10MB limit.', 'error');
        return;
      }

      const reader = new FileReader();
      reader.onload = (loadEvt) => {
        const dataUrl = loadEvt.target.result;
        const cleanName = file.name.replace(/\.[^/.]+$/, '');

        let list = [];
        try {
          list = JSON.parse(localStorage.getItem('meet_custom_bg_list') || '[]');
        } catch (err) {
          list = [];
        }

        list.unshift({
          id: 'bg_' + Date.now(),
          name: cleanName.length > 20 ? cleanName.substring(0, 18) + '...' : cleanName,
          dataUrl
        });

        // Keep up to 8 custom backgrounds
        if (list.length > 8) list.pop();

        localStorage.setItem('meet_custom_bg_list', JSON.stringify(list));
        renderCustomBackgrounds();
        applyBackgroundEffect('image', dataUrl, cleanName);
        customBgFileInput.value = '';
      };
      reader.readAsDataURL(file);
    });
  }

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
    try {
      const u = new URL(window.location.href);
      // Strip participant identity query parameters so invitees connect with their own accounts!
      u.searchParams.delete('asUser');
      u.searchParams.delete('user');
      u.searchParams.delete('name');
      u.searchParams.delete('id');
      u.searchParams.delete('userId');
      if (currentPasscode && !u.searchParams.has('passcode')) {
        u.searchParams.set('passcode', currentPasscode);
      }
      url = u.toString();
    } catch (e) {
      if (currentPasscode && !url.includes('passcode=')) {
        url += (url.includes('?') ? '&' : '?') + 'passcode=' + encodeURIComponent(currentPasscode);
      }
    }
    const isLocal = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1';
    let isNetworkResolved = false;
    let isTunnelResolved = false;

    // Prioritize active HTTPS Tunnel URL if known (localtunnel, ngrok, cloudflared) so external devices can join with camera & mic!
    if (window.SERVER_TUNNEL_URL && isLocal) {
      url = url.replace(/^(https?:\/\/)(localhost|127\.0\.0\.1)(:\d+)?/i, window.SERVER_TUNNEL_URL.replace(/\/$/, ''));
      isTunnelResolved = true;
    } else if (isLocal && window.SERVER_NETWORK_IP) {
      url = url.replace(/^(https?:\/\/)(localhost|127\.0\.0\.1)(:\d+)?/i, `$1${window.SERVER_NETWORK_IP}`);
      isNetworkResolved = true;
    }
    try {
      await navigator.clipboard.writeText(url);
      const msg = isTunnelResolved
        ? 'Public tunnel invite link copied! (Shareable anywhere over the internet like Zoom)'
        : (isNetworkResolved
          ? 'Meeting invite link copied! (Shareable with other devices on Wi-Fi)'
          : 'Meeting invite link copied to clipboard!');
      showToast(msg, 'success');
    } catch (e) {
      showToast('Could not copy automatically.', 'danger');
    }
  }

  if (roomTitleBadge) roomTitleBadge.addEventListener('click', copyMeetingLink);
  btnCopyInvite.addEventListener('click', copyMeetingLink);
  btnInviteFromPanel.addEventListener('click', copyMeetingLink);

  function notifyRoomDeparture() {
    try {
      const payload = JSON.stringify({ roomId, peerId: myPeerId, userId });
      if (navigator.sendBeacon) {
        navigator.sendBeacon('api/leave.php', payload);
      } else {
        fetch('api/leave.php', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: payload, keepalive: true }).catch(() => {});
      }
    } catch (e) {}
  }

  // Leave room
  btnLeaveRoom.addEventListener('click', () => {
    if (confirm('Are you sure you want to leave the meeting?')) {
      notifyRoomDeparture();
      if (jitsiApi) {
        try { jitsiApi.executeCommand('hangup'); } catch (e) {}
      }
      if (socket) {
        try { socket.emit('leave-room', { roomId, peerId: myPeerId, userId }); } catch (e) {}
        try { socket.disconnect(); } catch (e) {}
      }
      if (webrtc) {
        webrtc.destroy();
      }
      window.location.href = 'index.php';
    }
  });

  // Fullscreen action
  function toggleFullscreen() {
    if (!document.fullscreenElement) {
      const el = document.documentElement;
      if (el.requestFullscreen) {
        el.requestFullscreen().catch((err) => console.warn('Fullscreen request failed:', err));
      }
    } else {
      if (document.exitFullscreen) {
        document.exitFullscreen().catch((err) => console.warn('Exit fullscreen failed:', err));
      }
    }
  }

  if (btnToggleFullscreen) {
    btnToggleFullscreen.addEventListener('click', toggleFullscreen);
  }

  document.addEventListener('fullscreenchange', () => {
    const isFs = Boolean(document.fullscreenElement);
    if (btnToggleFullscreen) {
      btnToggleFullscreen.classList.toggle('active', isFs);
    }
    if (iconFullscreenEnter && iconFullscreenExit) {
      iconFullscreenEnter.style.display = isFs ? 'none' : 'block';
      iconFullscreenExit.style.display = isFs ? 'block' : 'none';
    }
  });

  // Jitsi Error State Actions (Retry & Fallback)
  if (btnRetryJitsi) {
    btnRetryJitsi.addEventListener('click', () => {
      if (jitsiErrorState) jitsiErrorState.style.display = 'none';
      if (jitsiLoadingOverlay) {
        jitsiLoadingOverlay.classList.remove('fade-out');
        jitsiLoadingOverlay.style.display = 'flex';
      }
      initJitsiMeeting();
    });
  }

  if (btnFallbackWebRTC) {
    btnFallbackWebRTC.addEventListener('click', () => {
      localStorage.setItem('meet_engine', 'webrtc');
      showToast('Switching to native WebRTC mesh...', 'info');
      setTimeout(() => window.location.reload(), 400);
    });
  }

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
    } else if (key === 'b') {
      toggleBackgroundEffects();
    } else if (key === 's') {
      if (jitsiApi) jitsiApi.executeCommand('toggleShareScreen');
      else if (webrtc) webrtc.toggleScreenShare();
    } else if (key === 'h') {
      toggleRaiseHand();
    } else if (key === 'f') {
      toggleFullscreen();
    } else if (key === 'c') {
      btnToggleChat.click();
    } else if (key === '?') {
      shortcutsModal.style.display = shortcutsModal.style.display === 'flex' ? 'none' : 'flex';
    }
  });

  // Handle tab switching / backgrounding so video never freezes
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) {
      // Tab is hidden (user switched to another website or minimized)
      // If camera is ON and not screensharing, route hardware camera track directly to peers
      // because Chrome suspends canvas requestAnimationFrame in background tabs
      if (webrtc && !isLocalVideoOff && !isLocalScreenSharing) {
        const rawTrack = webrtc.rawCameraTrack || (webrtc.rawCameraStream && webrtc.rawCameraStream.getVideoTracks()[0]);
        if (rawTrack && isCanvasStreamAttached) {
          webrtc.replaceVideoTrackInPeers(rawTrack);
        }
      }
    } else {
      // Tab is visible again! User switched back to meeting
      // 1. Instantly unpause and resume all video elements (local and remote)
      const allVideos = document.querySelectorAll('video');
      allVideos.forEach((v) => {
        if (v.srcObject) {
          v.play().catch(() => {});
        }
      });
      // 2. Re-verify remote peers' streams to recover any stalled decoders
      if (webrtc) {
        activePeersMap.forEach((_, peerId) => {
          const video = document.getElementById(`video_${peerId}`);
          const pData = webrtc.peers.get(peerId);
          if (video && pData && pData.remoteStream) {
            if (video.paused || video.readyState < 2) {
              video.srcObject = pData.remoteStream;
              video.play().catch(() => {});
            }
          }
        });
      }
      // 3. Resume virtual background segmentation loop if an effect was enabled
      if (activeBgEffect.type !== 'none' && !isLocalVideoOff && !isLocalScreenSharing) {
        segmentationLoopRunning = true;
        processSegmentationFrame();
        attachCanvasStreamToPeers();
      }
    }
  });

  // Periodic video stream watchdog: auto-recovers paused elements, unblocks stalled decoders & prevents black screens
  setInterval(() => {
    if (!webrtc) return;
    activePeersMap.forEach((peer, peerId) => {
      const video = document.getElementById(`video_${peerId}`);
      const placeholder = document.getElementById(`placeholder_${peerId}`);
      const pData = webrtc.peers.get(peerId);

      if (video && pData && pData.remoteStream) {
        const videoTracks = pData.remoteStream.getVideoTracks();
        const hasLiveTrack = videoTracks.some(t => t.readyState === 'live');

        if (hasLiveTrack && !peer.videoOff) {
          if (!video.srcObject || video.srcObject !== pData.remoteStream) {
            video.srcObject = pData.remoteStream;
            video.load();
            video.play().catch(() => {});
          } else if (video.paused) {
            video.play().catch(() => {});
          }
          const hasDecodedFrames = (video.videoWidth > 0 && video.videoHeight > 0 && video.readyState >= 2) || (video.currentTime > 0);
          if (hasDecodedFrames && placeholder && placeholder.style.display !== 'none') {
            placeholder.style.display = 'none';
            video.style.display = 'block';
          }
        }
      }
    });
  }, 2500);

  // Window unload cleanup
  window.addEventListener('beforeunload', () => {
    notifyRoomDeparture();
    if (jitsiApi) {
      try { jitsiApi.dispose(); } catch (e) {}
    }
    if (socket) {
      try { socket.emit('leave-room', { roomId, peerId: myPeerId, userId }); } catch (e) {}
      try { socket.disconnect(); } catch (e) {}
    }
    if (webrtc) {
      webrtc.destroy();
    }
  });
  window.addEventListener('pagehide', () => {
    notifyRoomDeparture();
  });

  /* ==========================================================================
     Microsoft Teams Pre-Meeting Setup Screen (Lobby) Manager
     ========================================================================== */

  async function populatePrejoinDevices() {
    try {
      const devices = await navigator.mediaDevices.enumerateDevices();
      const videoInputs = devices.filter(d => d.kind === 'videoinput');
      const audioInputs = devices.filter(d => d.kind === 'audioinput');
      const audioOutputs = devices.filter(d => d.kind === 'audiooutput');

      if (prejoinCamSelect) {
        if (videoInputs.length > 0) {
          prejoinCamSelect.innerHTML = videoInputs.map((d, i) =>
            `<option value="${d.deviceId}">${d.label || `Camera ${i + 1}`}</option>`
          ).join('');
        } else {
          prejoinCamSelect.innerHTML = `<option value="default">Default Camera</option>`;
        }
      }

      if (prejoinMicSelect) {
        if (audioInputs.length > 0) {
          prejoinMicSelect.innerHTML = audioInputs.map((d, i) =>
            `<option value="${d.deviceId}">${d.label || `Microphone ${i + 1}`}</option>`
          ).join('');
        } else {
          prejoinMicSelect.innerHTML = `<option value="default">Microphone (Realtek(R) Audio)</option>`;
        }
      }

      if (prejoinSpeakerSelect) {
        if (audioOutputs.length > 0) {
          prejoinSpeakerSelect.innerHTML = audioOutputs.map((d, i) =>
            `<option value="${d.deviceId}">${d.label || `Speakers ${i + 1}`}</option>`
          ).join('');
        } else {
          prejoinSpeakerSelect.innerHTML = `<option value="default">Speakers (Realtek(R) Audio)</option>`;
        }
      }
    } catch (err) {
      console.warn('Device enumeration warning:', err);
    }
  }

  function updatePrejoinCamIcon(isOn) {
    if (!prejoinCamIconSvg) return;
    if (isOn) {
      prejoinCamIconSvg.innerHTML = `
        <polygon points="23 7 16 12 23 17 23 7"></polygon>
        <rect x="1" y="5" width="15" height="14" rx="2" ry="2"></rect>
      `;
    } else {
      prejoinCamIconSvg.innerHTML = `
        <line x1="1" y1="1" x2="23" y2="23"></line>
        <path d="M21 21l-3.5-3.5M23 7l-7 5 7 5V7z"></path>
        <rect x="1" y="5" width="15" height="14" rx="2" ry="2"></rect>
      `;
    }
  }

  async function startPrejoinCamera() {
    try {
      if (prejoinStream) {
        prejoinStream.getVideoTracks().forEach(t => t.stop());
      }
      const deviceId = (prejoinCamSelect && prejoinCamSelect.value && prejoinCamSelect.value !== 'default') ? { ideal: prejoinCamSelect.value } : undefined;
      
      let stream = null;
      try {
        stream = await navigator.mediaDevices.getUserMedia({
          video: {
            deviceId,
            width: { ideal: 1280, max: 1920 },
            height: { ideal: 720, max: 1080 },
            frameRate: { ideal: 24, max: 30 }
          },
          audio: false
        });
      } catch (e1) {
        try {
          stream = await navigator.mediaDevices.getUserMedia({
            video: {
              width: { ideal: 640 },
              height: { ideal: 480 },
              frameRate: { ideal: 24, max: 30 }
            },
            audio: false
          });
        } catch (e2) {
          stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: false });
        }
      }

      prejoinStream = stream;
      if (prejoinVideo) {
        prejoinVideo.srcObject = stream;
        prejoinVideo.style.display = 'block';
        prejoinVideo.play().catch(() => {});
      }
      if (prejoinCamOffView) prejoinCamOffView.style.display = 'none';
      updatePrejoinCamIcon(true);
      await populatePrejoinDevices();

      // If a background effect was previously chosen, start segmentation preview
      if (activeBgEffect && activeBgEffect.type !== 'none') {
        startSegmentationLoop();
      }
    } catch (err) {
      console.warn('Prejoin camera access failed:', err);
      showToast('Camera access denied or unavailable', 'danger');
      if (prejoinCamToggle) prejoinCamToggle.checked = false;
      stopPrejoinCamera();
    }
  }

  function stopPrejoinCamera() {
    if (prejoinStream) {
      prejoinStream.getVideoTracks().forEach(t => t.stop());
      prejoinStream = null;
    }
    if (prejoinVideo) {
      prejoinVideo.style.display = 'none';
      prejoinVideo.srcObject = null;
    }
    if (prejoinCanvas) prejoinCanvas.style.display = 'none';
    if (prejoinCamOffView) prejoinCamOffView.style.display = 'flex';
    updatePrejoinCamIcon(false);
  }

  function testPrejoinAudio() {
    // 1. Play speaker test chime using Web Audio API
    try {
      const AudioCtx = window.AudioContext || window.webkitAudioContext;
      const ctx = new AudioCtx();
      const now = ctx.currentTime;

      // Melodic Microsoft Teams-style chime: Tone 1 (523.25 Hz C5) -> Tone 2 (659.25 Hz E5)
      const osc1 = ctx.createOscillator();
      const gain1 = ctx.createGain();
      osc1.type = 'sine';
      osc1.frequency.setValueAtTime(523.25, now);
      gain1.gain.setValueAtTime(0.18, now);
      gain1.gain.exponentialRampToValueAtTime(0.001, now + 0.35);
      osc1.connect(gain1);
      gain1.connect(ctx.destination);
      osc1.start(now);
      osc1.stop(now + 0.35);

      const osc2 = ctx.createOscillator();
      const gain2 = ctx.createGain();
      osc2.type = 'sine';
      osc2.frequency.setValueAtTime(659.25, now + 0.18);
      gain2.gain.setValueAtTime(0.2, now + 0.18);
      gain2.gain.exponentialRampToValueAtTime(0.001, now + 0.65);
      osc2.connect(gain2);
      gain2.connect(ctx.destination);
      osc2.start(now + 0.18);
      osc2.stop(now + 0.65);
    } catch (e) {
      console.warn('Speaker chime playback error:', e);
    }

    // 2. Microphone live level test
    if (prejoinAudioMeter) {
      prejoinAudioMeter.style.display = 'block';
      if (prejoinAudioMeterText) {
        prejoinAudioMeterText.textContent = 'Speaker chime played! Testing mic: speak now...';
      }
      startPrejoinMicMeter();
    }
  }

  async function startPrejoinMicMeter() {
    try {
      if (prejoinAudioContext) {
        try { prejoinAudioContext.close(); } catch(e) {}
      }
      const AudioCtx = window.AudioContext || window.webkitAudioContext;
      prejoinAudioContext = new AudioCtx();
      const micStream = await navigator.mediaDevices.getUserMedia({
        audio: {
          deviceId: (prejoinMicSelect && prejoinMicSelect.value !== 'default') ? { exact: prejoinMicSelect.value } : undefined
        },
        video: false
      });

      const source = prejoinAudioContext.createMediaStreamSource(micStream);
      prejoinAudioAnalyser = prejoinAudioContext.createAnalyser();
      prejoinAudioAnalyser.fftSize = 64;
      source.connect(prejoinAudioAnalyser);

      const dataArray = new Uint8Array(prejoinAudioAnalyser.frequencyBinCount);

      function updateMeter() {
        if (!isPrejoinActive) {
          micStream.getTracks().forEach(t => t.stop());
          return;
        }
        prejoinAudioAnalyser.getByteFrequencyData(dataArray);
        let sum = 0;
        for (let i = 0; i < dataArray.length; i++) {
          sum += dataArray[i];
        }
        const avg = sum / dataArray.length;
        const pct = Math.min(100, Math.round((avg / 128) * 100));

        if (prejoinAudioMeterFill) {
          prejoinAudioMeterFill.style.width = `${pct}%`;
        }
        if (pct > 15 && prejoinAudioMeterText) {
          prejoinAudioMeterText.textContent = '✓ Microphone is working! (Voice detected)';
          prejoinAudioMeterText.style.color = '#10b981';
        }

        prejoinAudioAnimId = requestAnimationFrame(updateMeter);
      }

      updateMeter();

      // Automatically stop meter sample after 12 seconds
      setTimeout(() => {
        if (prejoinAudioAnimId) cancelAnimationFrame(prejoinAudioAnimId);
        micStream.getTracks().forEach(t => t.stop());
      }, 12000);
    } catch (err) {
      console.warn('Could not test microphone stream:', err);
      if (prejoinAudioMeterText) {
        prejoinAudioMeterText.textContent = 'Could not access microphone for live test.';
        prejoinAudioMeterText.style.color = '#ef4444';
      }
    }
  }

  function initPreMeetingSetup() {
    if (!preMeetingSetup) return;

    isPrejoinActive = true;
    preMeetingSetup.style.display = 'flex';

    // Populate title
    if (prejoinTitleDisplay) {
      prejoinTitleDisplay.textContent = window.MEETING_TITLE || 'Microsoft Teams meeting';
    }

    // Passcode requirement handling
    const roomHasPasscode = Boolean(window.ROOM_REQUIRES_PASSCODE);
    if (prejoinSecurityBox) {
      if (roomHasPasscode && !currentPasscode) {
        prejoinSecurityBox.style.display = 'block';
      } else {
        prejoinSecurityBox.style.display = 'none';
      }
    }
    if (prejoinPasscodeInput && currentPasscode) {
      prejoinPasscodeInput.value = currentPasscode;
    }

    // Username handling
    if (prejoinUsernameInput) {
      if (username && !/^User_\d+$/i.test(username) && !/^Guest_\d+$/i.test(username)) {
        prejoinUsernameInput.value = username;
      } else {
        prejoinUsernameInput.value = '';
        prejoinUsernameInput.placeholder = 'Enter your name or Gmail';
      }
    }

    // Populate devices
    populatePrejoinDevices();

    // Setup initial camera state (default ON for seamless video meetings)
    if (prejoinCamToggle) {
      prejoinCamToggle.checked = true;
      startPrejoinCamera();

      prejoinCamToggle.addEventListener('change', () => {
        if (prejoinCamToggle.checked) {
          startPrejoinCamera();
        } else {
          stopPrejoinCamera();
        }
      });
    }

    // Camera device dropdown change
    if (prejoinCamSelect) {
      prejoinCamSelect.addEventListener('change', () => {
        if (prejoinCamToggle && prejoinCamToggle.checked) {
          startPrejoinCamera();
        }
      });
    }

    if (btnPrejoinCamIcon && prejoinCamSelect) {
      btnPrejoinCamIcon.addEventListener('click', () => {
        prejoinCamSelect.focus();
        if (typeof prejoinCamSelect.showPicker === 'function') {
          try { prejoinCamSelect.showPicker(); } catch(e) {}
        }
      });
    }

    // Background filters trigger
    if (btnPrejoinBgFilters) {
      btnPrejoinBgFilters.addEventListener('click', () => {
        if (backgroundEffectsPanel) {
          backgroundEffectsPanel.classList.add('prejoin-mode');
        }
        openBackgroundEffects();
      });
    }

    // Audio Option Radios
    const audioRadios = document.querySelectorAll('input[name="prejoinAudioOption"]');
    audioRadios.forEach(radio => {
      radio.addEventListener('change', () => {
        const val = radio.value;
        if (optComputerAudio) optComputerAudio.classList.toggle('selected', val === 'computer');
        if (optNoAudio) optNoAudio.classList.toggle('selected', val === 'none');

        if (val === 'computer') {
          if (prejoinMicToggle) prejoinMicToggle.checked = true;
          if (prejoinMicSelect) prejoinMicSelect.disabled = false;
          if (prejoinSpeakerSelect) prejoinSpeakerSelect.disabled = false;
        } else if (val === 'none') {
          if (prejoinMicToggle) prejoinMicToggle.checked = false;
          if (prejoinMicSelect) prejoinMicSelect.disabled = true;
          if (prejoinSpeakerSelect) prejoinSpeakerSelect.disabled = true;
        } else if (val === 'phone') {
          showToast('Phone audio dial-in is available in supported regions.', 'info');
        }
      });
    });

    // Test audio button
    if (btnPrejoinTestAudio) {
      btnPrejoinTestAudio.addEventListener('click', testPrejoinAudio);
    }

    // Cancel Button
    if (btnPrejoinCancel) {
      btnPrejoinCancel.addEventListener('click', () => {
        stopPrejoinCamera();
        if (prejoinAudioContext) {
          try { prejoinAudioContext.close(); } catch(e) {}
        }
        window.location.href = 'index.php';
      });
    }

    // Help Link
    if (linkPrejoinHelp) {
      linkPrejoinHelp.addEventListener('click', () => {
        alert(
          'VVA Meet / Teams Meeting Pre-Join Help:\n\n' +
          '• Turn your camera on or off before joining.\n' +
          '• Select Background Filters to apply Blur or a Virtual Background.\n' +
          '• Choose your preferred microphone and speakers, and test them with "Test mic and speaker".\n' +
          '• Click "Join now" when you are ready to enter the conference.'
        );
      });
    }

    // Join Now Button
    if (btnPrejoinJoinNow) {
      btnPrejoinJoinNow.addEventListener('click', () => {
        // 1. Check Passcode if required
        if (roomHasPasscode) {
          const enteredCode = prejoinPasscodeInput ? prejoinPasscodeInput.value.trim() : '';
          if (!enteredCode) {
            if (prejoinSecurityError) {
              prejoinSecurityError.textContent = 'Security passcode is required to enter this meeting.';
              prejoinSecurityError.style.display = 'block';
            }
            if (prejoinPasscodeInput) prejoinPasscodeInput.focus();
            return;
          }
          currentPasscode = enteredCode;
          sessionStorage.setItem('meet_passcode_' + roomId, currentPasscode);
        }

        // 2. Check Username
        if (prejoinUsernameInput) {
          const newName = prejoinUsernameInput.value.trim();
          if (newName) {
            username = newName;
            localStorage.setItem('meet_username', username);
            updateLocalNameLabel();
            if (localAvatarCircle) localAvatarCircle.textContent = username.charAt(0).toUpperCase();
          }
        }

        // 3. Read Media Preferences
        const isCamOn = prejoinCamToggle ? prejoinCamToggle.checked : false;
        const selectedAudioRadio = document.querySelector('input[name="prejoinAudioOption"]:checked');
        const isMicOn = (prejoinMicToggle ? prejoinMicToggle.checked : true) && (selectedAudioRadio?.value !== 'none');

        prefAudioMuted = !isMicOn;
        prefVideoOff = !isCamOn;
        isLocalAudioMuted = prefAudioMuted;
        isLocalVideoOff = prefVideoOff;

        sessionStorage.setItem('meet_pref_video_off', (!isCamOn).toString());
        sessionStorage.setItem('meet_pref_audio_muted', (!isMicOn).toString());

        // 4. Clean up prejoin preview stream before entering meeting
        stopPrejoinCamera();
        if (prejoinAudioAnimId) cancelAnimationFrame(prejoinAudioAnimId);
        if (prejoinAudioContext) {
          try { prejoinAudioContext.close(); } catch(e) {}
        }
        if (backgroundEffectsPanel) {
          backgroundEffectsPanel.classList.remove('prejoin-mode');
        }

        // 5. Hide Pre-meeting setup screen
        isPrejoinActive = false;
        preMeetingSetup.style.display = 'none';

        // Check if user is host
        const isHost = checkIsHost();
        if (!isHost) {
          // Non-host attendee MUST wait in lobby: immediately show waiting room so NO meeting screen or media is shown!
          showWaitingRoom();
        } else {
          hideWaitingRoom();
          startMeetingTimer();
        }

        // 6. Launch the meeting conference!
        const urlParams = new URLSearchParams(window.location.search);
        const urlEngine = urlParams.get('engine');
        // Clear any stale jitsi setting from localStorage so users are never trapped in 8x8 Jitsi lobby
        if (localStorage.getItem('meet_engine') === 'jitsi' && !urlEngine) {
          localStorage.removeItem('meet_engine');
        }
        let chosenEngine = (urlEngine || localStorage.getItem('meet_engine') || window.CONFERENCE_ENGINE || 'webrtc').toLowerCase();

        if (chosenEngine === 'jitsi') {
          initJitsiMeeting();
        } else {
          initConference();
        }
      });
    }
  }

  // Page Load Setup: Open Pre-Meeting Setup Page First!
  window.addEventListener('DOMContentLoaded', () => {
    // Check URL override: e.g. ?engine=webrtc or ?engine=jitsi
    const urlParams = new URLSearchParams(window.location.search);
    const urlEngine = urlParams.get('engine');

    // Clean up any stale Jitsi localStorage to avoid 8x8 moderator lobby trap
    if (localStorage.getItem('meet_engine') === 'jitsi' && !urlEngine) {
      localStorage.removeItem('meet_engine');
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

    if (preMeetingSetup) {
      // Open Microsoft Teams Pre-Join Screen first (Conference will only start after user clicks 'Join now')
      initPreMeetingSetup();
    } else {
      // Fallback if pre-meeting screen element absent
      startMeetingTimer();
      if (chosenEngine === 'jitsi') {
        initJitsiMeeting();
      } else {
        initConference();
      }
    }

    // Insecure origin check (plain HTTP across local network IP)
    if (!window.isSecureContext && window.location.hostname !== 'localhost' && window.location.hostname !== '127.0.0.1') {
      const banner = document.getElementById('insecureOriginBanner');
      if (banner) banner.style.display = 'flex';
    }
  });
})();
