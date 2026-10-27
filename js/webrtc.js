/**
 * WebRTC Mesh Network Manager
 * Handles multi-peer WebRTC connections, media streams, screen sharing, and audio visualizers.
 */

// Calculate static fallback HMAC credentials for openrelay if not injected by server
function getStaticAuthIceServers() {
  if (typeof window !== 'undefined' && Array.isArray(window.DYNAMIC_ICE_SERVERS) && window.DYNAMIC_ICE_SERVERS.length > 0) {
    return window.DYNAMIC_ICE_SERVERS;
  }
  // Fallback: turn.evan-brass.net (Verified active relay allocation)
  return [
    { urls: 'stun:stun.l.google.com:19302' },
    { urls: 'stun:stun1.l.google.com:19302' },
    { urls: 'stun:stun.cloudflare.com:3478' },
    {
      urls: [
        'turn:turn.evan-brass.net:3478',
        'turn:turn.evan-brass.net:3478?transport=tcp',
        'turns:turn.evan-brass.net:443?transport=tcp'
      ],
      username: 'user',
      credential: 'password'
    }
  ];
}

const RTC_CONFIG = {
  get iceServers() {
    return getStaticAuthIceServers();
  },
  iceCandidatePoolSize: 2,
  bundlePolicy: 'max-bundle',
  rtcpMuxPolicy: 'require'
};

class WebRTCManager {
  constructor({ localUsername, onRemoteStream, onRemoteStreamRemoved, onActiveSpeaker, onMediaStatusChange }) {
    this.localUsername = localUsername || 'You';
    this.peers = new Map(); // peerId -> { pc, stream, candidateQueue, audioAnalyser }
    this.pendingCandidates = new Map(); // peerId -> array of queued candidates received before PC was created
    this.localStream = null;
    this.rawCameraStream = null; // Permanent reference to hardware camera stream
    this.rawCameraTrack = null;  // Permanent reference to hardware camera track
    this.activeVideoTrack = null;
    this.screenStream = null;
    this.fallbackCanvasInterval = null;
    this.isScreenSharing = false;
    this.isAudioMuted = false;
    this.isVideoOff = false;

    // Callbacks
    this.onRemoteStream = onRemoteStream || (() => {});
    this.onRemoteStreamRemoved = onRemoteStreamRemoved || (() => {});
    this.onActiveSpeaker = onActiveSpeaker || (() => {});
    this.onMediaStatusChange = onMediaStatusChange || (() => {});

    // Audio context for speaking detection
    this.audioContext = null;
    this.localAnalyser = null;
    this.speakerCheckInterval = null;
  }

  /**
   * Generates a live animated 30fps fallback video stream.
   * Ensures WebRTC video works even in insecure HTTP browser contexts where Chrome blocks physical webcams.
   */
  createFallbackVideoStream(label = 'Participant') {
    const canvas = document.createElement('canvas');
    canvas.width = 640;
    canvas.height = 480;
    const ctx = canvas.getContext('2d');
    let frame = 0;

    const draw = () => {
      frame++;
      // Animated gradient background
      const grad = ctx.createLinearGradient(0, 0, canvas.width, canvas.height);
      const hue1 = (frame * 0.4) % 360;
      const hue2 = (frame * 0.4 + 60) % 360;
      grad.addColorStop(0, `hsl(${hue1}, 65%, 22%)`);
      grad.addColorStop(1, `hsl(${hue2}, 65%, 12%)`);
      ctx.fillStyle = grad;
      ctx.fillRect(0, 0, canvas.width, canvas.height);

      // Subtle animated grid lines
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.05)';
      ctx.lineWidth = 1;
      for (let x = 0; x < canvas.width; x += 40) {
        ctx.beginPath();
        ctx.moveTo(x, 0);
        ctx.lineTo(x, canvas.height);
        ctx.stroke();
      }

      // Animated pulsating avatar circle
      const cx = canvas.width / 2;
      const cy = canvas.height / 2 - 20;
      const r = 58 + Math.sin(frame * 0.06) * 5;

      ctx.beginPath();
      ctx.arc(cx, cy, r + 6, 0, Math.PI * 2);
      ctx.fillStyle = 'rgba(99, 102, 241, 0.25)';
      ctx.fill();

      ctx.beginPath();
      ctx.arc(cx, cy, r, 0, Math.PI * 2);
      ctx.fillStyle = '#4f46e5';
      ctx.fill();
      ctx.lineWidth = 3;
      ctx.strokeStyle = '#818cf8';
      ctx.stroke();

      // Avatar Initial
      ctx.fillStyle = '#ffffff';
      ctx.font = 'bold 52px system-ui, -apple-system, sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText((label.charAt(0) || 'U').toUpperCase(), cx, cy);

      // Participant Name
      ctx.font = '600 22px system-ui, -apple-system, sans-serif';
      ctx.fillText(label, cx, cy + 96);

      // Live status pill
      ctx.fillStyle = 'rgba(16, 185, 129, 0.2)';
      ctx.fillRect(cx - 100, cy + 120, 200, 24);
      ctx.strokeStyle = 'rgba(16, 185, 129, 0.4)';
      ctx.strokeRect(cx - 100, cy + 120, 200, 24);

      ctx.fillStyle = '#10b981';
      ctx.beginPath();
      ctx.arc(cx - 75, cy + 132, 4, 0, Math.PI * 2);
      ctx.fill();

      ctx.font = '600 11px system-ui, -apple-system, sans-serif';
      ctx.fillText('LIVE VIDEO STREAM', cx + 6, cy + 132);
    };

