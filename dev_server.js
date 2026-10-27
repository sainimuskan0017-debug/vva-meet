/**
 * VVA Meet - Zero-Dependency Local Dev Server & Tunnel Relay
 * Built entirely with Node.js standard library (http, fs, path, url).
 * Zero npm dependencies required.
 * 
 * Note: When deployed to BigRock hosting, Apache + PHP natively executes
 * the PHP files and MySQL database.
 */

const http = require('http');
const https = require('https');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const url = require('url');
const os = require('os');
const { spawn } = require('child_process');

process.on('uncaughtException', (err) => {
  console.error('[UNCAUGHT EXCEPTION PREVENTED CRASH]:', err);
});
process.on('unhandledRejection', (reason) => {
  console.error('[UNHANDLED REJECTION PREVENTED CRASH]:', reason);
});

const PORT = process.env.PORT || 3000;
const ROOT = path.resolve(__dirname);

// In-memory state for local testing
const state = {
  users: new Map([
    ['user_karan', { id: 'user_karan', username: 'Karan', email: 'karan@gmail.com', password: '123456', auth_provider: 'email' }],
    ['user_navdeep', { id: 'user_navdeep', username: 'Navdeep', email: 'navdeep@gmail.com', password: '123456', auth_provider: 'email' }],
    ['user_kashish', { id: 'user_kashish', username: 'Kashish', email: 'kashish@gmail.com', password: '123456', auth_provider: 'email' }],
    ['user_vishesha', { id: 'user_vishesha', username: 'Vishesha', email: 'vishesha@gmail.com', password: '123456', auth_provider: 'email' }]
  ]),
  authenticatedAccounts: new Map([
    ['user_karan', { id: 'user_karan', username: 'Karan', email: 'karan@gmail.com', isActive: true }],
    ['user_navdeep', { id: 'user_navdeep', username: 'Navdeep', email: 'navdeep@gmail.com', isActive: false }],
    ['user_kashish', { id: 'user_kashish', username: 'Kashish', email: 'kashish@gmail.com', isActive: false }],
    ['user_vishesha', { id: 'user_vishesha', username: 'Vishesha', email: 'vishesha@gmail.com', isActive: false }]
  ]),
  conferenceRooms: new Map(), // roomId -> live room conference state (never displayed as dashboard cards)
  rooms: new Map(), // roomId -> meeting room state
  sessions: new Map(), // roomId -> array of attendee session records
  participants: new Map(), // roomId -> Map(peerId -> participant)
  messages: new Map(), // roomId -> array of messages
  directMessages: new Map([
    ['user_karan:user_navdeep', [
      {
        id: 1,
        sender_id: 'user_navdeep',
        sender_name: 'Navdeep',
        receiver_id: 'user_karan',
        message_text: 'Hey Karan! Ready for our video conference?',
        is_read: 0,
        sent_at: new Date(Date.now() - 15 * 60000).toISOString(),
        created_at: new Date(Date.now() - 15 * 60000).toISOString()
      }
    ]],
    ['user_karan:user_kashish', [
      {
        id: 2,
        sender_id: 'user_kashish',
        sender_name: 'Kashish',
        receiver_id: 'user_karan',
        message_text: 'Thanks for sharing the meeting room link!',
        is_read: 1,
        sent_at: new Date(Date.now() - 60 * 60000).toISOString(),
        created_at: new Date(Date.now() - 60 * 60000).toISOString()
      }
    ]]
  ]),
  reactions: new Map(), // roomId -> array of reactions
  reactionIdSeq: 1,
  signals: new Map(), // roomId -> array of { id, senderId, senderName, targetId, type, payload, createdAt }
  signalIdSeq: 1,
  activeSession: { id: 'user_karan', username: 'Karan', email: 'karan@gmail.com', password: '123456', auth_provider: 'email' },
  tunnelUrl: '',
  networkIp: ''
};

function getPairKey(id1, id2) {
  return [id1, id2].sort().join(':');
}

// Detect local LAN IP for local network Wi-Fi device access
function getLocalNetworkIp() {
  try {
    const nets = os.networkInterfaces();
    for (const name of Object.keys(nets)) {
      for (const net of nets[name]) {
        if (net.family === 'IPv4' && !net.internal && !net.address.startsWith('169.254.')) {
          return `${net.address}:${PORT}`;
        }
      }
    }
  } catch (e) {}
  return null;
}
state.networkIp = getLocalNetworkIp();

// Cloudflare Tunnel Management
let cloudflaredProc = null;

function verifyTunnelUrl(urlStr, callback) {
  if (!urlStr) return callback(false);
  try {
    const u = new URL(urlStr);
    const req = https.request({
      hostname: u.hostname,
      port: 443,
      path: '/api/health.php',
      method: 'GET',
      timeout: 3500
    }, (res) => {
      callback(res.statusCode < 500);
    });
    req.on('error', () => callback(false));
    req.on('timeout', () => { req.destroy(); callback(false); });
    req.end();
  } catch (e) {
    callback(false);
  }
}

function startCloudflaredTunnel() {
  const cloudflaredBin = path.join(ROOT, 'cloudflared.exe');
  if (!fs.existsSync(cloudflaredBin)) return;

  try {
    cloudflaredProc = spawn(cloudflaredBin, ['tunnel', '--url', `http://localhost:${PORT}`], {
      stdio: ['ignore', 'pipe', 'pipe']
    });

    const onData = (data) => {
      const text = data.toString();
      const matches = text.match(/https:\/\/[a-zA-Z0-9-]+\.trycloudflare\.com/g);
      if (matches) {
        const realTunnel = matches.find(m => !m.includes('api.trycloudflare.com'));
        if (realTunnel) {
          state.tunnelUrl = realTunnel;
          try {
            fs.writeFileSync(path.join(ROOT, '.tunnel_url'), state.tunnelUrl, 'utf8');
          } catch (e) {}
          console.log(`📡 Cloudflare Live Tunnel Active: ${state.tunnelUrl}`);
        }
      }
    };

    cloudflaredProc.stdout.on('data', onData);
    cloudflaredProc.stderr.on('data', onData);

    cloudflaredProc.on('error', (err) => {
      console.warn('Could not launch cloudflared:', err.message);
    });

    cloudflaredProc.on('exit', () => {
      state.tunnelUrl = '';
      try {
        if (fs.existsSync(path.join(ROOT, '.tunnel_url'))) {
          fs.unlinkSync(path.join(ROOT, '.tunnel_url'));
        }
      } catch (e) {}
    });
  } catch (e) {
    console.warn('Failed to start cloudflared:', e.message);
  }
}

function initTunnel() {
  const tunnelFile = path.join(ROOT, '.tunnel_url');
  if (fs.existsSync(tunnelFile)) {
    try {
      const saved = fs.readFileSync(tunnelFile, 'utf8').trim();
      if (saved) {
        verifyTunnelUrl(saved, (isAlive) => {
          if (isAlive) {
            state.tunnelUrl = saved;
            console.log(`📡 Active Live Tunnel Confirmed: ${saved}`);
          } else {
            console.log(`⚠️ Tunnel ${saved} is unreachable/expired. Launching fresh tunnel...`);
            try { fs.unlinkSync(tunnelFile); } catch (e) {}
            startCloudflaredTunnel();
          }
        });
        return;
      }
    } catch (e) {}
  }
  startCloudflaredTunnel();
}

