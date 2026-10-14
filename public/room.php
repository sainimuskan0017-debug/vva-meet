<?php
/**
 * VVA Meet - Meeting Room Page
 * BigRock Hosting Compatible (PHP + MySQL + Jitsi Meet External API)
 */

if (session_status() === PHP_SESSION_NONE) {
    session_start();
}

if (file_exists(__DIR__ . '/config.php')) {
    require_once __DIR__ . '/config.php';
}

$roomId = $_GET['room'] ?? $_GET['roomId'] ?? '';
$passcode = $_GET['passcode'] ?? '';

// Check if roomId is provided via URL path: e.g. /room/falcon-123
if (empty($roomId)) {
    $requestUri = $_SERVER['REQUEST_URI'] ?? '';
    $path = parse_url($requestUri, PHP_URL_PATH);
    if (preg_match('#/room/([^/?]+)#', $path, $matches)) {
        $roomId = urldecode($matches[1]);
    }
}

if (empty($roomId)) {
    $roomId = 'default-room';
}

$isLoggedIn = !empty($_SESSION['user_id']);
$loggedInUser = $isLoggedIn ? [
    'id' => $_SESSION['user_id'],
    'username' => $_SESSION['user_name'] ?? 'User',
    'email' => $_SESSION['user_email'] ?? ''
] : null;

$jitsiDomain = defined('JITSI_DOMAIN') ? JITSI_DOMAIN : 'meet.jit.si';
$conferenceEngine = defined('CONFERENCE_ENGINE') ? CONFERENCE_ENGINE : 'webrtc';

// Compute base URL for assets
$baseDir = rtrim(dirname($_SERVER['SCRIPT_NAME']), '/\\');
$baseUrl = ($baseDir === '' || $baseDir === '/') ? '/' : $baseDir . '/';
?>
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Meeting Room - VVA Meet</title>
  <base href="<?= htmlspecialchars($baseUrl) ?>">
  <link rel="stylesheet" href="css/main.css">
  <link rel="stylesheet" href="css/room.css">
  <script src="https://<?= htmlspecialchars($jitsiDomain) ?>/external_api.js"></script>
  <script src="js/realtime.js"></script>
  <script>
    window.JITSI_DOMAIN = <?= json_encode($jitsiDomain) ?>;
    window.CONFERENCE_ENGINE = <?= json_encode($conferenceEngine) ?>;
    window.MEETING_ROOM_ID = <?= json_encode($roomId) ?>;
    window.MEETING_PASSCODE = <?= json_encode($passcode) ?>;
    window.LOGGED_IN_USER = <?= json_encode($loggedInUser) ?>;
  </script>
