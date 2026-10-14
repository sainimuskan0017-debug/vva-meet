/**
 * VVA Meet - Lightweight Zero-Dependency Local Dev Server
 * Built with Node.js native standard library (NO node_modules needed!).
 * 
 * NOTE FOR BIGROCK:
 * On your BigRock server, Apache & PHP run index.php, login.php, room.php, and MySQL natively.
 * This dev server is only for local testing on your computer (localhost:3000).
 */

const http = require('http');
const fs = require('fs');
const path = require('path');
const url = require('url');

const PORT = 3000;
const ROOT = path.resolve(__dirname);

// In-memory mock database for local testing
const state = {
  users: new Map([
    ['user_admin', { id: 'user_admin', username: 'Alex Admin', email: 'alex@gmail.com', password: 'password123', auth_provider: 'email' }]
  ]),
  rooms: new Map(), // roomId -> { id, room_name, passcode, host_id }
  participants: new Map(), // roomId -> Map(peerId -> participant)
  messages: new Map(), // roomId -> array of messages
  reactions: new Map(), // roomId -> array of reactions
  reactionIdSeq: 1,
  activeSession: null // Simulated session for local testing
};

// MIME types
const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.php': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.ico': 'image/x-icon'
};

// Simple PHP tag stripper/interpolator for local viewing
function renderPhpPage(filePath, reqUrl) {
  let content = fs.readFileSync(filePath, 'utf8');
  const parsed = url.parse(reqUrl, true);
  const q = parsed.query || {};

  const roomId = q.room || q.roomId || 'demo-room';
  const passcode = q.passcode || '';
  const tab = q.tab || 'signin';
  const redirect = q.redirect || 'index.php';

  const user = state.activeSession;
  const isLoggedIn = Boolean(user);

  // Strip initial PHP header logic
  content = content.replace(/^<\?php[\s\S]*?\?>/i, '');

  // Replace common PHP template tags
  content = content.replace(/<\?=\s*htmlspecialchars\(\$baseUrl\)\s*\?>/g, '/');
  content = content.replace(/<\?=\s*htmlspecialchars\(\$roomId\)\s*\?>/g, roomId);
  content = content.replace(/<\?=\s*htmlspecialchars\(\$passcode\)\s*\?>/g, passcode);
  content = content.replace(/<\?=\s*htmlspecialchars\(\$jitsiDomain\)\s*\?>/g, 'meet.jit.si');
  content = content.replace(/<\?=\s*json_encode\(\$jitsiDomain\)\s*\?>/g, JSON.stringify('meet.jit.si'));
  content = content.replace(/<\?=\s*json_encode\(\$conferenceEngine\)\s*\?>/g, JSON.stringify('webrtc'));
  content = content.replace(/<\?=\s*json_encode\(\$roomId\)\s*\?>/g, JSON.stringify(roomId));
  content = content.replace(/<\?=\s*json_encode\(\$passcode\)\s*\?>/g, JSON.stringify(passcode));
  content = content.replace(/<\?=\s*json_encode\(\$loggedInUser\)\s*\?>/g, JSON.stringify(user));
  content = content.replace(/<\?=\s*htmlspecialchars\(\$defaultRoom\)\s*\?>/g, q.room || '');
  content = content.replace(/<\?=\s*htmlspecialchars\(\$defaultPasscode\)\s*\?>/g, q.passcode || '');
  content = content.replace(/<\?=\s*htmlspecialchars\(\$redirectUrl\)\s*\?>/g, redirect);

  // Tab conditions in login.php
  content = content.replace(/<\?=\s*\$initialTab\s*===\s*'signin'\s*\?\s*'active'\s*:\s*''\s*\?>/g, tab === 'signin' ? 'active' : '');
  content = content.replace(/<\?=\s*\$initialTab\s*===\s*'signup'\s*\?\s*'active'\s*:\s*''\s*\?>/g, tab === 'signup' ? 'active' : '');
  content = content.replace(/<\?=\s*\$initialTab\s*===\s*'join'\s*\?\s*'active'\s*:\s*''\s*\?>/g, tab === 'join' ? 'active' : '');

  // Logged in user display
  content = content.replace(/<\?php\s*if\s*\(\$isLoggedIn\):\s*\?>([\s\S]*?)<\?php\s*else:\s*\?>([\s\S]*?)<\?php\s*endif;\s*\?>/g, (match, whenLoggedIn, whenLoggedOut) => {
    return isLoggedIn ? whenLoggedIn : whenLoggedOut;
  });

  if (user) {
    content = content.replace(/<\?=\s*htmlspecialchars\(\$loggedInUser\['username'\]\)\s*\?>/g, user.username);
    content = content.replace(/<\?=\s*htmlspecialchars\(substr\(\$loggedInUser\['id'\],\s*0,\s*8\)\)\s*\?>/g, user.id.slice(0, 8));
    content = content.replace(/<\?=\s*strtoupper\(substr\(\$loggedInUser\['username'\],\s*0,\s*1\)\)\s*\?>/g, user.username.charAt(0).toUpperCase());
  }

  // Remove any remaining raw <?php tags cleanly
  content = content.replace(/<\?php[\s\S]*?\?>/g, '');
  content = content.replace(/<\?=\s*.*?\s*\?>/g, '');

  return content;
}

