/**
 * VVA Meet - Lightweight Realtime Engine
 * Drop-in Socket.io replacement powered by high-performance PHP & MySQL endpoints.
 * Tailored for BigRock Linux shared hosting (zero Node.js required).
 */

(function (window) {
  'use strict';

  // Helper to determine the API base path relative to the current script or URL
  function getApiBase() {
    // If page is /room/xyz or /room.php or /index.php
    const loc = window.location;
    const pathname = loc.pathname;
    
    // Check if in a subfolder e.g. /my-app/room/xyz
    const cleanPath = pathname.replace(/\/room\/[^\/]+$/, '').replace(/\/room\.php.*$/, '').replace(/\/index\.php.*$/, '').replace(/\/$/, '');
    return `${cleanPath}/api`;
  }

  const API_BASE = getApiBase();

  const COMMON_HEADERS = {
    'Content-Type': 'application/json',
    'Bypass-Tunnel-Reminder': 'true',
    'bypass-tunnel-reminder': 'true',
    'ngrok-skip-browser-warning': 'true',
    'X-Requested-With': 'XMLHttpRequest'
  };

  async function safeJson(res) {
    try {
      const text = await res.text();
      return JSON.parse(text);
    } catch (e) {
      return null;
    }
  }

  class RealtimeClient {
    constructor() {
      this.id = 'peer_' + Math.random().toString(36).substring(2, 10);
      this.roomId = null;
      this.username = 'Anonymous';
      this.userId = null;
      this.sessionId = null;
      
      this.eventListeners = new Map(); // event -> Set of callbacks
      this.knownParticipants = new Map(); // peerId -> participantObj
      this.peerMissCount = new Map(); // peerId -> consecutive missed heartbeats count
      this.peerMissTime = new Map(); // peerId -> timestamp when first missed from server presence
      
      this.lastMessageId = null;
      this.lastReactionId = 0;
      this.lastSignalId = 0;
      
      this.pollTimer = null;
      this.isPolling = false;
      this.pollInterval = 350; // 350ms ultra-low latency heartbeat for rapid signaling
      this.connected = false;

      // Handle page unload cleanly
      window.addEventListener('beforeunload', () => {
        this.leave();
      });

      // Emit connect event asynchronously on next tick so socket.on('connect') handlers execute immediately
      setTimeout(() => {
        this.connected = true;
        this.emitLocal('connect');
      }, 10);
    }

    /**
     * Subscribe to an event
     */
    on(event, callback) {
      if (!this.eventListeners.has(event)) {
        this.eventListeners.set(event, new Set());
      }
      this.eventListeners.get(event).add(callback);
      return this;
    }

    /**
     * Unsubscribe from an event
     */
    off(event, callback) {
      if (this.eventListeners.has(event)) {
        this.eventListeners.get(event).delete(callback);
      }
      return this;
    }

    /**
     * Internal event dispatcher
     */
    emitLocal(event, data) {
      if (this.eventListeners.has(event)) {
        this.eventListeners.get(event).forEach((cb) => {
          try {
            cb(data);
          } catch (err) {
            console.error(`Error in realtime handler for "${event}":`, err);
          }
        });
      }
    }

    /**
     * Emit an action to the server (Drop-in socket.emit compatibility)
     */
    emit(event, data = {}, callback = null) {
      switch (event) {
        case 'join-room':
          this.handleJoinRoom(data, callback);
          break;

        case 'send-chat-message':
          this.handleSendMessage(data, callback);
          break;

        case 'send-reaction':
          this.handleSendReaction(data, callback);
          break;

        case 'media-toggle':
          this.handleMediaToggle(data);
          break;

        case 'signal:offer':
          this.handleSendSignal('offer', data);
          break;

        case 'signal:answer':
          this.handleSendSignal('answer', data);
          break;

        case 'signal:ice-candidate':
          this.handleSendSignal('ice-candidate', data);
          break;

        case 'leave-room':
          this.leave();
          break;

        default:
          if (typeof event === 'string' && (event.startsWith('host:') || event.startsWith('lobby:') || event.startsWith('screen:') || event.startsWith('peer-'))) {
            this.handleSendSignal(event, data);
          } else {
            console.warn(`[RealtimeClient] Unhandled emit event: ${event}`);
          }
      }
    }

    /**
     * Join Room via PHP MySQL backend
     */
    async handleJoinRoom(payload, callback) {
      this.roomId = payload.roomId;
      this.username = payload.username;
      this.userId = payload.userId || `user_${Math.random().toString(36).substring(2, 9)}`;

      try {
        const passcode = payload.passcode || sessionStorage.getItem('meet_passcode_' + this.roomId) || '';

        const res = await fetch(`${API_BASE}/join.php`, {
          method: 'POST',
          headers: COMMON_HEADERS,
          body: JSON.stringify({
            peerId: this.id,
            roomId: this.roomId,
            username: this.username,
            userId: this.userId,
            passcode: passcode,
            audioMuted: Boolean(payload.audioMuted),
            videoOff: Boolean(payload.videoOff)
          })
        });

        const data = await safeJson(res);

        if (data && data.success) {
          this.connected = true;
          this.sessionId = data.sessionId;
          this.id = data.myPeerId;

          // Remember existing peers (filtering out only self peerId)
          const filteredPeers = Array.isArray(data.existingPeers)
            ? data.existingPeers.filter(p => p.peerId !== this.id)
            : [];

          filteredPeers.forEach((p) => {
            this.knownParticipants.set(p.peerId, p);
          });

          // Track last message ID from history so we don't duplicate
          if (Array.isArray(data.chatHistory) && data.chatHistory.length > 0) {
            const lastMsg = data.chatHistory[data.chatHistory.length - 1];
            this.lastMessageId = lastMsg.id;
          }

          this.emitLocal('connect');

          const ackResponse = {
            success: true,
            myPeerId: this.id,
            roomId: this.roomId,
            roomName: data.roomName,
            hasPasscode: Boolean(data.hasPasscode),
            hostId: data.hostId || null,
            hostName: data.hostName || '',
            isHost: Boolean(data.isHost),
            status: data.status || 'admitted',
            existingPeers: filteredPeers,
            chatHistory: data.chatHistory || []
          };
          this.localStatus = data.status || 'admitted';

          if (typeof callback === 'function') {
            callback(ackResponse);
          } else {
            this.emitLocal('room-joined', ackResponse);
          }

          // Start polling loop
          this.startSyncLoop();
        } else {
          const err = data?.error || 'Failed to connect to room';
          const passcodeRequired = Boolean(data?.passcodeRequired);
          if (typeof callback === 'function') {
            callback({ error: err, passcodeRequired: passcodeRequired });
          } else {
            this.emitLocal('join-error', { error: err, passcodeRequired: passcodeRequired });
          }
        }
      } catch (err) {
        console.error('[RealtimeClient] Join error:', err);
        if (typeof callback === 'function') callback({ error: err.message });
      }
    }

    /**
     * Send chat message to MySQL
     */
    async handleSendMessage({ messageText }, ack) {
      if (!this.roomId || !messageText) return;

      const messageId = 'msg_' + Math.random().toString(36).substring(2, 11);
      const payload = {
        id: messageId,
        roomId: this.roomId,
        senderName: this.username,
        messageText: messageText.trim()
      };

      try {
        const res = await fetch(`${API_BASE}/messages.php`, {
          method: 'POST',
          headers: COMMON_HEADERS,
          body: JSON.stringify(payload)
        });

        const data = await safeJson(res);
        if (data && data.success) {
          const savedMsg = data.message;
          this.lastMessageId = savedMsg.id;

          // Broadcast to local room listeners
          this.emitLocal('chat-message', {
            id: savedMsg.id,
            roomId: savedMsg.roomId,
            senderName: savedMsg.senderName,
            messageText: savedMsg.messageText,
            sentAt: savedMsg.sentAt
          });

          if (typeof ack === 'function') ack({ success: true, message: savedMsg });

          // Trigger immediate sync
          this.sync();
        } else if (typeof ack === 'function') {
          ack({ error: data?.error || 'Failed to send' });
        }
      } catch (err) {
        console.error('[RealtimeClient] Send message error:', err);
        if (typeof ack === 'function') ack({ error: err.message });
      }
    }

    /**
     * Send reaction to MySQL
     */
    async handleSendReaction({ emoji }) {
      if (!this.roomId || !emoji) return;

      try {
        const res = await fetch(`${API_BASE}/send_reaction.php`, {
          method: 'POST',
          headers: COMMON_HEADERS,
          body: JSON.stringify({
            roomId: this.roomId,
            senderId: this.id,
            senderName: this.username,
            emoji
          })
        });

        const data = await safeJson(res);
        if (data && data.reactionId) {
          if (data.reactionId > this.lastReactionId) {
            this.lastReactionId = data.reactionId;
          }
        }
      } catch (err) {
        console.error('[RealtimeClient] Reaction error:', err);
      }
    }

    /**
     * Toggle media status in MySQL
     */
    async handleMediaToggle({ type, enabled }) {
      if (!this.id) return;
      try {
        await fetch(`${API_BASE}/media_toggle.php`, {
          method: 'POST',
          headers: COMMON_HEADERS,
          body: JSON.stringify({
            peerId: this.id,
            type,
            enabled: Boolean(enabled)
          })
        });
      } catch (err) {
        console.warn('[RealtimeClient] Media toggle error:', err);
      }
    }

    /**
     * Relay WebRTC mesh signal through MySQL
     */
    async handleSendSignal(type, data) {
      if (!this.roomId || !data) return;

      const targetId = data.targetPeerId || data.targetId || 'all';
      const payload = data.offer || data.answer || data.candidate || data.payload || data;

      try {
        await fetch(`${API_BASE}/signal.php`, {
          method: 'POST',
          headers: COMMON_HEADERS,
          body: JSON.stringify({
            roomId: this.roomId,
            senderId: this.id,
            senderName: this.username,
            targetId,
            type,
            payload
          })
        });
        // Immediately trigger rapid sync to fetch responder's answer/candidates with minimal delay
        setTimeout(() => this.sync(), 20);
        setTimeout(() => this.sync(), 150);
      } catch (err) {
        console.warn(`[RealtimeClient] Signal ${type} error:`, err);
      }
    }

    /**
     * Start background sync poll
     */
    startSyncLoop() {
      if (this.pollTimer) clearInterval(this.pollTimer);
      this.pollTimer = setInterval(() => {
        this.sync();
      }, this.pollInterval);
    }

    /**
     * Perform atomic synchronization round
     */
    async sync() {
      if (this.isPolling || !this.roomId || !this.connected) return;
      this.isPolling = true;

      try {
        const res = await fetch(`${API_BASE}/sync.php`, {
          method: 'POST',
          headers: COMMON_HEADERS,
          body: JSON.stringify({
            peerId: this.id,
            roomId: this.roomId,
            username: this.username,
            userId: this.userId,
            lastMessageId: this.lastMessageId,
            lastReactionId: this.lastReactionId,
            lastSignalId: this.lastSignalId
          })
        });

        if (!res.ok) {
          throw new Error(`HTTP ${res.status}`);
        }

        const data = await safeJson(res);
        if (data && data.success) {
          // 1. Process new chat messages
          if (Array.isArray(data.newMessages)) {
            data.newMessages.forEach((msg) => {
              this.lastMessageId = msg.id;
              // Don't duplicate self-sent messages
              if (msg.senderName !== this.username) {
                this.emitLocal('chat-message', {
                  id: msg.id,
                  roomId: msg.roomId,
                  senderName: msg.senderName,
                  messageText: msg.messageText,
                  sentAt: msg.sentAt
                });
              }
            });
          }

          // 2. Process new emoji reactions
          if (Array.isArray(data.newReactions)) {
            data.newReactions.forEach((reaction) => {
              if (reaction.id > this.lastReactionId) {
                this.lastReactionId = reaction.id;
              }
              // Only trigger if reaction came from another peer
              if (reaction.senderId !== this.id) {
                this.emitLocal('peer-reaction', {
                  peerId: reaction.senderId,
                  senderName: reaction.senderName,
                  emoji: reaction.emoji
                });
              }
            });
          }

          // 3. Process WebRTC signals: strictly prioritize offer -> answer -> ice-candidate to prevent dropped candidates
          if (Array.isArray(data.newSignals) && data.newSignals.length > 0) {
            const signalPriority = { offer: 1, answer: 2, 'ice-candidate': 3 };
            const sortedSignals = [...data.newSignals].sort((a, b) => {
              const pa = signalPriority[a.type] || 4;
              const pb = signalPriority[b.type] || 4;
              if (pa !== pb) return pa - pb;
              return (a.id || 0) - (b.id || 0);
            });

            sortedSignals.forEach((sig) => {
              if (sig.id > this.lastSignalId) {
                this.lastSignalId = sig.id;
              }

              let parsedPayload = sig.payload;
              if (typeof parsedPayload === 'string') {
                try {
                  parsedPayload = JSON.parse(parsedPayload);
                } catch (e) {}
              }

              if (sig.type === 'offer') {
                this.emitLocal('signal:offer', {
                  callerId: sig.senderId,
                  callerName: sig.senderName,
                  offer: parsedPayload
                });
              } else if (sig.type === 'answer') {
                this.emitLocal('signal:answer', {
                  responderId: sig.senderId,
                  answer: parsedPayload
                });
              } else if (sig.type === 'ice-candidate') {
                this.emitLocal('signal:ice-candidate', {
                  senderId: sig.senderId,
                  candidate: parsedPayload
                });
              } else if (sig.type === 'user-left') {
                // Immediate notification that a peer clicked leave or closed their window
                const leftPeerId = (parsedPayload && parsedPayload.peerId) || sig.senderId;
                if (leftPeerId && leftPeerId !== this.id) {
                  this.knownParticipants.delete(leftPeerId);
                  this.peerMissCount.delete(leftPeerId);
                  this.peerMissTime.delete(leftPeerId);
                  this.emitLocal('user-left', {
                    peerId: leftPeerId,
                    username: (parsedPayload && parsedPayload.username) || sig.senderName || 'Participant'
                  });
                }
              } else {
                // Custom host, lobby, and room moderation signals
                this.emitLocal(sig.type, {
                  senderId: sig.senderId,
                  senderName: sig.senderName,
                  payload: parsedPayload,
                  ...(typeof parsedPayload === 'object' && parsedPayload !== null ? parsedPayload : {})
                });
              }
            });
          }

          // Check if server admitted this local participant
          if (Array.isArray(data.participants)) {
            const selfRecord = data.participants.find(p => p && p.peerId === this.id);
            if (selfRecord && selfRecord.status === 'admitted' && this.localStatus === 'waiting') {
              this.localStatus = 'admitted';
              this.emitLocal('lobby:admit', { admitted: true });
            }
          }

          // 4. Update participants presence (detect joins, leaves, and media toggles)
          if (Array.isArray(data.participants)) {
            const currentPeerIds = new Set();
            const waitingPeers = [];

            data.participants.forEach((p) => {
              if (!p || !p.peerId || p.peerId === this.id) return; // Skip self

              if (p.status === 'waiting') {
                waitingPeers.push(p);
                return;
              }

              currentPeerIds.add(p.peerId);
              this.peerMissCount.set(p.peerId, 0); // Reset miss count on active heartbeat

              if (!this.knownParticipants.has(p.peerId)) {
                // New user joined!
                this.knownParticipants.set(p.peerId, p);
                this.emitLocal('user-joined', {
                  peerId: p.peerId,
                  userId: p.userId,
                  username: p.username,
                  audioMuted: p.audioMuted,
                  videoOff: p.videoOff
                });
              } else {
                // Check for media status toggles
                const old = this.knownParticipants.get(p.peerId);
                if (old.audioMuted !== p.audioMuted) {
                  old.audioMuted = p.audioMuted;
                  this.emitLocal('peer-media-toggle', {
                    peerId: p.peerId,
                    username: p.username,
                    type: 'audio',
                    enabled: !p.audioMuted
                  });
                }
                if (old.videoOff !== p.videoOff) {
                  old.videoOff = p.videoOff;
                  this.emitLocal('peer-media-toggle', {
                    peerId: p.peerId,
                    username: p.username,
                    type: 'video',
                    enabled: !p.videoOff
                  });
                }
                if (old.isScreenSharing !== p.isScreenSharing) {
                  old.isScreenSharing = p.isScreenSharing;
                  this.emitLocal('peer-media-toggle', {
                    peerId: p.peerId,
                    username: p.username,
                    type: 'screen',
                    enabled: p.isScreenSharing
                  });
                }
                if (old.isHandRaised !== p.isHandRaised) {
                  old.isHandRaised = p.isHandRaised;
                  this.emitLocal('peer-media-toggle', {
                    peerId: p.peerId,
                    username: p.username,
                    type: 'hand',
                    enabled: Boolean(p.isHandRaised)
                  });
                }
              }
            });

            // Check if anyone disconnected unexpectedly without sending leave beacon
            const now = Date.now();
            for (const [peerId, participant] of this.knownParticipants.entries()) {
              if (!currentPeerIds.has(peerId)) {
                // If WebRTC is actively connected and streaming media, DO NOT drop the participant!
                const isWebrtcLive = (typeof webrtc !== 'undefined' && webrtc && webrtc.peers && webrtc.peers.has(peerId)) ?
                  (webrtc.peers.get(peerId).pc.connectionState === 'connected' || webrtc.peers.get(peerId).pc.iceConnectionState === 'connected') : false;

                if (isWebrtcLive) {
                  this.peerMissTime.delete(peerId);
                  this.peerMissCount.set(peerId, 0);
                  continue;
                }

                if (!this.peerMissTime.has(peerId)) {
                  this.peerMissTime.set(peerId, now);
                }

                const elapsedMissed = now - this.peerMissTime.get(peerId);
                // Require at least 45 seconds of continuous absence and disconnected WebRTC before declaring left
                if (elapsedMissed >= 45000) {
                  this.knownParticipants.delete(peerId);
                  this.peerMissCount.delete(peerId);
                  this.peerMissTime.delete(peerId);
                  this.emitLocal('user-left', {
                    peerId,
                    username: participant.username
                  });
                }
              } else {
                this.peerMissTime.delete(peerId);
                this.peerMissCount.set(peerId, 0);
              }
            }

            if (waitingPeers.length > 0 || this.hadWaitingPeers) {
              this.hadWaitingPeers = (waitingPeers.length > 0);
              this.emitLocal('lobby:waiting-peers', { waitingPeers });
            }
          }
        }
      } catch (err) {
        console.warn('[RealtimeClient] Sync loop warning:', err);
      } finally {
        this.isPolling = false;
      }
    }

    /**
     * Leave room and clean up
     */
    leave() {
      if (!this.connected) return;
      this.connected = false;

      if (this.pollTimer) {
        clearInterval(this.pollTimer);
        this.pollTimer = null;
      }

      const payload = JSON.stringify({
        peerId: this.id,
        sessionId: this.sessionId,
        roomId: this.roomId
      });

      // Best effort beacon for instantaneous departure
      try {
        const leaveSignal = JSON.stringify({
          roomId: this.roomId,
          senderId: this.id,
          senderName: this.username,
          targetId: 'all',
          type: 'user-left',
          payload: { peerId: this.id, username: this.username }
        });
        if (navigator.sendBeacon) {
          navigator.sendBeacon(`${API_BASE}/signal.php`, leaveSignal);
        }
      } catch (e) {}

      if (navigator.sendBeacon) {
        navigator.sendBeacon(`${API_BASE}/leave.php`, payload);
      } else {
        fetch(`${API_BASE}/leave.php`, {
          method: 'POST',
          headers: COMMON_HEADERS,
          body: payload,
          keepalive: true
        }).catch(() => {});
      }

      this.emitLocal('disconnect');
    }

    disconnect() {
      this.leave();
    }
  }

  // Expose as global io() factory for Socket.io drop-in compatibility only if not already provided
  if (typeof window.io === 'undefined') {
    window.io = function () {
      return new RealtimeClient();
    };
  }
  window.VVARealtimeClient = RealtimeClient;
  window.VortexRealtimeClient = RealtimeClient;
})(window);