</head>
<body>
  <div class="room-container">
    <!-- Top Header -->
    <header class="room-header">
      <div class="header-left">
        <a href="./" class="brand-logo" title="VVA Meet Conference">
          <div class="brand-icon">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
              <polygon points="23 7 16 12 23 17 23 7"></polygon>
              <rect x="1" y="5" width="15" height="14" rx="2" ry="2"></rect>
            </svg>
          </div>
          <span class="brand-name"><strong class="brand-vva">VVA</strong> <span class="brand-meet">Meet</span></span>
        </a>

        <!-- Room ID badge with click to copy -->
        <div id="roomTitleBadge" class="room-title-badge" data-tooltip="Click to copy invite link">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"></path>
            <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"></path>
          </svg>
          <span id="roomNameText"><?= htmlspecialchars($roomId) ?></span>
        </div>

        <!-- Room Passcode badge with click to copy -->
        <div id="roomPasscodeBadge" class="room-title-badge" style="display:none; background:rgba(245,158,11,0.15); border-color:rgba(245,158,11,0.3); color:#f59e0b;" data-tooltip="Click to copy passcode">
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <rect x="3" y="11" width="18" height="11" rx="2" ry="2"></rect>
            <path d="M7 11V7a5 5 0 0 1 10 0v4"></path>
          </svg>
          <span id="roomPasscodeText">Passcode</span>
        </div>
      </div>

      <div class="header-center">
        <div class="meeting-timer">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <circle cx="12" cy="12" r="10"></circle>
            <polyline points="12 6 12 12 16 14"></polyline>
          </svg>
          <span id="timerDisplay">00:00:00</span>
        </div>
      </div>

      <div class="header-right">
        <?php if ($isLoggedIn): ?>
          <div style="display:flex; align-items:center; gap:6px; font-size:0.8rem; color:var(--text-muted); background:rgba(255,255,255,0.05); padding:3px 10px; border-radius:999px;">
            <span style="width:7px; height:7px; border-radius:50%; background:#10b981;"></span>
            <span><?= htmlspecialchars($loggedInUser['username']) ?></span>
          </div>
        <?php else: ?>
          <a href="login.php" target="_blank" style="font-size:0.8rem; color:#818cf8; text-decoration:none; margin-right:4px;">Sign In</a>
        <?php endif; ?>

        <button id="btnHeaderShortcuts" class="btn btn-icon" data-tooltip="Keyboard Shortcuts (?)" style="width:34px; height:34px;">
          <span style="font-weight:700; font-size:0.85rem;">?</span>
        </button>
      </div>
    </header>

    <!-- Main Video Conference Stage -->
    <main class="room-stage">
      <div id="videoGridWrapper" class="video-grid-wrapper">
        <!-- Notice Banner for Jitsi Mode on meet.jit.si -->
        <div id="jitsiNoticeBanner" style="display:none; width:100%; margin-bottom:12px; background:rgba(245,158,11,0.14); border:1px solid rgba(245,158,11,0.35); color:#fbbf24; border-radius:10px; padding:10px 16px; align-items:center; justify-content:space-between; gap:12px; box-sizing:border-box;">
          <div style="display:flex; align-items:center; gap:8px; font-size:0.85rem;">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"></circle><line x1="12" y1="8" x2="12" y2="12"></line><line x1="12" y1="16" x2="12.01" y2="16"></line></svg>
            <span>Public <strong>meet.jit.si</strong> requires an 8x8 moderator login and limits calls to 5 mins. For <strong>Zero Limits &amp; No 2nd Login</strong>, use Unlimited Mode.</span>
          </div>
          <button id="btnSwitchToUnlimited" type="button" style="background:#10b981; color:#fff; border:none; border-radius:6px; padding:6px 14px; font-weight:600; font-size:0.8rem; cursor:pointer; white-space:nowrap; transition:all 0.2s ease;">
            Switch to Unlimited Mode
          </button>
        </div>

        <!-- Official Jitsi Meet Container -->
        <div id="jitsiContainer" style="width: 100%; height: 100%; min-height: 480px; border-radius: var(--radius-lg); overflow: hidden; background: #090d16; box-shadow: var(--shadow-lg); border: 1px solid var(--border-subtle);"></div>

        <!-- Custom Video Grid (Fallback mesh) -->
        <div id="videoGrid" class="video-grid grid-1" style="display: none;">
          <!-- Local Video Tile (Always Present) -->
          <div id="localVideoTile" class="video-tile local-tile" data-peer-id="local">
            <video id="localVideo" autoplay playsinline muted></video>

            <!-- Video-off fallback avatar -->
            <div id="localVideoOffPlaceholder" class="video-off-placeholder" style="display: none;">
              <div id="localAvatarCircle" class="tile-avatar"><?= $isLoggedIn ? strtoupper(substr($loggedInUser['username'], 0, 1)) : 'U' ?></div>
              <span style="font-size:0.85rem; color:var(--text-muted);">Camera off</span>
            </div>

            <!-- Overlays -->
            <div class="tile-overlay-bottom">
              <div class="participant-label">
                <span id="localNameLabel">You</span>
                <span id="localMicBadge" class="mic-badge muted" style="display: none;">
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <line x1="1" y1="1" x2="23" y2="23"></line>
                    <path d="M9 9v3a3 3 0 0 0 5.12 2.12M15 9.34V4a3 3 0 0 0-5.94-.6"></path>
                    <path d="M17 16.95A7 7 0 0 1 5 12v-2m14 0v2a7 7 0 0 1-.11 1.23"></path>
                    <line x1="12" y1="19" x2="12" y2="23"></line>
                    <line x1="8" y1="23" x2="16" y2="23"></line>
                  </svg>
                </span>
              </div>
            </div>

            <!-- Tile Action Buttons on Hover -->
            <div class="tile-overlay-top">
              <button class="tile-action-btn btn-pin-tile" data-peer="local" title="Spotlight / Pin">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                  <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"></path>
                  <circle cx="12" cy="10" r="3"></circle>
                </svg>
              </button>
            </div>
          </div>
        </div>
      </div>

      <!-- Collapsible Right Side Drawer -->
      <aside id="sideDrawer" class="side-drawer">
        <div class="drawer-header">
          <div class="drawer-tabs">
            <button id="tabChat" class="drawer-tab active">Chat</button>
            <button id="tabParticipants" class="drawer-tab">Participants (<span id="drawerParticipantCount">1</span>)</button>
          </div>
          <button id="btnCloseDrawer" class="drawer-close-btn" title="Close Panel">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <line x1="18" y1="6" x2="6" y2="18"></line>
              <line x1="6" y1="6" x2="18" y2="18"></line>
            </svg>
          </button>
        </div>

        <div class="drawer-body">
          <!-- Chat Panel -->
          <div id="chatPanel" class="drawer-panel active">
            <div id="chatMessages" class="chat-messages">
              <div class="system-message">
                Welcome to VVA Meet! Messages are persistently saved to MySQL.
              </div>
            </div>

            <form id="chatForm" class="chat-input-bar">
              <input 
                type="text" 
                id="chatInput" 
                class="chat-input" 
                placeholder="Type a message..." 
                maxlength="500" 
                autocomplete="off"
              >
              <button type="submit" id="btnSendChat" class="btn btn-primary" style="padding: 10px 16px;">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                  <line x1="22" y1="2" x2="11" y2="13"></line>
                  <polygon points="22 2 15 22 11 13 2 9 22 2"></polygon>
                </svg>
              </button>
            </form>
          </div>

          <!-- Participants Panel -->
          <div id="participantsPanel" class="drawer-panel">
            <div id="participantsList" class="participants-list">
              <!-- Dynamically populated -->
            </div>

            <div style="padding: 16px; border-top: 1px solid var(--border-subtle);">
              <button id="btnInviteFromPanel" class="btn btn-secondary" style="width: 100%;">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                  <path d="M16 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"></path>
                  <circle cx="8.5" cy="7.5" r="4"></circle>
                  <line x1="20" y1="8" x2="20" y2="14"></line>
                  <line x1="23" y1="11" x2="17" y2="11"></line>
                </svg>
                Copy Invite Link
              </button>
            </div>
          </div>
        </div>
      </aside>
    </main>

    <!-- Floating Reactions Popover -->
    <div id="reactionsPopover" class="reactions-popover">
      <button class="reaction-emoji-btn" data-emoji="👏" title="Applause">👏</button>
      <button class="reaction-emoji-btn" data-emoji="❤️" title="Love">❤️</button>
      <button class="reaction-emoji-btn" data-emoji="👍" title="Thumbs Up">👍</button>
      <button class="reaction-emoji-btn" data-emoji="🎉" title="Celebration">🎉</button>
      <button class="reaction-emoji-btn" data-emoji="🔥" title="Fire">🔥</button>
      <button class="reaction-emoji-btn" data-emoji="✋" title="Raise Hand">✋</button>
    </div>

    <!-- Floating Bottom Control Dock -->
    <div class="control-dock-container">
      <div id="controlBar" class="control-dock">
        <!-- Toggle Microphone -->
        <button id="btnToggleMic" class="control-btn" data-tooltip="Toggle Mic (M)">
          <svg id="iconRoomMicOn" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z"></path>
            <path d="M19 10v2a7 7 0 0 1-14 0v-2"></path>
            <line x1="12" y1="19" x2="12" y2="23"></line>
            <line x1="8" y1="23" x2="16" y2="23"></line>
          </svg>
          <svg id="iconRoomMicOff" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="display:none;">
            <line x1="1" y1="1" x2="23" y2="23"></line>
            <path d="M9 9v3a3 3 0 0 0 5.12 2.12M15 9.34V4a3 3 0 0 0-5.94-.6"></path>
            <path d="M17 16.95A7 7 0 0 1 5 12v-2m14 0v2a7 7 0 0 1-.11 1.23"></path>
            <line x1="12" y1="19" x2="12" y2="23"></line>
            <line x1="8" y1="23" x2="16" y2="23"></line>
          </svg>
        </button>

        <!-- Toggle Camera -->
        <button id="btnToggleCam" class="control-btn" data-tooltip="Toggle Camera (V)">
          <svg id="iconRoomCamOn" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <polygon points="23 7 16 12 23 17 23 7"></polygon>
            <rect x="1" y="5" width="15" height="14" rx="2" ry="2"></rect>
          </svg>
          <svg id="iconRoomCamOff" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="display:none;">
            <line x1="1" y1="1" x2="23" y2="23"></line>
            <path d="M21 21l-3.5-3.5M23 7l-7 5 7 5V7z"></path>
            <rect x="1" y="5" width="15" height="14" rx="2" ry="2"></rect>
          </svg>
        </button>

        <!-- Toggle Screen Share -->
        <button id="btnToggleScreen" class="control-btn" data-tooltip="Share Screen (S)">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <rect x="2" y="3" width="20" height="14" rx="2" ry="2"></rect>
            <line x1="8" y1="21" x2="16" y2="21"></line>
            <line x1="12" y1="17" x2="12" y2="21"></line>
          </svg>
        </button>

        <!-- Reactions Picker Trigger -->
        <button id="btnToggleReactions" class="control-btn" data-tooltip="Send Reaction">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <circle cx="12" cy="12" r="10"></circle>
            <path d="M8 14s1.5 2 4 2 4-2 4-2"></path>
            <line x1="9" y1="9" x2="9.01" y2="9"></line>
            <line x1="15" y1="9" x2="15.01" y2="9"></line>
          </svg>
        </button>

        <!-- Chat Drawer Toggle -->
        <button id="btnToggleChat" class="control-btn" data-tooltip="Toggle Chat (C)">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"></path>
          </svg>
          <span id="unreadBadge" class="notification-badge" style="display: none;">0</span>
        </button>

        <!-- Participants Drawer Toggle -->
        <button id="btnToggleParticipants" class="control-btn" data-tooltip="Participants">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"></path>
            <circle cx="9" cy="7" r="4"></circle>
            <path d="M23 21v-2a4 4 0 0 0-3-3.87"></path>
            <path d="M16 3.13a4 4 0 0 1 0 7.75"></path>
          </svg>
        </button>

        <!-- Copy Invite Link -->
        <button id="btnCopyInvite" class="control-btn" data-tooltip="Copy Invite Link">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect>
            <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path>
          </svg>
        </button>

        <!-- Leave Room Button -->
        <button id="btnLeaveRoom" class="control-btn btn-leave" data-tooltip="Leave Meeting">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
            <path d="M10.68 13.31a16 16 0 0 0 3.41 2.6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7 2 2 0 0 1 1.72 2v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.42 19.42 0 0 1-6-6 19.8 19.8 0 0 1-3.11-8.69A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91"></path>
            <line x1="23" y1="1" x2="1" y2="23"></line>
          </svg>
          <span>Leave</span>
        </button>
      </div>
    </div>
  </div>

  <!-- Passcode Entry Modal (If Room is Protected) -->
  <div id="passcodePromptModal" style="display:none; position:fixed; inset:0; background:rgba(4,7,14,0.85); backdrop-filter:blur(12px); z-index:9999; align-items:center; justify-content:center; padding:16px;">
    <div class="card-glass" style="max-width:420px; width:100%; padding:32px 28px; text-align:center;">
      <div style="width:50px; height:50px; border-radius:50%; background:rgba(245,158,11,0.15); border:1px solid rgba(245,158,11,0.3); color:#f59e0b; display:flex; align-items:center; justify-content:center; margin:0 auto 16px;">
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <rect x="3" y="11" width="18" height="11" rx="2" ry="2"></rect>
          <path d="M7 11V7a5 5 0 0 1 10 0v4"></path>
        </svg>
      </div>
      <h2 style="font-size:1.25rem; font-weight:700; margin-bottom:6px;">Meeting Passcode Required</h2>
      <p style="font-size:0.88rem; color:var(--text-muted); margin-bottom:20px;">
        This meeting room requires a security passcode to enter.
      </p>

      <form id="passcodePromptForm">
        <div class="input-group" style="text-align:left; margin-bottom:14px;">
          <label class="input-label" for="promptUsernameInput">Your Name or User ID</label>
          <input type="text" id="promptUsernameInput" class="input-field" placeholder="e.g. Alex Morgan"
            value="<?= $isLoggedIn ? htmlspecialchars($loggedInUser['username']) : '' ?>" required>
        </div>

        <div class="input-group" style="text-align:left; margin-bottom:20px;">
          <label class="input-label" for="promptPasscodeInput">Security Passcode</label>
          <input type="text" id="promptPasscodeInput" class="input-field" placeholder="Enter meeting passcode" value="<?= htmlspecialchars($passcode) ?>" required autocomplete="off">
        </div>

        <div id="passcodePromptError" style="display:none; color:#f87171; font-size:0.84rem; margin-bottom:14px; text-align:left;"></div>

        <button type="submit" class="btn btn-primary" style="width:100%; justify-content:center; padding:12px; font-weight:600;">
          Unlock & Join Meeting
        </button>
      </form>

      <div style="margin-top:16px;">
        <a href="index.php" style="color:var(--text-muted); font-size:0.82rem; text-decoration:none;">&larr; Return to Lobby</a>
      </div>
    </div>
  </div>

  <!-- Keyboard Shortcuts Modal -->
  <div id="shortcutsModal" style="display:none; position:fixed; inset:0; background:rgba(0,0,0,0.7); backdrop-filter:blur(8px); z-index:9000; align-items:center; justify-content:center;">
    <div class="card-glass" style="max-width:400px; width:90%; padding:24px;">
      <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:16px;">
        <h3 style="font-size:1.15rem; font-weight:700;">Keyboard Shortcuts</h3>
        <button id="btnCloseShortcuts" class="btn btn-icon" style="width:28px; height:28px;">&times;</button>
      </div>
      <div style="display:flex; flex-direction:column; gap:12px; font-size:0.9rem;">
        <div style="display:flex; justify-content:space-between;"><kbd style="background:rgba(255,255,255,0.1); padding:2px 8px; border-radius:4px;">M</kbd> <span>Mute / Unmute Microphone</span></div>
        <div style="display:flex; justify-content:space-between;"><kbd style="background:rgba(255,255,255,0.1); padding:2px 8px; border-radius:4px;">V</kbd> <span>Turn Camera On / Off</span></div>
        <div style="display:flex; justify-content:space-between;"><kbd style="background:rgba(255,255,255,0.1); padding:2px 8px; border-radius:4px;">S</kbd> <span>Share / Stop Screen</span></div>
        <div style="display:flex; justify-content:space-between;"><kbd style="background:rgba(255,255,255,0.1); padding:2px 8px; border-radius:4px;">C</kbd> <span>Toggle Chat Panel</span></div>
        <div style="display:flex; justify-content:space-between;"><kbd style="background:rgba(255,255,255,0.1); padding:2px 8px; border-radius:4px;">?</kbd> <span>Show Shortcuts Sheet</span></div>
      </div>
    </div>
  </div>

  <!-- Dynamic Elements -->
  <div id="toastContainer" class="toast-container"></div>
  <div id="reactionsContainer"></div>

  <!-- Scripts -->
  <script src="js/sound.js"></script>
  <script src="js/webrtc.js"></script>
  <script src="js/room.js"></script>
</body>
</html>