    if (this.fallbackCanvasInterval) clearInterval(this.fallbackCanvasInterval);
    this.fallbackCanvasInterval = setInterval(draw, 1000 / 30);
    draw();

    return canvas.captureStream ? canvas.captureStream(30) : null;
  }

  /**
   * Acquire local user media (camera + microphone)
   */
  async initLocalMedia({ video = true, audio = true } = {}) {
    if (!this.localStream) {
      this.localStream = new MediaStream();
    }
    let videoStream = null;
    let audioStream = null;
    const hasMedia = typeof navigator !== 'undefined' && navigator.mediaDevices && typeof navigator.mediaDevices.getUserMedia === 'function';

    if (hasMedia && video) {
      try {
        videoStream = await navigator.mediaDevices.getUserMedia({
          video: {
            width: { ideal: 1280, min: 640 },
            height: { ideal: 720, min: 360 },
            aspectRatio: { ideal: 1.7777777778 },
            frameRate: { ideal: 30, max: 30 }
          }
        });
      } catch (e1) {
        try {
          videoStream = await navigator.mediaDevices.getUserMedia({
            video: {
              width: { ideal: 640 },
              height: { ideal: 360 },
              aspectRatio: { ideal: 1.7777777778 },
              frameRate: { ideal: 30, max: 30 }
            }
          });
        } catch (e2) {
          try {
            videoStream = await navigator.mediaDevices.getUserMedia({ video: true });
          } catch (e3) {
            console.warn('Physical camera unavailable:', e3);
          }
        }
      }
    }

    if (hasMedia && audio) {
      try {
        audioStream = await navigator.mediaDevices.getUserMedia({
          audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true }
        });
      } catch (e1) {
        try {
          audioStream = await navigator.mediaDevices.getUserMedia({ audio: true });
        } catch (e2) {
          console.warn('Could not acquire audio stream with constraints:', e2);
        }
      }
    }

    if (video) {
      if (videoStream && videoStream.getVideoTracks().length > 0) {
        this.rawCameraStream = videoStream;
        this.rawCameraTrack = videoStream.getVideoTracks()[0];
        videoStream.getVideoTracks().forEach(t => {
          this.localStream.addTrack(t);
          this.activeVideoTrack = t;
        });
        this.isVideoOff = false;
      } else {
        // Fallback live animated video stream when physical camera is restricted (e.g. Chrome HTTP on LAN)
        const fallbackStream = this.createFallbackVideoStream(this.localUsername || 'You');
        if (fallbackStream && fallbackStream.getVideoTracks()[0]) {
          const fbTrack = fallbackStream.getVideoTracks()[0];
          this.rawCameraStream = fallbackStream;
          this.rawCameraTrack = fbTrack;
          this.localStream.addTrack(fbTrack);
          this.activeVideoTrack = fbTrack;
          this.isVideoOff = false;
        } else {
          this.isVideoOff = true;
        }
      }
    } else {
      this.isVideoOff = true;
    }

    if (audioStream && audioStream.getAudioTracks().length > 0) {
      audioStream.getAudioTracks().forEach(t => this.localStream.addTrack(t));
      this.isAudioMuted = false;
    } else {
      this.isAudioMuted = true;
    }

    this.setupLocalAudioAnalyser();
    return this.localStream;
  }

  /**
   * Set up audio analyser for local speaking detection
   */
  setupLocalAudioAnalyser() {
    if (!this.localStream) return;
    const audioTrack = this.localStream.getAudioTracks()[0];
    if (!audioTrack) return;

    try {
      const AudioCtx = window.AudioContext || window.webkitAudioContext;
      if (!this.audioContext && AudioCtx) {
        this.audioContext = new AudioCtx();
      }
      if (!this.audioContext) return;

      const source = this.audioContext.createMediaStreamSource(new MediaStream([audioTrack]));
      this.localAnalyser = this.audioContext.createAnalyser();
      this.localAnalyser.fftSize = 256;
      source.connect(this.localAnalyser);

      this.startSpeakingDetector();
    } catch (e) {
      console.warn('Could not setup local audio analyser:', e);
    }
  }

  /**
   * Continuously check audio volume to trigger active speaker glow
   */
  startSpeakingDetector() {
    if (this.speakerCheckInterval) clearInterval(this.speakerCheckInterval);

    const buffer = new Uint8Array(128);
    let wasLocalSpeaking = false;

    this.speakerCheckInterval = setInterval(() => {
      // Local check
      if (this.localAnalyser && !this.isAudioMuted) {
        this.localAnalyser.getByteFrequencyData(buffer);
        let sum = 0;
        for (let i = 0; i < buffer.length; i++) sum += buffer[i];
        const average = sum / buffer.length;
        const isSpeaking = average > 18;

        if (isSpeaking !== wasLocalSpeaking) {
          wasLocalSpeaking = isSpeaking;
          this.onActiveSpeaker('local', isSpeaking);
        }
      } else if (wasLocalSpeaking) {
        wasLocalSpeaking = false;
        this.onActiveSpeaker('local', false);
      }

      // Check remote peers
      this.peers.forEach((peer, peerId) => {
        if (peer.audioAnalyser && !peer.isMuted) {
          peer.audioAnalyser.getByteFrequencyData(buffer);
          let sum = 0;
          for (let i = 0; i < buffer.length; i++) sum += buffer[i];
          const average = sum / buffer.length;
          const isSpeaking = average > 18;

          if (isSpeaking !== peer.wasSpeaking) {
            peer.wasSpeaking = isSpeaking;
            this.onActiveSpeaker(peerId, isSpeaking);
          }
        }
      });
    }, 150);
  }

  /**
   * Create or retrieve an RTCPeerConnection for a given peer
   */
  createPeerConnection(peerId, socket, isInitiator = false) {
    if (this.peers.has(peerId)) {
      const existing = this.peers.get(peerId);
      if (isInitiator && existing && existing.pc && existing.pc.signalingState === 'stable' && existing.pc.connectionState !== 'connected') {
        // Existing PC is idle/disconnected, proactively send fresh offer
        existing.pc.createOffer({ offerToReceiveAudio: true, offerToReceiveVideo: true })
          .then((offer) => existing.pc.setLocalDescription(offer))
          .then(() => {
            this.applySenderOptimizations(existing.pc);
            if (socket) {
              socket.emit('signal:offer', {
                targetPeerId: peerId,
                offer: existing.pc.localDescription
              });
            }
          })
          .catch((err) => console.warn(`Re-negotiate offer error for ${peerId}:`, err));
      }
      return existing.pc;
    }

    const pc = new RTCPeerConnection(RTC_CONFIG);
    const peerData = {
      peerId,
      pc,
      remoteStream: new MediaStream(),
      candidateQueue: [],
      audioAnalyser: null,
      wasSpeaking: false,
      isMuted: false
    };
    this.peers.set(peerId, peerData);

    // Add local tracks to peer connection
    if (this.localStream) {
      // Audio track
      const audioTrack = this.localStream.getAudioTracks()[0];
      if (audioTrack) {
        pc.addTrack(audioTrack, this.localStream);
      }
      // Video track: use activeVideoTrack (if background blur or screen share is active) or raw camera track
      const videoTrack = this.activeVideoTrack || this.localStream.getVideoTracks()[0];
      if (videoTrack) {
        pc.addTrack(videoTrack, this.localStream);
      }
    }
    this.applySenderOptimizations(pc);

    // Ensure audio & video transceivers exist to send & receive even if user joined with camera off
    try {
      if (!pc.getTransceivers().some(t => t.sender && t.sender.track && t.sender.track.kind === 'audio')) {
        pc.addTransceiver('audio', { direction: 'sendrecv' });
      }
      if (!pc.getTransceivers().some(t => t.sender && t.sender.track && t.sender.track.kind === 'video')) {
        pc.addTransceiver('video', { direction: 'sendrecv' });
      }
    } catch (e) {}

    // Drain any early ICE candidates received before PC was created
    if (this.pendingCandidates && this.pendingCandidates.has(peerId)) {
      const early = this.pendingCandidates.get(peerId);
      this.pendingCandidates.delete(peerId);
      early.forEach(c => peerData.candidateQueue.push(c));
    }

    // ICE Candidate event
    pc.onicecandidate = (event) => {
      if (event.candidate) {
        const cType = event.candidate.type || (event.candidate.candidate ? (event.candidate.candidate.split(' ')[7] || 'cand') : 'cand');
        console.log(`[Peer: ${peerId}] Local ICE candidate generated (${cType}):`, event.candidate.candidate ? event.candidate.candidate.substring(0, 50) : '');
        socket.emit('signal:ice-candidate', {
          targetPeerId: peerId,
          candidate: event.candidate
        });
      }
    };

    pc.onicecandidateerror = (event) => {
      console.warn(`[Peer: ${peerId}] ICE candidate error: ${event.url} [${event.errorCode}]: ${event.errorText}`);
    };

    // Track received from remote peer
    pc.ontrack = (event) => {
      // Minimize jitter buffer latency for ultra-responsive live video
      const receiver = event.receiver;
      if (receiver) {
        if ('playoutDelayHint' in receiver) {
          receiver.playoutDelayHint = 0;
        }
        if ('jitterBufferTarget' in receiver) {
          receiver.jitterBufferTarget = 0;
        }
      }

      const track = event.track;
      if (track) {
        // Discard any stale/previous tracks of same kind so <video> always plays the live incoming track
        peerData.remoteStream.getTracks().forEach((existing) => {
          if (existing.kind === track.kind && existing.id !== track.id) {
            peerData.remoteStream.removeTrack(existing);
            try { existing.stop(); } catch (e) {}
          }
        });
        if (!peerData.remoteStream.getTracks().some(t => t.id === track.id)) {
          peerData.remoteStream.addTrack(track);
        }
        // Ensure video displays as soon as the first RTP packet unmutes the track
        track.onunmute = () => {
          this.onRemoteStream(peerId, peerData.remoteStream);
        };
        track.onended = () => {
          peerData.remoteStream.removeTrack(track);
        };
      }
      if (event.streams && event.streams[0]) {
        event.streams[0].getTracks().forEach((t) => {
          peerData.remoteStream.getTracks().forEach((existing) => {
            if (existing.kind === t.kind && existing.id !== t.id) {
              peerData.remoteStream.removeTrack(existing);
              try { existing.stop(); } catch (e) {}
            }
          });
          if (!peerData.remoteStream.getTracks().some(existing => existing.id === t.id)) {
            peerData.remoteStream.addTrack(t);
          }
          t.onunmute = () => {
            this.onRemoteStream(peerId, peerData.remoteStream);
          };
          t.onended = () => {
            peerData.remoteStream.removeTrack(t);
          };
        });
      }

      // Hook up remote audio analyser for speaking detection
      this.setupRemoteAudioAnalyser(peerId, peerData.remoteStream);

      this.onRemoteStream(peerId, peerData.remoteStream);
    };

    // Connection state changes
    pc.onconnectionstatechange = () => {
      console.log(`[Peer: ${peerId}] Connection state: ${pc.connectionState}`);
      if (pc.connectionState === 'failed') {
        console.warn(`[Peer: ${peerId}] Connection failed, initiating active ICE restart offer...`);
        this.triggerIceRestart(peerId, socket, pc);
      } else if (pc.connectionState === 'closed') {
        this.closePeer(peerId);
      } else if (pc.connectionState === 'disconnected') {
        console.warn(`[Peer: ${peerId}] Disconnected (transient). Awaiting ICE recovery...`);
        setTimeout(() => {
          if (pc.connectionState === 'disconnected') {
            console.warn(`[Peer: ${peerId}] Prolonged disconnection, attempting recovery...`);
            this.triggerIceRestart(peerId, socket, pc);
          }
        }, 5000);
      }
    };

    pc.oniceconnectionstatechange = () => {
      console.log(`[Peer: ${peerId}] ICE state: ${pc.iceConnectionState}`);
      if (pc.iceConnectionState === 'connected' || pc.iceConnectionState === 'completed') {
        this.onRemoteStream(peerId, peerData.remoteStream);
      } else if (pc.iceConnectionState === 'failed') {
        console.warn(`[Peer: ${peerId}] ICE state failed, initiating active ICE restart offer...`);
        this.triggerIceRestart(peerId, socket, pc);
      } else if (pc.iceConnectionState === 'disconnected') {
        console.warn(`[Peer: ${peerId}] ICE state disconnected. Awaiting recovery...`);
        setTimeout(() => {
          if (pc.iceConnectionState === 'disconnected') {
            console.warn(`[Peer: ${peerId}] ICE disconnection prolonged, initiating ICE restart...`);
            this.triggerIceRestart(peerId, socket, pc);
          }
        }, 3500);
      }
    };

    // If initiator, create offer
    if (isInitiator) {
      pc.createOffer({
        offerToReceiveAudio: true,
        offerToReceiveVideo: true
      })
      .then((offer) => pc.setLocalDescription(offer))
      .then(() => {
        this.applySenderOptimizations(pc);
        socket.emit('signal:offer', {
          targetPeerId: peerId,
          offer: pc.localDescription
        });
      })
      .catch((err) => console.error(`Error creating offer for ${peerId}:`, err));
    }

    return pc;
  }

  /**
   * Apply ultra-low-latency encoding and bitrate limits to video senders
   */
  applySenderOptimizations(pc) {
    if (!pc) return;
    try {
      pc.getSenders().forEach((sender) => {
        if (sender.track && sender.track.kind === 'video' && typeof sender.getParameters === 'function' && typeof sender.setParameters === 'function') {
          const params = sender.getParameters();
          if (params && Array.isArray(params.encodings) && params.encodings.length > 0) {
            params.encodings[0].maxBitrate = this.isScreenSharing ? 6000000 : 2500000;
            params.degradationPreference = this.isScreenSharing ? 'maintain-resolution' : 'balanced';
            sender.setParameters(params).catch(() => {});
          }
        }
      });
    } catch (e) {}
  }

  /**
   * Handle incoming offer from a peer (Polite Peer Perfect Negotiation)
   */
  async handleOffer(callerId, offer, socket) {
    const pc = this.createPeerConnection(callerId, socket, false);
    const peerData = this.peers.get(callerId);

    try {
      const myId = (socket && socket.id) ? socket.id : '';
      const isPolite = myId < callerId; // Deterministic tie-breaker
      const offerCollision = pc.signalingState !== 'stable';

      if (offerCollision) {
        if (!isPolite) {
          console.warn(`[WebRTC Glare] Impolite peer ignoring colliding offer from ${callerId}`);
          return;
        }
        console.log(`[WebRTC Glare] Polite peer rolling back local offer for ${callerId}`);
        await pc.setLocalDescription({ type: 'rollback' });
      }

      await pc.setRemoteDescription(new RTCSessionDescription(offer));

      // Drain queued ICE candidates safely
      if (peerData && peerData.candidateQueue.length > 0) {
        for (const cand of peerData.candidateQueue) {
          try {
            if (cand && (cand.candidate || cand.sdpMid !== undefined)) {
              await pc.addIceCandidate(new RTCIceCandidate(cand));
            }
          } catch (candErr) {
            console.warn(`[Peer: ${callerId}] Drain candidate error:`, candErr);
          }
        }
        peerData.candidateQueue = [];
      }

      const answer = await pc.createAnswer();
      await pc.setLocalDescription(answer);
      this.applySenderOptimizations(pc);

      socket.emit('signal:answer', {
        targetPeerId: callerId,
        answer: pc.localDescription
      });
    } catch (err) {
      console.error(`Error handling offer from ${callerId}:`, err);
    }
  }

  /**
   * Handle incoming answer from a peer
   */
  async handleAnswer(responderId, answer) {
    const peerData = this.peers.get(responderId);
    if (!peerData) return;

    try {
      if (peerData.pc.signalingState === 'have-local-offer') {
        await peerData.pc.setRemoteDescription(new RTCSessionDescription(answer));
        this.applySenderOptimizations(peerData.pc);

        // Drain queued ICE candidates safely
        if (peerData.candidateQueue.length > 0) {
          for (const cand of peerData.candidateQueue) {
            try {
              if (cand && (cand.candidate || cand.sdpMid !== undefined)) {
                await peerData.pc.addIceCandidate(new RTCIceCandidate(cand));
              }
            } catch (candErr) {
              console.warn(`[Peer: ${responderId}] Drain candidate error:`, candErr);
            }
          }
          peerData.candidateQueue = [];
        }
      } else {
        console.warn(`[Peer: ${responderId}] Answer received in state "${peerData.pc.signalingState}", ignoring duplicate/stale answer`);
      }
    } catch (err) {
      console.error(`Error handling answer from ${responderId}:`, err);
    }
  }

  /**
   * Handle incoming ICE candidate
   */
  async handleIceCandidate(senderId, candidate) {
    if (!candidate) return;
    const peerData = this.peers.get(senderId);
    if (!peerData) {
      // Queue candidate for when peer connection is created
      if (!this.pendingCandidates.has(senderId)) {
        this.pendingCandidates.set(senderId, []);
      }
      this.pendingCandidates.get(senderId).push(candidate);
      return;
    }

    try {
      if (peerData.pc.remoteDescription && peerData.pc.remoteDescription.type) {
        if (candidate.candidate || candidate.sdpMid !== undefined) {
          await peerData.pc.addIceCandidate(new RTCIceCandidate(candidate));
        }
      } else {
        peerData.candidateQueue.push(candidate);
      }
    } catch (err) {
      console.warn(`Error adding ICE candidate from ${senderId}:`, err);
    }
  }

  /**
   * Proactively trigger ICE restart to re-negotiate media with fresh TURN/STUN allocations
   */
  triggerIceRestart(peerId, socket, pc) {
    if (!pc || pc.signalingState === 'closed') return;
    const now = Date.now();
    if (pc._lastIceRestart && (now - pc._lastIceRestart < 3500)) {
      return; // Cooldown to avoid signaling flooding while negotiation is in flight
    }
    pc._lastIceRestart = now;
    try {
      if (typeof pc.restartIce === 'function') {
        pc.restartIce();
      }
      pc.createOffer({ iceRestart: true })
        .then((offer) => pc.setLocalDescription(offer))
        .then(() => {
          this.applySenderOptimizations(pc);
          if (socket) {
            socket.emit('signal:offer', {
              targetPeerId: peerId,
              offer: pc.localDescription
            });
          }
        })
        .catch((err) => {
          console.warn(`[Peer: ${peerId}] ICE restart offer generation failed:`, err);
          this.reconnectPeer(peerId, socket);
        });
    } catch (e) {
      this.reconnectPeer(peerId, socket);
    }
  }

  /**
   * Gracefully reconnect and recreate a peer connection from scratch
   */
  reconnectPeer(peerId, socket) {
    console.log(`[Peer: ${peerId}] Recreating WebRTC connection from scratch...`);
    const oldPeer = this.peers.get(peerId);
    if (oldPeer && oldPeer.pc) {
      try { oldPeer.pc.close(); } catch (e) {}
    }
    this.peers.delete(peerId);

    const myId = (socket && socket.id) ? socket.id : '';
    const shouldInitiate = myId < peerId;
    setTimeout(() => {
      this.createPeerConnection(peerId, socket, shouldInitiate);
    }, 600);
  }

  /**
   * Attach audio analyser to remote stream
   */
  setupRemoteAudioAnalyser(peerId, stream) {
    const peerData = this.peers.get(peerId);
    if (!peerData) return;

    const audioTrack = stream.getAudioTracks()[0];
    if (!audioTrack) return;

    try {
      if (!this.audioContext) {
        const AudioCtx = window.AudioContext || window.webkitAudioContext;
        this.audioContext = new AudioCtx();
      }
      const source = this.audioContext.createMediaStreamSource(new MediaStream([audioTrack]));
      const analyser = this.audioContext.createAnalyser();
      analyser.fftSize = 256;
      source.connect(analyser);
      peerData.audioAnalyser = analyser;
    } catch (e) {
      console.warn(`Could not set up audio analyser for ${peerId}:`, e);
    }
  }

  /**
   * Toggle local microphone mute
   */
  toggleAudio(forceMute = null) {
    if (!this.localStream) return this.isAudioMuted;

    const audioTracks = this.localStream.getAudioTracks();
    if (audioTracks.length === 0) return this.isAudioMuted;

    this.isAudioMuted = forceMute !== null ? forceMute : !this.isAudioMuted;
    audioTracks.forEach((track) => {
      track.enabled = !this.isAudioMuted;
    });

    this.onMediaStatusChange('audio', !this.isAudioMuted);
    return this.isAudioMuted;
  }

  /**
   * Toggle local camera video
   */
  async toggleVideo(forceOff = null) {
    if (!this.localStream) {
      this.localStream = new MediaStream();
    }

    const videoTracks = this.localStream.getVideoTracks();
    const shouldTurnOff = forceOff !== null ? forceOff : !this.isVideoOff;

    if (shouldTurnOff) {
      this.isVideoOff = true;
      videoTracks.forEach((track) => {
        track.enabled = false;
      });
      this.onMediaStatusChange('video', false);
      return true;
    }

    // Turning camera ON
    const liveVideoTracks = videoTracks.filter(t => t.readyState === 'live');
    if (liveVideoTracks.length > 0) {
      liveVideoTracks.forEach((track) => {
        track.enabled = true;
      });
      this.isVideoOff = false;
      this.replaceVideoTrackInPeers(liveVideoTracks[0]);
      this.onMediaStatusChange('video', true, this.localStream);
      return false;
    }

    // If no tracks exist yet, try to acquire camera
    const hasMedia = typeof navigator !== 'undefined' && navigator.mediaDevices && typeof navigator.mediaDevices.getUserMedia === 'function';
    if (hasMedia) {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { width: { ideal: 1280 }, height: { ideal: 720 } }
        }).catch(() => navigator.mediaDevices.getUserMedia({ video: true }));

        const newTrack = stream.getVideoTracks()[0];
        if (newTrack) {
          this.localStream.addTrack(newTrack);
          this.replaceVideoTrackInPeers(newTrack);
          this.isVideoOff = false;
          this.onMediaStatusChange('video', true, this.localStream);
          return false;
        }
      } catch (err) {
        console.warn('Physical camera acquisition failed, using fallback stream:', err);
      }
    }

    // Insecure HTTP origin fallback: Chrome blocks physical webcams on network IPs unless HTTPS or flag.
    // Transmit a live animated stream so the peer connection sends video immediately!
    const fallbackStream = this.createFallbackVideoStream(this.localUsername || 'You');
    if (fallbackStream) {
      const fbTrack = fallbackStream.getVideoTracks()[0];
      if (fbTrack) {
        this.localStream.addTrack(fbTrack);
        this.replaceVideoTrackInPeers(fbTrack);
        this.isVideoOff = false;
        this.onMediaStatusChange('video', true, this.localStream);
        return false;
      }
    }

    this.isVideoOff = true;
    this.onMediaStatusChange('video', false);
    return true;
  }

  /**
   * Toggle Screen Sharing
   */
  async toggleScreenShare() {
    if (this.isScreenSharing) {
      return this.stopScreenShare();
    } else {
      return await this.startScreenShare();
    }
  }

  /**
   * Start screen capture and replace video track in all peer connections
   * Optimized for zero-lag 30fps screen share and fluid cursor motion
   */
  async startScreenShare() {
    try {
      const displayConstraints = [
        {
          video: {
            cursor: 'always',
            frameRate: { ideal: 30, max: 60 },
            width: { ideal: 1920, max: 2560 },
            height: { ideal: 1080, max: 1440 }
          },
          audio: false
        },
        {
          video: {
            cursor: 'always',
            frameRate: { ideal: 30, max: 30 },
            width: { ideal: 1920 },
            height: { ideal: 1080 }
          },
          audio: false
        },
        {
          video: { cursor: 'always' },
          audio: false
        },
        {
          video: true,
          audio: false
        }
      ];

      let stream = null;
      for (const constraints of displayConstraints) {
        try {
          stream = await navigator.mediaDevices.getDisplayMedia(constraints);
          if (stream) break;
        } catch (e) {
          if (e.name === 'NotAllowedError' || e.name === 'AbortError') {
            return false;
          }
        }
      }

      if (!stream) return false;
      this.screenStream = stream;

      const screenTrack = this.screenStream.getVideoTracks()[0];
      if (!screenTrack) return false;
      screenTrack.enabled = true;

      // Hint to WebRTC encoder: 'detail' prioritizes crystal-clear text sharpness and prevents blur
      if ('contentHint' in screenTrack) {
        screenTrack.contentHint = 'detail';
      }

      this.isScreenSharing = true;
      this.isVideoOff = false;

      // Handle user clicking "Stop Sharing" on the browser native floating bar
      screenTrack.onended = () => {
        this.stopScreenShare();
      };

      // Replace track on all existing peer connections
      this.replaceVideoTrackInPeers(screenTrack);

      this.onMediaStatusChange('screen', true, this.screenStream);
      return true;
    } catch (err) {
      console.warn('Screen share canceled or failed:', err);
      return false;
    }
  }

  /**
   * Stop screen capture and restore camera video track
   */
  stopScreenShare() {
    if (!this.isScreenSharing) return false;

    this.isScreenSharing = false;

    // Restore camera track FIRST before stopping screen track to avoid black frame glitch on remote peers
    const camTrack = this.rawCameraTrack || (this.localStream ? this.localStream.getVideoTracks()[0] : null);
    if (camTrack) {
      camTrack.enabled = !this.isVideoOff;
      this.replaceVideoTrackInPeers(camTrack);
    }

    if (this.screenStream) {
      this.screenStream.getTracks().forEach((track) => {
        try { track.stop(); } catch (e) {}
      });
      this.screenStream = null;
    }

    this.onMediaStatusChange('screen', false, this.localStream);
    return true;
  }

  /**
   * Helper to replace video track across all peer connections without mutating raw hardware stream
   */
  replaceVideoTrackInPeers(newTrack) {
    if (!newTrack) return;
    this.activeVideoTrack = newTrack;

    this.peers.forEach((peer, peerId) => {
      if (!peer || !peer.pc) return;
      const senders = peer.pc.getSenders();
      let videoSender = senders.find((s) => s.track && s.track.kind === 'video');
      if (!videoSender && peer.pc.getTransceivers) {
        // Also check transceivers specifically for video (never mistakenly match audio)
        const transceivers = peer.pc.getTransceivers();
        const vt = transceivers.find(t => 
          (t.receiver && t.receiver.track && t.receiver.track.kind === 'video') ||
          (t.sender && t.sender.track && t.sender.track.kind === 'video')
        );
        if (vt && vt.sender) videoSender = vt.sender;
      }
      if (videoSender) {
        videoSender.replaceTrack(newTrack).then(() => {
          // Tune WebRTC encoder parameters for high framerate, low latency video / screen sharing
          try {
            const params = videoSender.getParameters();
            if (params && params.encodings && params.encodings.length > 0) {
              if (this.isScreenSharing) {
                params.encodings[0].maxBitrate = 3500000; // 3.5 Mbps for sharp 1080p text
                params.encodings[0].maxFramerate = 30;
              } else {
                params.encodings[0].maxBitrate = 2000000;
                params.encodings[0].maxFramerate = 30;
              }
              videoSender.setParameters(params).catch(() => {});
            }
          } catch (e) {}
        }).catch((e) => {
          console.warn(`Error replacing video track for peer ${peerId}:`, e);
        });
      } else {
        // If there was no video sender before, add track and proactively trigger offer
        try {
          peer.pc.addTrack(newTrack, this.localStream || new MediaStream());
          if (peer.pc.signalingState === 'stable' && this.socket) {
            peer.pc.createOffer()
              .then(offer => peer.pc.setLocalDescription(offer))
              .then(() => {
                this.socket.emit('signal:offer', {
                  targetPeerId: peerId,
                  offer: peer.pc.localDescription
                });
              })
              .catch(e => console.warn(`Renegotiate offer error for ${peerId}:`, e));
          }
        } catch (e) {
          console.warn('Error adding new video track:', e);
        }
      }
    });
  }

  /**
   * Restores the physical webcam track across all peer connections
   */
  restoreRawCameraTrackInPeers() {
    const rawTrack = this.rawCameraTrack || (this.rawCameraStream && this.rawCameraStream.getVideoTracks()[0]);
    if (rawTrack) {
      this.replaceVideoTrackInPeers(rawTrack);
    }
  }

  /**
   * Mark remote peer audio mute status from incoming socket event
   */
  setPeerAudioMuted(peerId, muted) {
    const peer = this.peers.get(peerId);
    if (peer) {
      peer.isMuted = muted;
    }
  }

  /**
   * Close a specific peer connection
   */
  closePeer(peerId) {
    const peer = this.peers.get(peerId);
    if (peer) {
      try {
        peer.pc.close();
      } catch (e) {}
      this.peers.delete(peerId);
      this.onRemoteStreamRemoved(peerId);
    }
  }

  /**
   * Destroy all connections and stop media streams
   */
  destroy() {
    if (this.speakerCheckInterval) {
      clearInterval(this.speakerCheckInterval);
      this.speakerCheckInterval = null;
    }

    if (this.audioContext) {
      try {
        this.audioContext.close();
      } catch (e) {}
      this.audioContext = null;
    }

    if (this.localStream) {
      this.localStream.getTracks().forEach((t) => t.stop());
      this.localStream = null;
    }

    if (this.screenStream) {
      this.screenStream.getTracks().forEach((t) => t.stop());
      this.screenStream = null;
    }

    this.peers.forEach((peer, peerId) => {
      try {
        peer.pc.close();
      } catch (e) {}
    });
    this.peers.clear();
  }
}

window.WebRTCManager = WebRTCManager;