function updateTunnelUrl() {
  const tunnelFile = path.join(ROOT, '.tunnel_url');
  if (fs.existsSync(tunnelFile)) {
    try {
      state.tunnelUrl = fs.readFileSync(tunnelFile, 'utf8').trim();
    } catch (e) {}
  }
}

initTunnel();

// MIME Types
const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.php': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.wasm': 'application/wasm',
  '.tflite': 'application/octet-stream',
  '.binarypb': 'application/octet-stream',
  '.ico': 'image/x-icon'
};

function getSessionUser(req) {
  const cookieHeader = (req && req.headers && req.headers.cookie) || '';
  const match = cookieHeader.match(/(?:^|;\s*)vva_session=([^;]+)/);
  if (match) {
    const userId = decodeURIComponent(match[1]);
    if (state.users.has(userId)) {
      return state.users.get(userId);
    }
  }
  return null;
}

function renderPhpPage(filePath, reqUrl, req) {
  let content = fs.readFileSync(filePath, 'utf8');
  const parsed = url.parse(reqUrl, true);
  const q = parsed.query || {};

  updateTunnelUrl();

  const roomId = q.room || q.roomId || '';
  const passcode = q.passcode || '';
  const tab = q.tab || 'signin';
  const redirect = q.redirect || 'index.php';

  // Handle explicit logout/switch action: clear active session so login page shows correctly
  const action = q.action || '';
  const isClearingAccount = action === 'logout' || action === 'switch';
  if (isClearingAccount) {
    state.activeSession = null;
  }

  let user = isClearingAccount ? null : getSessionUser(req);
  if (q.asUser || q.user) {
    const targetKey = String(q.asUser || q.user).trim();
    if (state.users.has(targetKey)) {
      user = state.users.get(targetKey);
    } else {
      const match = Array.from(state.users.values()).find(
        u => u.username.toLowerCase() === targetKey.toLowerCase() ||
             u.id.toLowerCase() === targetKey.toLowerCase() ||
             u.email.toLowerCase() === targetKey.toLowerCase()
      );
      if (match) {
        user = match;
      } else {
        user = {
          id: 'user_' + targetKey.toLowerCase().replace(/[^a-z0-9_]/g, ''),
          username: targetKey,
          email: `${targetKey.toLowerCase()}@meet.local`,
          password: 'password123',
          auth_provider: 'email'
        };
        state.users.set(user.id, user);
      }
    }
  }
  const isLoggedIn = Boolean(user);

  // Strip initial PHP block
  content = content.replace(/^<\?php[\s\S]*?\?>/i, '');

  // Template replacements
  content = content.replace(/<\?=\s*htmlspecialchars\(\$baseUrl\)\s*\?>/g, '/');
  let roomObj = state.rooms.get(roomId) || state.conferenceRooms.get(roomId);
  if (!roomObj) {
    for (const r of [...state.rooms.values(), ...state.conferenceRooms.values()]) {
      if (r.id === roomId || r.room_name === roomId) {
        roomObj = r;
        break;
      }
    }
  }
  if (!roomObj) {
    roomObj = {
      id: roomId,
      room_name: roomId,
      title: 'Meeting Room',
      passcode: passcode || null,
      host_id: user ? user.id : 'user_karan',
      host_name: user ? user.username : 'Karan',
      status: 'active',
      is_dashboard_meeting: false,
      created_at: new Date().toISOString()
    };
    if (roomId) {
      state.conferenceRooms.set(roomId, roomObj);
    }
  }
  const hostId = roomObj.host_id;
  const hostName = roomObj.host_name;
  const isHost = Boolean(user && user.id === hostId);

  content = content.replace(/<\?=\s*htmlspecialchars\(\$roomId\)\s*\?>/g, roomId);
  content = content.replace(/<\?=\s*htmlspecialchars\(\$passcode\)\s*\?>/g, passcode);
  content = content.replace(/<\?=\s*htmlspecialchars\(\$jitsiDomain\)\s*\?>/g, 'meet.jit.si');
  content = content.replace(/<\?=\s*json_encode\(\$jitsiDomain\)\s*\?>/g, JSON.stringify('meet.jit.si'));
  content = content.replace(/<\?=\s*json_encode\(\$conferenceEngine\)\s*\?>/g, JSON.stringify('webrtc'));
  content = content.replace(/<\?=\s*json_encode\(\$roomId\)\s*\?>/g, JSON.stringify(roomId));
  content = content.replace(/<\?=\s*json_encode\(\$jitsiRoomName\)\s*\?>/g, JSON.stringify('VVAMeet_' + roomId));
  content = content.replace(/<\?=\s*json_encode\(\$passcode\)\s*\?>/g, JSON.stringify(passcode));
  content = content.replace(/<\?=\s*json_encode\(\$loggedInUser\)\s*\?>/g, JSON.stringify(user));
  content = content.replace(/<\?=\s*json_encode\(\$isUnlimitedMeeting\)\s*\?>/g, 'true');
  content = content.replace(/<\?=\s*json_encode\(\$meetingTitle\)\s*\?>/g, JSON.stringify(roomObj ? roomObj.title : 'VVA Meet Conference'));
  content = content.replace(/<\?=\s*json_encode\(\$roomRequiresPasscode\)\s*\?>/g, 'false');
  content = content.replace(/<\?=\s*json_encode\(\$meetingHostId\)\s*\?>/g, JSON.stringify(hostId));
  content = content.replace(/<\?=\s*json_encode\(\$meetingHostName\)\s*\?>/g, JSON.stringify(hostName));
  content = content.replace(/<\?=\s*json_encode\(\$isHost\)\s*\?>/g, JSON.stringify(isHost));

  // TURN credentials — turn.evan-brass.net (Verified active relay allocation)
  const dynamicIceServers = [
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
  content = content.split('<?= json_encode($dynamicIceServers) ?>').join(JSON.stringify(dynamicIceServers));

  content = content.replace(/<\?=\s*htmlspecialchars\(\$defaultRoom\)\s*\?>/g, q.room || '');
  content = content.replace(/<\?=\s*htmlspecialchars\(\$defaultPasscode\)\s*\?>/g, q.passcode || '');
  content = content.replace(/<\?=\s*htmlspecialchars\(\$redirectUrl\)\s*\?>/g, redirect);

  content = content.replace(/<\?=\s*\$initialTab\s*===\s*'signin'\s*\?\s*'active'\s*:\s*''\s*\?>/g, tab === 'signin' ? 'active' : '');
  content = content.replace(/<\?=\s*\$initialTab\s*===\s*'signup'\s*\?\s*'active'\s*:\s*''\s*\?>/g, tab === 'signup' ? 'active' : '');
  content = content.replace(/<\?=\s*\$initialTab\s*===\s*'join'\s*\?\s*'active'\s*:\s*''\s*\?>/g, tab === 'join' ? 'active' : '');

  // Account clearing / logout boolean replacement in scripts
  content = content.replace(/<\?=\s*\$isClearingAccount\s*\?\s*'true'\s*:\s*'false'\s*\?>/g, isClearingAccount ? 'true' : 'false');
  content = content.replace(/<\?=\s*!empty\(\$isClearingAccount\)\s*\?\s*['"]1['"]\s*:\s*['"]['"]\s*\?>/g, isClearingAccount ? '1' : '');

  // Logged-in user replacements and alreadyLoggedInUser banner handling
  if (user) {
    // Strip ONLY the PHP tags from the "already logged in" conditional block, keeping its HTML
    content = content.replace(/<\?php\s+if\s*\(\$alreadyLoggedInUser\):\s*\?>/g, '');
    content = content.replace(/<\?php\s+endif;\s*\?>/g, '');
    // Fill in alreadyLoggedInUser fields
    content = content.replace(/<\?=\s*htmlspecialchars\(\$alreadyLoggedInUser\['username'\]\)\s*\?>/g, user.username);
    content = content.replace(/<\?=\s*htmlspecialchars\(\$alreadyLoggedInUser\['email'\]\)\s*\?>/g, user.email);
    content = content.replace(/<\?=\s*strtoupper\(substr\(\$alreadyLoggedInUser\['username'\],\s*0,\s*1\)\)\s*\?>/g, user.username.charAt(0).toUpperCase());
    // Fill in loggedInUser fields
    content = content.replace(/<\?=\s*htmlspecialchars\(\$loggedInUser\['username'\]\)\s*\?>/g, user.username);
    content = content.replace(/<\?=\s*htmlspecialchars\(\$loggedInUser\['email'\](?:\s*\?:\s*[^)]+)?\)\s*\?>/g, user.email);
    content = content.replace(/<\?=\s*htmlspecialchars\(substr\(\$loggedInUser\['id'\],\s*0,\s*8\)\)\s*\?>/g, user.id.slice(0, 8));
    content = content.replace(/<\?=\s*strtoupper\(substr\(\$loggedInUser\['username'\],\s*0,\s*1\)\)\s*\?>/g, user.username.charAt(0).toUpperCase());
    content = content.replace(/<\?=\s*htmlspecialchars\(\$meetingHostName\)\s*\?>/g, hostName);
  } else {
    // Remove the entire "already logged in" PHP conditional block when no session
    content = content.replace(/<\?php\s+if\s*\(\$alreadyLoggedInUser\):[\s\S]*?<\?php\s+endif;\s*\?>/g, '');
    content = content.replace(/<\?=\s*htmlspecialchars\(\$meetingHostName\)\s*\?>/g, hostName);
  }

  // Inject tunnel URL & local network IP into page header
  const injectTags = [];
  if (state.tunnelUrl) {
    injectTags.push(`<script>window.SERVER_TUNNEL_URL = ${JSON.stringify(state.tunnelUrl)};</script>`);
  }
  if (state.networkIp) {
    injectTags.push(`<script>window.SERVER_NETWORK_IP = ${JSON.stringify(state.networkIp)};</script>`);
  }
  if (injectTags.length > 0) {
    content = content.replace(/<\/head>/i, `${injectTags.join('\n')}\n</head>`);
  }

  // Clean remaining PHP tags
  content = content.replace(/<\?php[\s\S]*?\?>/g, '');
  content = content.replace(/<\?=\s*.*?\s*\?>/g, '');

  return content;
}

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

  if (!pathname.startsWith('/css') && !pathname.startsWith('/assets') && !pathname.includes('health')) {
    console.log(`[REQ] ${method} ${req.url} UA:${(req.headers['user-agent'] || '').substring(0, 40)}`);
  }

  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Bypass-Tunnel-Reminder, bypass-tunnel-reminder, ngrok-skip-browser-warning, X-Requested-With');

  if (method === 'OPTIONS') {
    res.writeHead(200);
    return res.end();
  }

  const sendJson = (statusCode, data, setCookieHeader) => {
    const headers = { 'Content-Type': 'application/json; charset=utf-8' };
    if (setCookieHeader) {
      headers['Set-Cookie'] = setCookieHeader;
    }
    res.writeHead(statusCode, headers);
    res.end(JSON.stringify(data));
  };

  // Rewrite /room/:id -> /room.php?room=:id
  const roomMatch = pathname.match(/^\/room\/([^\/]+)$/);
  if (roomMatch) {
    parsedUrl.query.room = decodeURIComponent(roomMatch[1]);
    pathname = '/room.php';
  }

  // -------------------------------------------------------------
  // API Endpoints
  // -------------------------------------------------------------

  // Health
  if (pathname === '/api/health.php' || pathname === '/api/health') {
    return sendJson(200, {
      status: 'healthy',
      mode: 'Local Zero-Dependency Dev Server',
      database: { connected: true, driver: 'in-memory (dev)' },
      timestamp: new Date().toISOString()
    });
  }

  // Dynamic ICE Servers API
  if (pathname === '/api/ice_servers.php' || pathname === '/api/ice-servers') {
    return sendJson(200, {
      success: true,
      iceServers: [
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
      ]
    });
  }

  // Auth API
  if (pathname === '/api/auth.php' || pathname === '/api/auth') {
    const action = parsedUrl.query.action || 'me';

    if (action === 'signin') {
      const body = await getJsonBody(req);
      const { email, password } = body;
      const cleanEmail = (email || '').toLowerCase().trim();
      let foundUser = null;
      for (const u of state.users.values()) {
        if (u.email.toLowerCase() === cleanEmail || u.username.toLowerCase() === cleanEmail) {
          foundUser = u;
          break;
        }
      }
      if (foundUser) {
        if (foundUser.password && password && foundUser.password !== password) {
          return sendJson(401, { success: false, error: 'Incorrect password. Please try again.' });
        }
      } else {
        foundUser = {
          id: 'user_' + Math.random().toString(36).substring(2, 8),
          username: cleanEmail.split('@')[0],
          email: cleanEmail,
          password: password || 'password123',
          auth_provider: 'email'
        };
        state.users.set(foundUser.id, foundUser);
      }
      state.activeSession = foundUser;
      state.authenticatedAccounts.set(foundUser.id, { ...foundUser, isActive: true });
      const cookieHeader = `vva_session=${encodeURIComponent(foundUser.id)}; Path=/; HttpOnly; SameSite=Lax`;
      return sendJson(200, { success: true, user: foundUser }, cookieHeader);
    }

    if (action === 'signup') {
      const body = await getJsonBody(req);
      const cleanEmail = (body.email || '').toLowerCase().trim();
      const newUser = {
        id: body.userId || ('user_' + Math.random().toString(36).substring(2, 8)),
        username: body.username || (cleanEmail ? cleanEmail.split('@')[0] : 'User'),
        email: cleanEmail,
        password: body.password || 'password123',
        auth_provider: 'email'
      };
      state.users.set(newUser.id, newUser);
      state.activeSession = newUser;
      state.authenticatedAccounts.set(newUser.id, { ...newUser, isActive: true });
      const cookieHeader = `vva_session=${encodeURIComponent(newUser.id)}; Path=/; HttpOnly; SameSite=Lax`;
      return sendJson(200, { success: true, user: newUser }, cookieHeader);
    }

    if (action === 'google') {
      const body = await getJsonBody(req);
      const cleanEmail = (body.email || '').toLowerCase().trim();
      let foundUser = null;
      for (const u of state.users.values()) {
        if (u.email.toLowerCase() === cleanEmail) {
          foundUser = u;
          break;
        }
      }
      if (!foundUser) {
        foundUser = {
          id: 'user_' + Math.random().toString(36).substring(2, 8),
          username: body.name || cleanEmail.split('@')[0],
          email: cleanEmail,
          password: 'password123',
          auth_provider: 'google'
        };
        state.users.set(foundUser.id, foundUser);
      }
      state.activeSession = foundUser;
      state.authenticatedAccounts.set(foundUser.id, { ...foundUser, isActive: true });
      const cookieHeader = `vva_session=${encodeURIComponent(foundUser.id)}; Path=/; HttpOnly; SameSite=Lax`;
      return sendJson(200, { success: true, user: foundUser }, cookieHeader);
    }

    if (action === 'switch_account') {
      const body = await getJsonBody(req);
      const targetId = body.targetUserId || body.userId;
      const target = state.users.get(targetId);
      if (target) {
        state.activeSession = target;
        const list = [];
        for (const [id, acc] of state.authenticatedAccounts.entries()) {
          list.push({ ...acc, isActive: (id === target.id) });
        }
        const cookieHeader = `vva_session=${encodeURIComponent(target.id)}; Path=/; HttpOnly; SameSite=Lax`;
        return sendJson(200, { success: true, activeUser: target, accounts: list }, cookieHeader);
      }
      return sendJson(404, { error: 'Account not found' });
    }

    if (action === 'list_accounts') {
      const currentUser = getSessionUser(req);
      const list = [];
      for (const [id, acc] of state.authenticatedAccounts.entries()) {
        list.push({ ...acc, isActive: Boolean(currentUser && id === currentUser.id) });
      }
      return sendJson(200, { success: true, accounts: list });
    }

    if (action === 'remove_account') {
      const body = await getJsonBody(req);
      const targetUserId = body.targetUserId || body.userId;
      if (targetUserId) {
        state.authenticatedAccounts.delete(targetUserId);
      }
      const currentUser = getSessionUser(req);
      let nextUser = currentUser;
      let setCookie = null;
      if (currentUser && currentUser.id === targetUserId) {
        nextUser = state.authenticatedAccounts.values().next().value || null;
        if (nextUser) {
          state.activeSession = nextUser;
          setCookie = `vva_session=${encodeURIComponent(nextUser.id)}; Path=/; HttpOnly; SameSite=Lax`;
        } else {
          state.activeSession = null;
          setCookie = 'vva_session=; Path=/; Expires=Thu, 01 Jan 1970 00:00:00 GMT; HttpOnly';
        }
      }
      const list = [];
      for (const [id, acc] of state.authenticatedAccounts.entries()) {
        list.push({ ...acc, isActive: Boolean(nextUser && id === nextUser.id) });
      }
      return sendJson(200, { success: true, accounts: list, activeUser: nextUser }, setCookie);
    }

    if (action === 'me') {
      const currentUser = getSessionUser(req);
      return sendJson(200, {
        authenticated: Boolean(currentUser),
        user: currentUser || null
      });
    }

    if (action === 'logout') {
      state.activeSession = null;
      const clearCookie = `vva_session=; Path=/; Expires=Thu, 01 Jan 1970 00:00:00 GMT`;
      return sendJson(200, { success: true }, clearCookie);
    }

    if (action === 'switch' || action === 'add_account') {
      // For switch: keep multi-account list but clear active session so login page is shown
      state.activeSession = null;
      const clearCookie = `vva_session=; Path=/; Expires=Thu, 01 Jan 1970 00:00:00 GMT`;
      return sendJson(200, { success: true }, clearCookie);
    }
  }

  // Meetings API
  if (pathname === '/api/meetings.php' || pathname === '/api/meetings') {
    const action = parsedUrl.query.action || 'upcoming';
    const currentUser = getSessionUser(req) || { id: 'user_karan', username: 'Karan', email: 'karan@gmail.com' };

    if (action === 'upcoming' || action === 'list_upcoming') {
      const upcoming = Array.from(state.rooms.values())
        .filter(r => (r.status === 'scheduled' || r.status === 'active'))
        .map(r => ({
          id: r.id,
          roomId: r.id,
          room_name: r.room_name || r.id,
          title: r.title || r.room_name || r.id,
          display_title: r.title || r.room_name || r.id,
          description: r.description || '',
          host_id: r.host_id || (currentUser ? currentUser.id : 'user_karan'),
          host_name: r.host_name || (currentUser ? currentUser.username : 'Karan'),
          status: (state.participants.has(r.id) && state.participants.get(r.id).size > 0) ? 'active' : (r.status || 'scheduled'),
          scheduled_start: r.scheduled_start || r.created_at,
          created_at: r.created_at,
          join_url: `room.php?room=${encodeURIComponent(r.room_name || r.id)}`,
          is_host: Boolean(currentUser && r.host_id === currentUser.id)
        }));
      return sendJson(200, { success: true, meetings: upcoming, total: upcoming.length });
    }

    if (action === 'history') {
      const allRooms = Array.from(state.rooms.values());
      const history = allRooms.map(r => {
        let durationSec = r.calculated_duration_seconds || 0;
        if (!durationSec && r.actual_start) {
          if (r.actual_end) {
            durationSec = Math.max(0, Math.round((new Date(r.actual_end).getTime() - new Date(r.actual_start).getTime()) / 1000));
          } else if (r.status === 'active') {
            durationSec = Math.max(0, Math.round((Date.now() - new Date(r.actual_start).getTime()) / 1000));
          }
        }

        const roomSessions = state.sessions.get(r.id) || [];
        const uniqueAttendees = new Set(roomSessions.map(s => s.user_id)).size;
        const totalAttendees = r.total_attendees || uniqueAttendees || (state.participants.has(r.id) ? state.participants.get(r.id).size : 0);

        let meetingStatus = r.status || 'completed';
        const hasLiveParticipants = state.participants.has(r.id) && state.participants.get(r.id).size > 0;
        if (hasLiveParticipants) {
          meetingStatus = 'active';
        } else if (r.status === 'scheduled' || r.status === 'cancelled') {
          meetingStatus = r.status;
        } else if (r.actual_end) {
          meetingStatus = 'completed';
        } else if (r.status === 'active') {
          const hadAttendees = roomSessions.length > 0;
          const isJustCreated = (Date.now() - new Date(r.created_at || Date.now()).getTime()) < 120000;
          if (hadAttendees) {
            meetingStatus = 'completed';
          } else if (isJustCreated) {
            meetingStatus = 'active';
          } else {
            meetingStatus = 'completed';
          }
        }

        return {
          id: r.id,
          roomId: r.id,
          room_name: r.room_name || r.id,
          title: r.title || r.room_name || r.id,
          display_title: r.title || r.room_name || r.id,
          description: r.description || '',
          host_id: r.host_id || (currentUser ? currentUser.id : 'user_karan'),
          host_name: r.host_name || (currentUser ? currentUser.username : 'Karan'),
          status: meetingStatus,
          scheduled_start: r.scheduled_start || null,
          actual_start: r.actual_start || null,
          actual_end: r.actual_end || null,
          calculated_duration_seconds: durationSec,
          total_attendees: totalAttendees,
          created_at: r.created_at || new Date().toISOString(),
          join_url: `room.php?room=${encodeURIComponent(r.room_name || r.id)}`,
          is_host: Boolean(currentUser && r.host_id === currentUser.id)
        };
      });

      const search = (parsedUrl.query.search || '').toLowerCase().trim();
      const statusFilter = parsedUrl.query.status || 'all';
      let filtered = history;
      if (search) {
        filtered = filtered.filter(m => (m.title && m.title.toLowerCase().includes(search)) || m.id.toLowerCase().includes(search));
      }
      if (statusFilter && statusFilter !== 'all') {
        filtered = filtered.filter(m => m.status === statusFilter);
      }

      return sendJson(200, {
        success: true,
        meetings: filtered,
        total: filtered.length,
        page: 1,
        perPage: 15,
        totalPages: 1
      });
    }

    if (action === 'create_instant') {
      const body = await getJsonBody(req);
      const roomId = body.roomId || ('meet-' + Math.random().toString(36).substring(2, 9));
      const room = {
        id: roomId,
        room_name: roomId,
        title: body.title || 'Instant Meeting',
        description: body.description || '',
        host_id: currentUser ? currentUser.id : 'user_karan',
        host_name: currentUser ? currentUser.username : 'Karan',
        status: 'active',
        is_dashboard_meeting: true,
        actual_start: new Date().toISOString(),
        created_at: new Date().toISOString()
      };
      state.rooms.set(roomId, room);
      const joinUrl = `room.php?room=${encodeURIComponent(roomId)}`;
      return sendJson(200, {
        success: true,
        roomId,
        joinUrl,
        meeting: room
      });
    }

    if (action === 'schedule') {
      const body = await getJsonBody(req);
      const roomId = 'meet-' + Math.random().toString(36).substring(2, 9);
      let scheduledTime = new Date(Date.now() + 3600000).toISOString();
      if (body.date && body.startTime) {
        scheduledTime = new Date(`${body.date}T${body.startTime}`).toISOString();
      } else if (body.scheduledDate && body.scheduledTime) {
        scheduledTime = new Date(`${body.scheduledDate}T${body.scheduledTime}`).toISOString();
      }
      const room = {
        id: roomId,
        room_name: roomId,
        title: body.title || 'Scheduled Meeting',
        description: body.description || '',
        host_id: currentUser ? currentUser.id : 'user_karan',
        host_name: currentUser ? currentUser.username : 'Karan',
        status: 'scheduled',
        is_dashboard_meeting: true,
        scheduled_start: scheduledTime,
        duration_minutes: body.durationMinutes || 30,
        is_unlimited: body.durationMinutes === 0 || body.duration === 'unlimited',
        created_at: new Date().toISOString()
      };
      state.rooms.set(roomId, room);
      const joinUrl = `room.php?room=${encodeURIComponent(roomId)}`;
      return sendJson(200, {
        success: true,
        roomId,
        joinUrl,
        meeting: room
      });
    }

    if (action === 'details') {
      const mId = parsedUrl.query.id;
      let room = state.rooms.get(mId) || state.conferenceRooms.get(mId);
      if (!room) {
        for (const r of [...state.rooms.values(), ...state.conferenceRooms.values()]) {
          if (r.id === mId || r.room_name === mId) {
            room = r;
            break;
          }
        }
      }
      if (!room) {
        room = { id: mId, room_name: mId, title: mId, status: 'completed', host_name: 'Karan' };
      }
      const canonicalId = room.id || mId;
      const canonicalName = room.room_name || mId;
      const joinUrl = `room.php?room=${encodeURIComponent(canonicalName)}`;

      const rawAttendees = [
        ...(state.sessions.get(canonicalId) || []),
        ...(canonicalName !== canonicalId ? (state.sessions.get(canonicalName) || []) : [])
      ];
      const attendees = rawAttendees.slice();
      const messages = state.messages.get(canonicalId) || (canonicalName ? state.messages.get(canonicalName) : null) || [];

      // Check active participants map in case some live peers aren't yet in sessions
      const roomParts = state.participants.get(canonicalId) || (canonicalName ? state.participants.get(canonicalName) : null);
      if (roomParts) {
        for (const [pId, p] of roomParts.entries()) {
          if (!attendees.some(a => a.user_id === p.userId || a.peer_id === pId)) {
            const userObj = p.userId ? state.users.get(p.userId) : null;
            const newSess = {
              id: 'sess_' + Math.random().toString(36).substring(2, 9),
              user_id: p.userId || pId,
              username: p.username || 'Participant',
              email: userObj ? userObj.email : `${(p.username || 'user').toLowerCase().replace(/\s+/g, '.')}@example.com`,
              peer_id: pId,
              joined_at: p.joinedAt || room.actual_start || room.created_at || new Date().toISOString(),
              left_at: null,
              duration_seconds: 0
            };
            attendees.push(newSess);
          }
        }
      }

      // Consolidate multiple sessions per user
      const userMap = new Map();
      attendees.forEach(a => {
        const uId = a.user_id || a.username;
        let aDuration = a.duration_seconds || 0;
        if (!aDuration && a.joined_at) {
          const end = a.left_at ? new Date(a.left_at).getTime() : Date.now();
          aDuration = Math.max(0, Math.round((end - new Date(a.joined_at).getTime()) / 1000));
        }
        if (!userMap.has(uId)) {
          userMap.set(uId, {
            session_id: a.id,
            user_id: a.user_id,
            username: a.username,
            email: a.email || '-',
            joined_at: a.joined_at,
            left_at: a.left_at,
            attendance_duration: aDuration,
            duration_seconds: aDuration
          });
        } else {
          const existing = userMap.get(uId);
          existing.attendance_duration += aDuration;
          existing.duration_seconds += aDuration;
          if (!a.left_at) existing.left_at = null; // Still active in room
        }
      });
      const consolidatedAttendees = Array.from(userMap.values());

      let durationSec = room.calculated_duration_seconds || 0;
      if (!durationSec && room.actual_start) {
        if (room.actual_end) {
          durationSec = Math.max(0, Math.round((new Date(room.actual_end).getTime() - new Date(room.actual_start).getTime()) / 1000));
        } else if (room.status === 'active') {
          durationSec = Math.max(0, Math.round((Date.now() - new Date(room.actual_start).getTime()) / 1000));
        }
      }

      return sendJson(200, {
        success: true,
        meeting: {
          ...room,
          display_title: room.title || room.room_name || room.id,
          calculated_duration_seconds: durationSec,
          join_url: joinUrl,
          is_host: Boolean(currentUser && room.host_id === currentUser.id)
        },
        attendees: consolidatedAttendees,
        total_attendees: consolidatedAttendees.length,
        total_messages: messages.length
      });
    }

    if (action === 'verify_join') {
      const body = await getJsonBody(req);
      const input = body.meetingInput || body.roomId || parsedUrl.query.roomId || '';
      let targetRoom = input;
      if (input.includes('room=')) {
        const match = input.match(/[?&]room=([^&#]+)/);
        if (match) targetRoom = decodeURIComponent(match[1]);
      } else if (input.includes('/room/')) {
        const match = input.match(/\/room\/([^/?#]+)/);
        if (match) targetRoom = decodeURIComponent(match[1]);
      }
      targetRoom = targetRoom.replace(/[^a-zA-Z0-9_\-]/g, '');
      const targetUrl = `room.php?room=${encodeURIComponent(targetRoom)}`;
      return sendJson(200, { success: true, targetUrl, roomId: targetRoom });
    }

    if (action === 'update') {
      const body = await getJsonBody(req);
      const mId = body.meetingId || body.meeting_id || body.id;
      if (mId && state.rooms.has(mId)) {
        const r = state.rooms.get(mId);
        if (body.title) r.title = body.title;
        if (body.description !== undefined) r.description = body.description;
        if (body.date && body.startTime) {
          r.scheduled_start = new Date(`${body.date}T${body.startTime}`).toISOString();
        }
        if (body.durationMinutes !== undefined) {
          r.duration_minutes = body.durationMinutes;
          r.is_unlimited = Boolean(body.isUnlimited || body.durationMinutes === 0);
        }
      }
      return sendJson(200, { success: true });
    }

    if (action === 'cancel' || action === 'delete') {
      const body = await getJsonBody(req);
      const mId = body.meetingId || body.meeting_id || body.id || parsedUrl.query.id || parsedUrl.query.meetingId;
      if (mId) {
        state.rooms.delete(mId);
        state.conferenceRooms.delete(mId);
        state.sessions.delete(mId);
        state.messages.delete(mId);
        state.participants.delete(mId);
      }
      return sendJson(200, { success: true, message: 'Meeting deleted successfully' });
    }

    if (action === 'clear_history') {
      for (const id of state.rooms.keys()) {
        state.rooms.delete(id);
        state.sessions.delete(id);
      }
      return sendJson(200, { success: true, message: 'Meeting history cleared' });
    }
  }

  // Contacts API
  if (pathname === '/api/contacts.php' || pathname === '/api/contacts') {
    const action = parsedUrl.query.action || 'list';
    if (action === 'heartbeat') {
      return sendJson(200, { success: true });
    }

    const currentUser = getSessionUser(req);
    const otherContacts = Array.from(state.users.values())
      .filter(u => !currentUser || u.id !== currentUser.id)
      .map(u => ({
        id: u.id,
        username: u.username,
        email: u.email,
        avatar_url: '',
        is_online: true,
        last_seen: new Date().toISOString()
      }));

    return sendJson(200, {
      success: true,
      contacts: otherContacts,
      total: otherContacts.length,
      active_count: otherContacts.length,
      total_active: otherContacts.length
    });
  }

  // Chat API
  if (pathname === '/api/chat.php' || pathname === '/api/chat') {
    const action = parsedUrl.query.action || 'conversations';
    const currentUser = getSessionUser(req);
    const myId = (currentUser || {}).id || 'user_karan';
    const myName = (currentUser || {}).username || 'Karan';

    if (action === 'unread_count') {
      let totalUnread = 0;
      for (const [pair, msgList] of state.directMessages.entries()) {
        if (pair.includes(myId)) {
          for (const m of msgList) {
            if (m.receiver_id === myId && !m.is_read) totalUnread++;
          }
        }
      }
      return sendJson(200, { success: true, unread_count: totalUnread, total_unread: totalUnread });
    }

    if (action === 'conversations') {
      let totalUnread = 0;
      const convos = Array.from(state.users.values())
        .filter(u => u.id !== myId)
        .map(u => {
          const pairKey = getPairKey(myId, u.id);
          const msgList = state.directMessages.get(pairKey) || [];
          let unread = 0;
          for (const m of msgList) {
            if (m.receiver_id === myId && !m.is_read) unread++;
          }
          totalUnread += unread;
          const lastMsg = msgList.length > 0 ? msgList[msgList.length - 1] : null;
          return {
            user_id: u.id,
            username: u.username,
            email: u.email,
            avatar_url: '',
            is_online: true,
            unread_count: unread,
            last_message: lastMsg ? lastMsg.message_text : 'Started a conversation',
            last_time: lastMsg ? (lastMsg.sent_at || lastMsg.created_at) : new Date().toISOString()
          };
        });
      return sendJson(200, { success: true, conversations: convos, total_unread: totalUnread });
    }

    if (action === 'messages') {
      const contactId = parsedUrl.query.contact_id || parsedUrl.query.contactId || 'user_sarah';
      const contact = state.users.get(contactId) || { id: contactId, username: 'Contact', email: '' };
      const pairKey = getPairKey(myId, contactId);
      const msgList = state.directMessages.get(pairKey) || [];
      return sendJson(200, {
        success: true,
        contact: {
          id: contact.id,
          username: contact.username,
          email: contact.email,
          is_online: true
        },
        messages: msgList
      });
    }

    if (action === 'send') {
      const body = await getJsonBody(req);
      const receiverId = body.receiver_id || body.receiverId;
      const text = (body.message_text || body.messageText || '').trim();
      if (!receiverId || !text) {
        return sendJson(400, { error: 'Receiver ID and message required' });
      }
      const pairKey = getPairKey(myId, receiverId);
      if (!state.directMessages.has(pairKey)) {
        state.directMessages.set(pairKey, []);
      }
      const nowIso = new Date().toISOString();
      const msgObj = {
        id: Date.now(),
        sender_id: myId,
        sender_name: myName,
        receiver_id: receiverId,
        message_text: text,
        is_read: 0,
        sent_at: nowIso,
        created_at: nowIso
      };
      state.directMessages.get(pairKey).push(msgObj);
      return sendJson(200, { success: true, message: msgObj });
    }

    if (action === 'mark_read') {
      const body = await getJsonBody(req);
      const contactId = parsedUrl.query.contact_id || parsedUrl.query.contactId || body.contact_id || body.contactId;
      if (contactId) {
        const pairKey = getPairKey(myId, contactId);
        const msgList = state.directMessages.get(pairKey) || [];
        for (const m of msgList) {
          if (m.receiver_id === myId) {
            m.is_read = 1;
          }
        }
      }
      return sendJson(200, { success: true });
    }
  }

  // Profile API
  if (pathname === '/api/profile.php' || pathname === '/api/profile') {
    const currentUser = getSessionUser(req) || { id: 'user_karan', username: 'Karan', email: 'karan@gmail.com' };
    return sendJson(200, { success: true, user: currentUser });
  }

  // Join Room API
  if (pathname === '/api/join.php' || pathname === '/api/join') {
    const body = await getJsonBody(req);
    const { roomId, username, userId, peerId, passcode } = body;

    if (!roomId || !username) {
      return sendJson(400, { error: 'Room ID and Name required' });
    }

    let room = state.rooms.get(roomId) || state.conferenceRooms.get(roomId);
    if (!room) {
      room = {
        id: roomId,
        room_name: roomId,
        title: roomId,
        host_id: userId,
        host_name: username,
        status: 'active',
        actual_start: new Date().toISOString(),
        is_dashboard_meeting: true,
        created_at: new Date().toISOString()
      };
      state.rooms.set(roomId, room);
    } else {
      if (!room.host_id) {
        room.host_id = userId;
        room.host_name = username;
      }
      if (!room.actual_start) {
        room.actual_start = new Date().toISOString();
      }
      room.status = 'active';
    }

    const isHost = (room.host_id === userId);

    if (!state.participants.has(roomId)) {
      state.participants.set(roomId, new Map());
    }
    const roomParts = state.participants.get(roomId);

    // Track persistent session & attendee roster
    if (!state.sessions.has(roomId)) {
      state.sessions.set(roomId, []);
    }
    const roomSessions = state.sessions.get(roomId);
    const userObj = userId ? state.users.get(userId) : null;
    const safeUsername = String(username || 'Guest');
    const email = userObj ? userObj.email : ((userId && typeof userId === 'string' && userId.includes('@')) ? userId : `${safeUsername.toLowerCase().replace(/\s+/g, '.')}@example.com`);

    let existingSession = roomSessions.find(s => (s.user_id === userId || (peerId && s.peer_id === peerId)) && !s.left_at);
    if (!existingSession) {
      existingSession = {
        id: 'sess_' + Math.random().toString(36).substring(2, 9),
        user_id: userId || 'usr_anon',
        username: username,
        email: email,
        peer_id: peerId,
        joined_at: new Date().toISOString(),
        left_at: null,
        duration_seconds: 0
      };
      roomSessions.push(existingSession);
    } else {
      if (peerId) existingSession.peer_id = peerId;
      if (username) existingSession.username = username;
    }
    room.total_attendees = new Set(roomSessions.map(s => s.user_id)).size;

    // Check if host is currently present
    let hostIsPresent = false;
    for (const [pId, p] of roomParts.entries()) {
      if (p.userId === room.host_id && pId !== peerId) {
        hostIsPresent = true;
        break;
      }
    }

    // Host is always admitted. Any attendee enters waiting lobby until approved by host
    const participantStatus = isHost ? 'admitted' : 'waiting';

    const safePeerId = peerId || 'peer_' + Math.random().toString(36).substring(2, 9);
    roomParts.set(safePeerId, {
      peerId: safePeerId,
      userId: userId || 'usr_anon',
      username,
      audioMuted: Boolean(body.audioMuted),
      videoOff: Boolean(body.videoOff),
      isScreenSharing: false,
      status: participantStatus,
      lastSeen: Date.now(),
      joinedAt: new Date().toISOString()
    });

    const existingPeers = [];
    if (participantStatus === 'admitted') {
      for (const [pId, p] of roomParts.entries()) {
        if (pId !== safePeerId && p.status === 'admitted') existingPeers.push(p);
      }
    }

    const chatHistory = state.messages.get(roomId) || [];

    return sendJson(200, {
      success: true,
      myPeerId: safePeerId,
      sessionId: existingSession.id,
      roomId,
      roomName: room.room_name,
      hasPasscode: false,
      hostId: room.host_id,
      hostName: room.host_name || (isHost ? username : 'Host'),
      isHost: Boolean(isHost),
      status: participantStatus,
      existingPeers,
      chatHistory
    });
  }

  // Admit / Deny Waiting Participant API
  if (pathname === '/api/admit.php' || pathname === '/api/admit') {
    const body = await getJsonBody(req);
    const { roomId, peerId, action } = body;
    if (state.participants.has(roomId)) {
      const roomParts = state.participants.get(roomId);
      if (action === 'admit') {
        if (roomParts.has(peerId)) {
          roomParts.get(peerId).status = 'admitted';
        }
        if (!state.signals.has(roomId)) state.signals.set(roomId, []);
        const sigList = state.signals.get(roomId);
        sigList.push({
          id: state.signalIdSeq++,
          roomId,
          senderId: 'host',
          senderName: 'Host',
          targetId: peerId,
          type: 'lobby:admit',
          payload: JSON.stringify({ admitted: true }),
          createdAt: new Date().toISOString()
        });
      } else if (action === 'deny') {
        roomParts.delete(peerId);
        if (!state.signals.has(roomId)) state.signals.set(roomId, []);
        const sigList = state.signals.get(roomId);
        sigList.push({
          id: state.signalIdSeq++,
          roomId,
          senderId: 'host',
          senderName: 'Host',
          targetId: peerId,
          type: 'lobby:deny',
          payload: JSON.stringify({ denied: true }),
          createdAt: new Date().toISOString()
        });
      }
    }
    return sendJson(200, { success: true, action, peerId });
  }

  // Transfer Host API
  if (pathname === '/api/make_host.php' || pathname === '/api/make_host') {
    const body = await getJsonBody(req);
    const { roomId, newHostId, newHostName } = body;
    if (state.rooms.has(roomId)) {
      const room = state.rooms.get(roomId);
      room.host_id = newHostId;
      if (newHostName) room.host_name = newHostName;
    }
    if (state.conferenceRooms.has(roomId)) {
      const room = state.conferenceRooms.get(roomId);
      room.host_id = newHostId;
      if (newHostName) room.host_name = newHostName;
    }
    if (!state.signals.has(roomId)) state.signals.set(roomId, []);
    const sigList = state.signals.get(roomId);
    sigList.push({
      id: state.signalIdSeq++,
      roomId,
      senderId: 'system',
      senderName: 'System',
      targetId: 'all',
      type: 'host:make-host',
      payload: JSON.stringify({ newHostId, newHostName }),
      createdAt: new Date().toISOString()
    });
    return sendJson(200, { success: true, newHostId, newHostName });
  }

  // WebRTC Signal API (Critical for live peer video/audio relay)
  if (pathname === '/api/signal.php' || pathname === '/api/signal') {
    const body = await getJsonBody(req);
    const { roomId, senderId, senderName, targetId, type, payload } = body;

    if (!roomId || !senderId || !targetId || !type) {
      return sendJson(400, { error: 'Missing signal parameters' });
    }

    console.log(`[SIGNAL] room:${roomId} from:${senderId} to:${targetId} type:${type}`);

    if (!state.signals.has(roomId)) {
      state.signals.set(roomId, []);
    }
    const sId = state.signalIdSeq++;
    const sig = {
      id: sId,
      roomId,
      senderId,
      senderName: senderName || 'Peer',
      targetId,
      type,
      payload: typeof payload === 'string' ? payload : JSON.stringify(payload),
      createdAt: new Date().toISOString()
    };
    const sigList = state.signals.get(roomId);
    sigList.push(sig);
    if (sigList.length > 200) sigList.shift();

    return sendJson(200, { success: true, signalId: sId });
  }

  // Sync / Heartbeat API
  if (pathname === '/api/sync.php' || pathname === '/api/sync') {
    const body = await getJsonBody(req);
    const { roomId, peerId, lastMessageId, lastReactionId = 0, lastSignalId = 0 } = body;

    if (!roomId) return sendJson(400, { error: 'roomId required' });

    if (!state.participants.has(roomId)) {
      state.participants.set(roomId, new Map());
    }
    const roomParts = state.participants.get(roomId);
    const now = Date.now();
    const activeParticipants = [];

    if (peerId) {
      if (roomParts.has(peerId)) {
        roomParts.get(peerId).lastSeen = now;
      } else {
        // Auto-heal / re-register participant presence so they are never accidentally dropped
        const sessionUser = getSessionUser(req);
        const name = body.username || (sessionUser ? sessionUser.username : ('User_' + peerId.substring(peerId.length - 4)));
        const uid = body.userId || (sessionUser ? sessionUser.id : ('usr_' + peerId.substring(peerId.length - 4)));
        const room = state.rooms.get(roomId) || state.conferenceRooms.get(roomId);
        const isHost = Boolean(room && room.host_id === uid);
        roomParts.set(peerId, {
          peerId,
          userId: uid,
          username: name,
          audioMuted: false,
          videoOff: false,
          isScreenSharing: false,
          status: isHost ? 'admitted' : 'waiting',
          lastSeen: now,
          joinedAt: new Date().toISOString()
        });
      }
    }

    for (const [pId, p] of roomParts.entries()) {
      if (now - p.lastSeen > 60000) { // 60s timeout prunes ghost peers while preventing false disconnects on background tabs or lag
        roomParts.delete(pId);
        const roomSessions = state.sessions.get(roomId);
        if (roomSessions) {
          const sess = roomSessions.find(s => (s.user_id === p.userId || s.peer_id === pId) && !s.left_at);
          if (sess) {
            sess.left_at = new Date().toISOString();
            sess.duration_seconds = Math.max(1, Math.round((new Date(sess.left_at).getTime() - new Date(sess.joined_at).getTime()) / 1000));
          }
        }
        if (roomParts.size === 0) {
          const room = state.rooms.get(roomId) || state.conferenceRooms.get(roomId);
          if (room && room.status === 'active') {
            room.status = 'completed';
            room.actual_end = new Date().toISOString();
            if (room.actual_start) {
              room.calculated_duration_seconds = Math.max(1, Math.round((new Date(room.actual_end).getTime() - new Date(room.actual_start).getTime()) / 1000));
            }
          }
        }
      } else {
        activeParticipants.push(p);
      }
    }

    const allMsgs = state.messages.get(roomId) || [];
    let newMessages = [];
    if (lastMessageId) {
      const idx = allMsgs.findIndex(m => m.id === lastMessageId);
      if (idx !== -1) newMessages = allMsgs.slice(idx + 1);
    } else {
      newMessages = allMsgs.slice(-10);
    }

    const allReacts = state.reactions.get(roomId) || [];
    const newReactions = allReacts.filter(r => r.id > lastReactionId);

    const allSignals = state.signals.get(roomId) || [];
    const newSignals = allSignals.filter(s => s.id > lastSignalId && (s.targetId === peerId || s.targetId === 'all'));

    return sendJson(200, {
      success: true,
      serverTime: new Date().toISOString(),
      participants: activeParticipants,
      newMessages,
      newReactions,
      newSignals
    });
  }

  // Messages API
  if (pathname === '/api/messages.php' || pathname === '/api/messages') {
    if (method === 'POST') {
      const body = await getJsonBody(req);
      const { roomId, senderName, messageText } = body;
      if (!roomId || !messageText) return sendJson(400, { error: 'Invalid payload' });

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

  // Media Toggle
  if (pathname === '/api/media_toggle.php' || pathname === '/api/media_toggle') {
    const body = await getJsonBody(req);
    const { peerId, type, enabled } = body;
    for (const roomParts of state.participants.values()) {
      if (roomParts.has(peerId)) {
        const p = roomParts.get(peerId);
        if (type === 'audio') p.audioMuted = !enabled;
        if (type === 'video') p.videoOff = !enabled;
        if (type === 'screen') {
          if (enabled) {
            // Enforce single active screen sharer: reset any other sharer in this room
            for (const [otherId, otherP] of roomParts.entries()) {
              if (otherId !== peerId) {
                otherP.isScreenSharing = false;
              }
            }
            p.videoOff = false;
          }
          p.isScreenSharing = Boolean(enabled);
        }
        p.lastSeen = Date.now();
        break;
      }
    }
    return sendJson(200, { success: true });
  }

  // Leave API
  if (pathname === '/api/leave.php' || pathname === '/api/leave') {
    const body = await getJsonBody(req);
    const { peerId, sessionId, userId: reqUserId, roomId: reqRoomId } = body;
    const nowIso = new Date().toISOString();
    const nowTime = Date.now();

    const targetRoomIds = reqRoomId ? [reqRoomId] : Array.from(state.rooms.keys());
    for (const rId of targetRoomIds) {
      const roomSessions = state.sessions.get(rId);
      if (roomSessions) {
        for (const sess of roomSessions) {
          if (!sess.left_at && (
            (sessionId && sess.id === sessionId) ||
            (peerId && sess.peer_id === peerId) ||
            (reqUserId && sess.user_id === reqUserId)
          )) {
            sess.left_at = nowIso;
            sess.duration_seconds = Math.max(1, Math.round((nowTime - new Date(sess.joined_at).getTime()) / 1000));
          }
        }
      }

      const roomParts = state.participants.get(rId);
      if (roomParts && peerId && roomParts.has(peerId)) {
        const part = roomParts.get(peerId);
        roomParts.delete(peerId);
        if (roomSessions) {
          const sess = roomSessions.find(s => (s.user_id === part.userId || s.peer_id === peerId) && !s.left_at);
          if (sess) {
            sess.left_at = nowIso;
            sess.duration_seconds = Math.max(1, Math.round((nowTime - new Date(sess.joined_at).getTime()) / 1000));
          }
        }
        // Broadcast explicit user-left signal to all remaining room participants
        if (!state.signals.has(rId)) state.signals.set(rId, []);
        state.signals.get(rId).push({
          id: state.signalIdSeq++,
          senderId: peerId,
          senderName: part ? part.username : 'Participant',
          targetId: 'all',
          type: 'user-left',
          payload: { peerId, username: part ? part.username : 'Participant' },
          createdAt: nowIso
        });
      }

      if (roomParts && roomParts.size === 0) {
        const room = state.rooms.get(rId) || state.conferenceRooms.get(rId);
        if (room && room.status === 'active') {
          room.status = 'completed';
          room.actual_end = nowIso;
          if (room.actual_start) {
            room.calculated_duration_seconds = Math.max(1, Math.round((nowTime - new Date(room.actual_start).getTime()) / 1000));
          }
        }
      }
    }
    return sendJson(200, { success: true });
  }

  // -------------------------------------------------------------
  // Web Pages & Static Assets
  // -------------------------------------------------------------
  if (pathname === '/' || pathname === '/index.php') {
    const user = getSessionUser(req);
    if (!user) {
      res.writeHead(302, { 'Location': '/login.php' });
      return res.end();
    }
  }

  if (pathname === '/room.php') {
    if (!parsedUrl.query || (!parsedUrl.query.room && !parsedUrl.query.roomId)) {
      res.writeHead(302, { 'Location': '/index.php' });
      return res.end();
    }
  }

  let safePath = pathname === '/' ? '/index.php' : pathname;
  let filePath = path.join(ROOT, safePath);

  if (fs.existsSync(filePath) && fs.statSync(filePath).isFile()) {
    const ext = path.extname(filePath).toLowerCase();

    if (ext === '.php') {
      try {
        if (parsedUrl.query && (parsedUrl.query.action === 'logout' || parsedUrl.query.action === 'switch')) {
          res.setHeader('Set-Cookie', 'vva_session=; Path=/; Expires=Thu, 01 Jan 1970 00:00:00 GMT');
        }
        const html = renderPhpPage(filePath, req.url, req);
        res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
        return res.end(html);
      } catch (err) {
        console.error('Render error:', err);
        res.writeHead(500, { 'Content-Type': 'text/plain; charset=utf-8' });
        return res.end('Server render error: ' + err.message);
      }
    }

    const contentType = MIME_TYPES[ext] || 'application/octet-stream';
    res.writeHead(200, {
      'Content-Type': contentType,
      'Access-Control-Allow-Origin': '*'
    });
    return fs.createReadStream(filePath).pipe(res);
  }

  // Fallback to index.php
  const indexPath = path.join(ROOT, 'index.php');
  if (fs.existsSync(indexPath)) {
    const user = getSessionUser(req);
    if (!user) {
      res.writeHead(302, { 'Location': '/login.php' });
      return res.end();
    }
    const html = renderPhpPage(indexPath, req.url, req);
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
    return res.end(html);
  }

  res.writeHead(404, { 'Content-Type': 'text/plain' });
  res.end('404 Not Found');
});

server.listen(PORT, () => {
  console.log(`===============================================`);
  console.log(`🚀 VVA Meet Dev Server Running on port ${PORT}!`);
  console.log(`📡 Local URL: http://localhost:${PORT}`);
  if (state.networkIp) {
    console.log(`📶 Network URL: http://${state.networkIp}`);
  }
  console.log(`🔒 Login Portal: http://localhost:${PORT}/login.php`);
  console.log(`🎥 Room URL: http://localhost:${PORT}/room.php`);
  console.log(`===============================================`);
});

const cleanup = () => {
  if (cloudflaredProc) {
    try { cloudflaredProc.kill(); } catch (e) {}
  }
};
process.on('SIGINT', () => { cleanup(); process.exit(); });
process.on('SIGTERM', () => { cleanup(); process.exit(); });
process.on('exit', () => { cleanup(); });
