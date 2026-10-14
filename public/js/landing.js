/**
 * Landing Page Logic: Pre-Join Media Preview, Room Generation, Audio Visualizer
 */

(function () {
  let previewStream = null;
  let audioContext = null;
  let analyser = null;
  let animFrameId = null;

  let isAudioMuted = false;
  let isVideoOff = false;

  // DOM Elements
  const previewVideo = document.getElementById('previewVideo');
  const videoPlaceholder = document.getElementById('videoPlaceholder');
  const avatarPreview = document.getElementById('avatarPreview');
  const btnToggleMic = document.getElementById('btnTogglePreviewMic');
  const btnToggleCam = document.getElementById('btnTogglePreviewCam');
  const iconMicOn = document.getElementById('iconMicOn');
  const iconMicOff = document.getElementById('iconMicOff');
  const iconCamOn = document.getElementById('iconCamOn');
  const iconCamOff = document.getElementById('iconCamOff');
  const micMeterFill = document.getElementById('micMeterFill');

  const joinForm = document.getElementById('joinForm');
  const usernameInput = document.getElementById('usernameInput');
  const roomIdInput = document.getElementById('roomIdInput');
  const btnGenerateRoom = document.getElementById('btnGenerateRoom');
  const passcodeInput = document.getElementById('passcodeInput');
  const btnGeneratePasscode = document.getElementById('btnGeneratePasscode');
  const shareLinkContainer = document.getElementById('shareLinkContainer');
  const shareUrlPreview = document.getElementById('shareUrlPreview');
  const btnCopyShareLink = document.getElementById('btnCopyShareLink');
  const toastContainer = document.getElementById('toastContainer');

  // Adjective & Noun lists for readable room code generation
  const ADJECTIVES = ['cosmic', 'swift', 'stellar', 'hyper', 'quantum', 'vibrant', 'zenith', 'nexus', 'emerald', 'cyber'];
  const NOUNS = ['falcon', 'nebula', 'orbit', 'pulse', 'matrix', 'beacon', 'horizon', 'solaris', 'summit', 'voyage'];

  function generateRandomRoom() {
    const adj = ADJECTIVES[Math.floor(Math.random() * ADJECTIVES.length)];
    const noun = NOUNS[Math.floor(Math.random() * NOUNS.length)];
    const num = Math.floor(100 + Math.random() * 900);
    return `${adj}-${noun}-${num}`;
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

  // Helper to build clean room URL relative to current deployment
  function buildRoomUrl(room, passcode = '') {
    const loc = window.location;
    const cleanPath = loc.pathname.replace(/\/index\.(html|php)$/, '').replace(/\/$/, '');
    let url = `${loc.origin}${cleanPath}/room.php?room=${encodeURIComponent(room)}`;
    if (passcode) {
      url += `&passcode=${encodeURIComponent(passcode)}`;
    }
    return url;
  }

  // Update shareable link preview
  function updateShareLink() {
    const room = roomIdInput.value.trim();
    const passcode = passcodeInput ? passcodeInput.value.trim() : '';
    if (room) {
      shareUrlPreview.textContent = buildRoomUrl(room, passcode);
      shareLinkContainer.style.display = 'block';
    } else {
      shareLinkContainer.style.display = 'none';
    }
  }

  // Initialize Media Preview
  async function initPreview() {
    try {
      previewStream = await navigator.mediaDevices.getUserMedia({
        video: { width: 640, height: 360, facingMode: 'user' },
        audio: true
      });

      previewVideo.srcObject = previewStream;

      // Setup audio analyzer for volume meter
      setupAudioAnalyser();
    } catch (err) {
      console.warn('Could not initialize video/audio for preview:', err);
      // Fallback: try audio only
      try {
        previewStream = await navigator.mediaDevices.getUserMedia({ audio: true });
        isVideoOff = true;
        updateCamUI();
        setupAudioAnalyser();
      } catch (audioErr) {
        console.warn('Microphone permission denied or unavailable:', audioErr);
        isAudioMuted = true;
        isVideoOff = true;
        updateMicUI();
        updateCamUI();
      }
    }
  }

  function setupAudioAnalyser() {
    if (!previewStream) return;
    const audioTrack = previewStream.getAudioTracks()[0];
    if (!audioTrack) return;

    try {
      const AudioCtx = window.AudioContext || window.webkitAudioContext;
      audioContext = new AudioCtx();
      const source = audioContext.createMediaStreamSource(new MediaStream([audioTrack]));
      analyser = audioContext.createAnalyser();
      analyser.fftSize = 64;
      source.connect(analyser);

      const dataArray = new Uint8Array(analyser.frequencyBinCount);

      function updateMeter() {
        if (!analyser || isAudioMuted) {
          micMeterFill.style.width = '0%';
        } else {
          analyser.getByteFrequencyData(dataArray);
          let sum = 0;
          for (let i = 0; i < dataArray.length; i++) sum += dataArray[i];
          const avg = sum / dataArray.length;
          // Scale from 0..128 to percentage
          const pct = Math.min(100, Math.round((avg / 60) * 100));
          micMeterFill.style.width = `${pct}%`;
        }
        animFrameId = requestAnimationFrame(updateMeter);
      }

      updateMeter();
    } catch (e) {
      console.warn('AudioContext error in preview:', e);
    }
  }

  // Toggle Microphone
  function toggleMic() {
    if (!previewStream) return;
    isAudioMuted = !isAudioMuted;
    previewStream.getAudioTracks().forEach((track) => {
      track.enabled = !isAudioMuted;
    });
    updateMicUI();
  }

  function updateMicUI() {
    if (isAudioMuted) {
      btnToggleMic.classList.add('off');
      iconMicOn.style.display = 'none';
      iconMicOff.style.display = 'block';
      micMeterFill.style.width = '0%';
    } else {
      btnToggleMic.classList.remove('off');
      iconMicOn.style.display = 'block';
      iconMicOff.style.display = 'none';
    }
  }

  // Toggle Camera
  function toggleCam() {
    if (!previewStream) return;
    isVideoOff = !isVideoOff;
    previewStream.getVideoTracks().forEach((track) => {
      track.enabled = !isVideoOff;
    });
    updateCamUI();
  }

  function updateCamUI() {
    if (isVideoOff) {
      btnToggleCam.classList.add('off');
      iconCamOn.style.display = 'none';
      iconCamOff.style.display = 'block';
      videoPlaceholder.style.display = 'flex';
      previewVideo.style.display = 'none';
    } else {
      btnToggleCam.classList.remove('off');
      iconCamOn.style.display = 'block';
      iconCamOff.style.display = 'none';
      videoPlaceholder.style.display = 'none';
      previewVideo.style.display = 'block';
    }
  }

  // Update Avatar Letter
  function updateAvatar() {
    const name = usernameInput.value.trim() || 'U';
    avatarPreview.textContent = name.charAt(0).toUpperCase();
  }

  // Event Listeners
  btnToggleMic.addEventListener('click', toggleMic);
  btnToggleCam.addEventListener('click', toggleCam);

  btnGenerateRoom.addEventListener('click', () => {
    roomIdInput.value = generateRandomRoom();
    updateShareLink();
  });

  if (btnGeneratePasscode && passcodeInput) {
    btnGeneratePasscode.addEventListener('click', () => {
      passcodeInput.value = Math.floor(100000 + Math.random() * 900000).toString();
      updateShareLink();
    });
    passcodeInput.addEventListener('input', updateShareLink);
  }

  roomIdInput.addEventListener('input', updateShareLink);
  usernameInput.addEventListener('input', updateAvatar);

  btnCopyShareLink.addEventListener('click', async () => {
    const text = shareUrlPreview.textContent;
    try {
      await navigator.clipboard.writeText(text);
      showToast('Meeting link copied to clipboard!', 'success');
    } catch (e) {
      showToast('Could not copy automatically.', 'danger');
    }
  });

  // Handle Form Submission
  joinForm.addEventListener('submit', (e) => {
    e.preventDefault();

    const username = usernameInput.value.trim();
    const roomId = roomIdInput.value.trim();
    const passcode = passcodeInput ? passcodeInput.value.trim() : '';

    if (!username || !roomId) {
      showToast('Please enter your name and a room code', 'danger');
      return;
    }

    // Persist settings
    localStorage.setItem('meet_username', username);
    sessionStorage.setItem('meet_pref_audio_muted', isAudioMuted ? 'true' : 'false');
    sessionStorage.setItem('meet_pref_video_off', isVideoOff ? 'true' : 'false');
    if (passcode) {
      sessionStorage.setItem('meet_passcode_' + roomId, passcode);
    }

    // Clean up preview stream
    if (animFrameId) cancelAnimationFrame(animFrameId);
    if (previewStream) {
      previewStream.getTracks().forEach((t) => t.stop());
    }
    if (audioContext) {
      audioContext.close();
    }

    // Redirect to meeting room
    let target = `room.php?room=${encodeURIComponent(roomId)}`;
    if (passcode) {
      target += `&passcode=${encodeURIComponent(passcode)}`;
    }
    window.location.href = target;
  });

  // Init page state
  window.addEventListener('DOMContentLoaded', () => {
    // Check saved username
    const savedName = localStorage.getItem('meet_username');
    if (savedName) {
      usernameInput.value = savedName;
      updateAvatar();
    }

    // Check query params (e.g. ?room=xyz)
    const urlParams = new URLSearchParams(window.location.search);
    const roomFromUrl = urlParams.get('room');
    if (roomFromUrl) {
      roomIdInput.value = roomFromUrl;
    } else {
      roomIdInput.value = generateRandomRoom();
    }

    updateShareLink();
    initPreview();
  });
})();
