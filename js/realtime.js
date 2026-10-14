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

  class RealtimeClient {
    constructor() {
      this.id = 'peer_' + Math.random().toString(36).substring(2, 10);
      this.roomId = null;
      this.username = 'Anonymous';
      this.userId = null;
      this.sessionId = null;
      
      this.eventListeners = new Map(); // event -> Set of callbacks
      this.knownParticipants = new Map(); // peerId -> participantObj
      
      this.lastMessageId = null;
      this.lastReactionId = 0;
      this.lastSignalId = 0;
      
      this.pollTimer = null;
      this.isPolling = false;
      this.pollInterval = 1400; // 1.4 seconds fast heartbeat
      this.connected = false;

      // Handle page unload cleanly
      window.addEventListener('beforeunload', () => {
        this.leave();
      });
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
          console.warn(`[RealtimeClient] Unhandled emit event: ${event}`);
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
          headers: { 'Content-Type': 'application/json' },
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

        const data = await res.json();

        if (data && data.success) {
          this.connected = true;
          this.sessionId = data.sessionId;
          this.id = data.myPeerId;

          // Remember existing peers
          if (Array.isArray(data.existingPeers)) {
            data.existingPeers.forEach((p) => {
              this.knownParticipants.set(p.peerId, p);
            });
          }

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
            existingPeers: data.existingPeers || [],
            chatHistory: data.chatHistory || []
          };

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
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload)
        });

        const data = await res.json();
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
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            roomId: this.roomId,
            senderId: this.id,
            senderName: this.username,
            emoji
          })
        });

        const data = await res.json();
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
          headers: { 'Content-Type': 'application/json' },
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

      const targetId = data.targetPeerId;
      const payload = data.offer || data.answer || data.candidate;

      try {
        await fetch(`${API_BASE}/signal.php`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            roomId: this.roomId,
            senderId: this.id,
            senderName: this.username,
            targetId,
            type,
            payload
          })
        });
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
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            peerId: this.id,
            roomId: this.roomId,
            lastMessageId: this.lastMessageId,
            lastReactionId: this.lastReactionId,
            lastSignalId: this.lastSignalId
          })
        });

        if (!res.ok) {
          throw new Error(`HTTP ${res.status}`);
        }

        const data = await res.json();
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

          // 3. Process WebRTC signals
          if (Array.isArray(data.newSignals)) {
            data.newSignals.forEach((sig) => {
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
              }
            });
          }

          // 4. Update participants presence (detect joins, leaves, and media toggles)
          if (Array.isArray(data.participants)) {
            const currentPeerIds = new Set();

            data.participants.forEach((p) => {
              if (p.peerId === this.id) return; // Skip self

              currentPeerIds.add(p.peerId);

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
              }
            });

            // Check if anyone left
            for (const [peerId, participant] of this.knownParticipants.entries()) {
              if (!currentPeerIds.has(peerId)) {
                this.knownParticipants.delete(peerId);
                this.emitLocal('user-left', {
                  peerId,
                  username: participant.username
                });
              }
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
        sessionId: this.sessionId
      });

      // Best effort beacon for instantaneous departure
      if (navigator.sendBeacon) {
        navigator.sendBeacon(`${API_BASE}/leave.php`, payload);
      } else {
        fetch(`${API_BASE}/leave.php`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
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

  // Expose as global io() factory for Socket.io drop-in compatibility
  window.io = function () {
    return new RealtimeClient();
  };
  window.VVARealtimeClient = RealtimeClient;
  window.VortexRealtimeClient = RealtimeClient;
})(window);