// Request helper to parse JSON body
function getJsonBody(req) {
  return new Promise((resolve) => {
    let body = '';
    req.on('data', chunk => { body += chunk; });
    req.on('end', () => {
      try {
        resolve(JSON.parse(body || '{}'));
      } catch (e) {
        resolve({});
      }
    });
  });
}

const server = http.createServer(async (req, res) => {
  const parsedUrl = url.parse(req.url, true);
  let pathname = parsedUrl.pathname;
  const method = req.method;

  // CORS headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (method === 'OPTIONS') {
    res.writeHead(200);
    return res.end();
  }

  const sendJson = (statusCode, data) => {
    res.writeHead(statusCode, { 'Content-Type': 'application/json; charset=utf-8' });
    res.end(JSON.stringify(data));
  };

  // Route: Clean room URL /room/:roomId -> /room.php?room=:roomId
  const roomMatch = pathname.match(/^\/room\/([^\/]+)$/);
  if (roomMatch) {
    parsedUrl.query.room = decodeURIComponent(roomMatch[1]);
    pathname = '/room.php';
  }

  // 1. API ROUTES
  if (pathname === '/api/health.php' || pathname === '/api/health') {
    return sendJson(200, {
      status: 'healthy',
      mode: 'Local Zero-Dependency Dev Server',
      timestamp: new Date().toISOString()
    });
  }

  // Auth API
  if (pathname === '/api/auth.php' || pathname === '/api/auth') {
    const action = parsedUrl.query.action || (await getJsonBody(req)).action || 'me';
    const body = method === 'POST' ? await getJsonBody(req) : {};

    if (action === 'signup') {
      const { username, email, password, userId: customId } = body;
      if (!username || !email || !password) {
        return sendJson(400, { error: 'Please provide full name, email, and password.' });
      }
      const userId = (customId && customId.trim()) ? customId.trim() : ('usr_' + Math.random().toString(36).substring(2, 8));
      const user = { id: userId, username, email: email.toLowerCase(), password, auth_provider: 'email' };
      state.users.set(userId, user);
      state.activeSession = user;
      return sendJson(200, { success: true, user: { id: user.id, username: user.username, email: user.email } });
    }

    if (action === 'signin') {
      const { email, password } = body;
      const cleanEmail = (email || '').toLowerCase().trim();
      let found = null;
      for (const u of state.users.values()) {
        if (u.email === cleanEmail || u.username === email) {
          found = u;
          break;
        }
      }
      if (!found || found.password !== password) {
        // Allow demo login
        if (password.length >= 4) {
          found = { id: 'usr_' + Math.random().toString(36).substring(2, 8), username: email.split('@')[0], email: cleanEmail, auth_provider: 'email' };
          state.users.set(found.id, found);
        } else {
          return sendJson(401, { error: 'Invalid email or password.' });
        }
      }
      state.activeSession = found;
      return sendJson(200, { success: true, user: { id: found.id, username: found.username, email: found.email } });
    }

    if (action === 'google') {
      const { email, name } = body;
      const cleanEmail = (email || '').toLowerCase().trim();
      const userId = 'usr_' + Math.random().toString(36).substring(2, 8);
      const user = { id: userId, username: name || cleanEmail.split('@')[0], email: cleanEmail, auth_provider: 'google' };
      state.users.set(userId, user);
      state.activeSession = user;
      return sendJson(200, { success: true, user });
    }

    if (action === 'me') {
      return sendJson(200, {
        authenticated: Boolean(state.activeSession),
        user: state.activeSession
      });
    }

    if (action === 'logout') {
      state.activeSession = null;
      return sendJson(200, { success: true });
    }
  }

  // Join API
  if (pathname === '/api/join.php' || pathname === '/api/join') {
    const body = await getJsonBody(req);
    const { roomId, username, userId, peerId, passcode } = body;

    if (!roomId || !username) {
      return sendJson(400, { error: 'Room ID and Name required' });
    }

    // Room passcode check
    let room = state.rooms.get(roomId);
    if (!room) {
      room = { id: roomId, room_name: roomId, passcode: passcode || null, host_id: userId };
      state.rooms.set(roomId, room);
    } else if (room.passcode) {
      if (!passcode || room.passcode !== passcode.trim()) {
        return sendJson(403, {
          success: false,
          passcodeRequired: true,
          error: 'This meeting requires a valid passcode to enter.'
        });
      }
    }

    if (!state.participants.has(roomId)) {
      state.participants.set(roomId, new Map());
    }
    const roomParts = state.participants.get(roomId);

    const safePeerId = peerId || 'peer_' + Math.random().toString(36).substring(2, 9);
    roomParts.set(safePeerId, {
      peerId: safePeerId,
      userId: userId || 'usr_anon',
      username,
      audioMuted: Boolean(body.audioMuted),
      videoOff: Boolean(body.videoOff),
      isScreenSharing: false,
      lastSeen: Date.now(),
      joinedAt: new Date().toISOString()
    });

    const existingPeers = [];
    for (const [pId, p] of roomParts.entries()) {
      if (pId !== safePeerId) existingPeers.push(p);
    }

    const chatHistory = state.messages.get(roomId) || [];

    return sendJson(200, {
      success: true,
      myPeerId: safePeerId,
      sessionId: 'sess_' + Math.random().toString(36).substring(2, 9),
      roomId,
      roomName: room.room_name,
      hasPasscode: Boolean(room.passcode),
      existingPeers,
      chatHistory
    });
  }

  // Sync API
  if (pathname === '/api/sync.php' || pathname === '/api/sync') {
    const body = await getJsonBody(req);
    const { roomId, peerId, lastMessageId, lastReactionId = 0 } = body;

    if (!roomId) return sendJson(400, { error: 'roomId required' });

    const roomParts = state.participants.get(roomId);
    const now = Date.now();
    const activeParticipants = [];

    if (roomParts) {
      if (peerId && roomParts.has(peerId)) {
        roomParts.get(peerId).lastSeen = now;
      }
      for (const [pId, p] of roomParts.entries()) {
        if (now - p.lastSeen > 25000) {
          roomParts.delete(pId);
        } else {
          activeParticipants.push(p);
        }
      }
    }

    const allMsgs = state.messages.get(roomId) || [];
    let newMessages = [];
    if (lastMessageId) {
      const idx = allMsgs.findIndex(m => m.id === lastMessageId);
      if (idx !== -1) newMessages = allMsgs.slice(idx + 1);
    }

    const allReacts = state.reactions.get(roomId) || [];
    const newReactions = allReacts.filter(r => r.id > lastReactionId);

    return sendJson(200, {
      success: true,
      serverTime: new Date().toISOString(),
      participants: activeParticipants,
      newMessages,
      newReactions,
      newSignals: []
    });
  }

  // Messages API
  if (pathname === '/api/messages.php' || pathname === '/api/messages') {
    if (method === 'POST') {
      const body = await getJsonBody(req);
      const { roomId, senderName, messageText } = body;
      if (!roomId || !messageText) return sendJson(400, { error: 'Invalid message payload' });

      if (!state.messages.has(roomId)) state.messages.set(roomId, []);
      const msg = {
        id: body.id || 'msg_' + Math.random().toString(36).substring(2, 9),
        roomId,
        senderName: senderName || 'User',
        messageText: messageText.trim(),
        sentAt: new Date().toISOString()
      };
      state.messages.get(roomId).push(msg);
      return sendJson(200, { success: true, message: msg });
    } else {
      const roomId = parsedUrl.query.roomId || parsedUrl.query.room;
      const msgs = state.messages.get(roomId) || [];
      return sendJson(200, { roomId, count: msgs.length, messages: msgs });
    }
  }

  // Reactions API
  if (pathname === '/api/send_reaction.php' || pathname === '/api/send_reaction') {
    const body = await getJsonBody(req);
    const { roomId, senderId, senderName, emoji } = body;
    if (!roomId || !emoji) return sendJson(400, { error: 'Missing parameters' });

    if (!state.reactions.has(roomId)) state.reactions.set(roomId, []);
    const rId = state.reactionIdSeq++;
    const react = { id: rId, roomId, senderId, senderName, emoji, createdAt: new Date().toISOString() };
    const list = state.reactions.get(roomId);
    list.push(react);
    if (list.length > 50) list.shift();

    return sendJson(200, { success: true, reactionId: rId, emoji, senderName });
  }

  // Media toggle
  if (pathname === '/api/media_toggle.php' || pathname === '/api/media_toggle') {
    const body = await getJsonBody(req);
    const { peerId, type, enabled } = body;
    for (const roomParts of state.participants.values()) {
      if (roomParts.has(peerId)) {
        const p = roomParts.get(peerId);
        if (type === 'audio') p.audioMuted = !enabled;
        if (type === 'video') p.videoOff = !enabled;
        if (type === 'screen') p.isScreenSharing = Boolean(enabled);
        p.lastSeen = Date.now();
        break;
      }
    }
    return sendJson(200, { success: true });
  }

  // Leave API
  if (pathname === '/api/leave.php' || pathname === '/api/leave') {
    const body = await getJsonBody(req);
    const { peerId } = body;
    if (peerId) {
      for (const roomParts of state.participants.values()) {
        roomParts.delete(peerId);
      }
    }
    return sendJson(200, { success: true });
  }

  // 2. AUTH REDIRECTION: Anyone visiting our page must see login page first
  if (pathname === '/' || pathname === '/index.php') {
    if (!state.activeSession) {
      res.writeHead(302, { 'Location': '/login.php' });
      return res.end();
    }
  }

  if (pathname === '/login.php') {
    const action = parsedUrl.query.action;
    if (action === 'switch' || action === 'logout') {
      state.activeSession = null;
    } else if (state.activeSession && !parsedUrl.query.redirect) {
      res.writeHead(302, { 'Location': '/index.php' });
      return res.end();
    }
  }

  // 3. STATIC & WEB PAGE SERVING
  let safePath = pathname === '/' ? '/index.php' : pathname;
  let filePath = path.join(ROOT, safePath);

  // If path doesn't exist directly, check without leading slash or inside public
  if (!fs.existsSync(filePath)) {
    const publicPath = path.join(ROOT, 'public', safePath);
    if (fs.existsSync(publicPath)) {
      filePath = publicPath;
    }
  }

  if (fs.existsSync(filePath) && fs.statSync(filePath).isFile()) {
    const ext = path.extname(filePath).toLowerCase();

    // Render PHP templates as HTML
    if (ext === '.php') {
      try {
        const html = renderPhpPage(filePath, req.url);
        res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
        return res.end(html);
      } catch (err) {
        console.error('Render error:', err);
      }
    }

    const contentType = MIME_TYPES[ext] || 'application/octet-stream';
    res.writeHead(200, { 'Content-Type': contentType });
    return fs.createReadStream(filePath).pipe(res);
  }

  // Fallback to index.php
  const indexPath = path.join(ROOT, 'index.php');
  if (fs.existsSync(indexPath)) {
    const html = renderPhpPage(indexPath, req.url);
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
    return res.end(html);
  }

  res.writeHead(404, { 'Content-Type': 'text/plain' });
  res.end('404 Not Found');
});

server.listen(PORT, () => {
  console.log(`===============================================`);
  console.log(`🚀 VVA Meet Dev Server Running!`);
  console.log(`📡 URL: http://localhost:${PORT}`);
  console.log(`🔒 Login Portal: http://localhost:${PORT}/login.php`);
  console.log(`🎥 Meeting Room: http://localhost:${PORT}/room.php`);
  console.log(`📦 Zero npm dependencies - Pure standard library`);
  console.log(`===============================================`);
});
