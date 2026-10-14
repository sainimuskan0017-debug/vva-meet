/**
 * WebRTC Mesh Network Manager
 * Handles multi-peer WebRTC connections, media streams, screen sharing, and audio visualizers.
 */

const RTC_CONFIG = {
  iceServers: [
    { urls: 'stun:stun.l.google.com:19302' },
    { urls: 'stun:stun1.l.google.com:19302' },
    { urls: 'stun:stun2.l.google.com:19302' }
  ]
};

class WebRTCManager {
  constructor({ onRemoteStream, onRemoteStreamRemoved, onActiveSpeaker, onMediaStatusChange }) {
    this.peers = new Map(); // peerId -> { pc, stream, candidateQueue, audioAnalyser }
    this.localStream = null;
    this.screenStream = null;
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
   * Acquire local user media (camera + microphone)
   */
  async initLocalMedia({ video = true, audio = true } = {}) {
    try {
      this.localStream = await navigator.mediaDevices.getUserMedia({
        video: video ? {
          width: { ideal: 1280 },
          height: { ideal: 720 },
          facingMode: 'user'
        } : false,
        audio: audio ? {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true
        } : false
      });

      this.isAudioMuted = !audio;
      this.isVideoOff = !video;

      this.setupLocalAudioAnalyser();
      return this.localStream;
    } catch (err) {
      console.warn('getUserMedia with full constraints failed, attempting fallback:', err);
      // Fallback: try audio-only or low constraint video if device is missing camera
      try {
        this.localStream = await navigator.mediaDevices.getUserMedia({
          video: false,
          audio: true
        });
        this.isVideoOff = true;
        this.isAudioMuted = false;
        this.setupLocalAudioAnalyser();
        return this.localStream;
      } catch (audioErr) {
        console.error('Failed to get any media stream:', audioErr);
        // Create an empty dummy stream so the participant can still join and listen/chat
        this.localStream = new MediaStream();
        this.isAudioMuted = true;
        this.isVideoOff = true;
        return this.localStream;
      }
    }
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
      return this.peers.get(peerId).pc;
    }

    const pc = new RTCPeerConnection(RTC_CONFIG);
    const peerData = {
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
      this.localStream.getTracks().forEach((track) => {
        pc.addTrack(track, this.localStream);
      });
    }

    // ICE Candidate event
    pc.onicecandidate = (event) => {
      if (event.candidate) {
        socket.emit('signal:ice-candidate', {
          targetPeerId: peerId,
          candidate: event.candidate
        });
      }
    };

    // Track received from remote peer
    pc.ontrack = (event) => {
      event.streams[0].getTracks().forEach((track) => {
        if (!peerData.remoteStream.getTracks().some(t => t.id === track.id)) {
          peerData.remoteStream.addTrack(track);
        }
      });

      // Hook up remote audio analyser for speaking detection
      this.setupRemoteAudioAnalyser(peerId, peerData.remoteStream);

      this.onRemoteStream(peerId, peerData.remoteStream);
    };

    // Connection state changes
    pc.onconnectionstatechange = () => {
      console.log(`[Peer: ${peerId}] Connection state: ${pc.connectionState}`);
      if (pc.connectionState === 'disconnected' || pc.connectionState === 'failed' || pc.connectionState === 'closed') {
        this.closePeer(peerId);
      }
    };

    pc.oniceconnectionstatechange = () => {
      console.log(`[Peer: ${peerId}] ICE state: ${pc.iceConnectionState}`);
      if (pc.iceConnectionState === 'disconnected' || pc.iceConnectionState === 'failed') {
        // Soft fallback
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
   * Handle incoming offer from a peer
   */
  async handleOffer(callerId, offer, socket) {
    const pc = this.createPeerConnection(callerId, socket, false);
    const peerData = this.peers.get(callerId);

    try {
      await pc.setRemoteDescription(new RTCSessionDescription(offer));

      // Drain queued ICE candidates
      if (peerData && peerData.candidateQueue.length > 0) {
        for (const cand of peerData.candidateQueue) {
          await pc.addIceCandidate(new RTCIceCandidate(cand));
        }
        peerData.candidateQueue = [];
      }

      const answer = await pc.createAnswer();
      await pc.setLocalDescription(answer);

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
      await peerData.pc.setRemoteDescription(new RTCSessionDescription(answer));

      // Drain queued ICE candidates
      if (peerData.candidateQueue.length > 0) {
        for (const cand of peerData.candidateQueue) {
          await peerData.pc.addIceCandidate(new RTCIceCandidate(cand));
        }
        peerData.candidateQueue = [];
      }
    } catch (err) {
      console.error(`Error handling answer from ${responderId}:`, err);
    }
  }

  /**
   * Handle incoming ICE candidate
   */
  async handleIceCandidate(senderId, candidate) {
    const peerData = this.peers.get(senderId);
    if (!peerData) return;

    try {
      if (peerData.pc.remoteDescription && peerData.pc.remoteDescription.type) {
        await peerData.pc.addIceCandidate(new RTCIceCandidate(candidate));
      } else {
        peerData.candidateQueue.push(candidate);
      }
    } catch (err) {
      console.error(`Error adding ICE candidate from ${senderId}:`, err);
    }
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
  toggleVideo(forceOff = null) {
    if (!this.localStream) return this.isVideoOff;

    const videoTracks = this.localStream.getVideoTracks();
    if (videoTracks.length === 0) return this.isVideoOff;

    this.isVideoOff = forceOff !== null ? forceOff : !this.isVideoOff;
    videoTracks.forEach((track) => {
      track.enabled = !this.isVideoOff;
    });

    this.onMediaStatusChange('video', !this.isVideoOff);
    return this.isVideoOff;
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
   */
  async startScreenShare() {
    try {
      this.screenStream = await navigator.mediaDevices.getDisplayMedia({
        video: { cursor: 'always' },
        audio: false
      });

      const screenTrack = this.screenStream.getVideoTracks()[0];
      if (!screenTrack) return false;

      this.isScreenSharing = true;

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

    if (this.screenStream) {
      this.screenStream.getTracks().forEach((track) => track.stop());
      this.screenStream = null;
    }

    this.isScreenSharing = false;

    // Restore camera track
    const camTrack = this.localStream ? this.localStream.getVideoTracks()[0] : null;
    if (camTrack) {
      this.replaceVideoTrackInPeers(camTrack);
    }

    this.onMediaStatusChange('screen', false, this.localStream);
    return true;
  }

  /**
   * Helper to replace video track across all peer connections
   */
  replaceVideoTrackInPeers(newTrack) {
    this.peers.forEach((peer) => {
      const senders = peer.pc.getSenders();
      const videoSender = senders.find((s) => s.track && s.track.kind === 'video');
      if (videoSender) {
        videoSender.replaceTrack(newTrack).catch((e) => {
          console.warn('Error replacing video track:', e);
        });
      } else if (newTrack) {
        // If there was no video sender before, add track
        try {
          peer.pc.addTrack(newTrack, this.localStream);
        } catch (e) {
          console.warn('Error adding new video track:', e);
        }
      }
    });
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
