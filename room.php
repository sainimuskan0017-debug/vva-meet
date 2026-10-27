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
if (file_exists(__DIR__ . '/database.php')) {
    require_once __DIR__ . '/database.php';
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

// Strictly sanitize and validate room ID to safe alphanumeric characters, dashes, and underscores
$roomId = preg_replace('/[^a-zA-Z0-9_\-]/', '', $roomId);
if (empty($roomId) || strlen($roomId) < 2) {
    header('Location: index.php');
    exit;
}
$roomId = substr($roomId, 0, 64);
$passcode = trim(preg_replace('/[\r\n\t]/', '', (string)$passcode));

$isUnlimitedMeeting = true;
$meetingTitle = 'Microsoft Teams meeting';
$roomRequiresPasscode = false;
$meetingHostId = null;
$meetingHostName = 'Host';
if (class_exists('Database')) {
    try {
        $roomInfo = Database::getMeetingDetails($roomId);
        if ($roomInfo) {
            $m = $roomInfo['meeting'] ?? $roomInfo;
            if (!empty($m['title'])) {
                $meetingTitle = $m['title'];
            }
            if (!empty($m['host_id'])) {
                $meetingHostId = $m['host_id'];
                $meetingHostName = $m['host_name'] ?? 'Host';
            }
        }
        $roomRequiresPasscode = false;
    } catch (Exception $e) {}
}

// Unique, valid, URL-safe Jitsi conference room name
$jitsiRoomName = 'VVAMeet_' . preg_replace('/[^a-zA-Z0-9_\-]/', '', $roomId);

$isLoggedIn = !empty($_SESSION['user_id']);
$loggedInUser = $isLoggedIn ? [
    'id' => $_SESSION['user_id'],
    'username' => $_SESSION['user_name'] ?? 'User',
    'email' => $_SESSION['user_email'] ?? ''
] : null;

// If room is not yet persisted in database and a logged-in user opens it, persist it with this user as host
if (empty($meetingHostId) && $loggedInUser && class_exists('Database')) {
    try {
        $createdRoom = Database::getOrCreateRoom($roomId, $roomId, $passcode ?: null, $loggedInUser['id']);
        if (!empty($createdRoom['host_id'])) {
            $meetingHostId = $createdRoom['host_id'];
            $meetingHostName = $createdRoom['host_name'] ?? $loggedInUser['username'];
        }
    } catch (Exception $e) {}
}

if (empty($meetingHostId) && $loggedInUser) {
    $meetingHostId = $loggedInUser['id'];
    $meetingHostName = $loggedInUser['username'];
}
$isHost = (bool)($loggedInUser && !empty($meetingHostId) && $meetingHostId === $loggedInUser['id']);

$jitsiDomain = defined('JITSI_DOMAIN') ? JITSI_DOMAIN : 'meet.jit.si';
$conferenceEngine = defined('CONFERENCE_ENGINE') ? CONFERENCE_ENGINE : 'webrtc';

// Public TURN relay across firewalls and symmetric NAT
$dynamicIceServers = [
    ['urls' => 'stun:stun.l.google.com:19302'],
    ['urls' => 'stun:stun1.l.google.com:19302'],
    ['urls' => 'stun:stun.cloudflare.com:3478'],
    [
        'urls' => [
            'turn:turn.evan-brass.net:3478',
            'turn:turn.evan-brass.net:3478?transport=tcp',
            'turns:turn.evan-brass.net:443?transport=tcp'
        ],
        'username' => 'user',
        'credential' => 'password'
    ]
];

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
  <!-- Lightweight Realtime Sync for BigRock Linux PHP/MySQL hosting -->
  <script src="js/realtime.js"></script>
  <script>
    window.JITSI_DOMAIN = <?= json_encode($jitsiDomain) ?>;
    window.CONFERENCE_ENGINE = <?= json_encode($conferenceEngine) ?>;
    window.MEETING_ROOM_ID = <?= json_encode($roomId) ?>;
    window.JITSI_ROOM_NAME = <?= json_encode($jitsiRoomName) ?>;
    window.MEETING_PASSCODE = <?= json_encode($passcode) ?>;
    window.LOGGED_IN_USER = <?= json_encode($loggedInUser) ?>;
    window.IS_UNLIMITED_MEETING = <?= json_encode($isUnlimitedMeeting) ?>;
    window.MEETING_TITLE = <?= json_encode($meetingTitle) ?>;
    window.ROOM_REQUIRES_PASSCODE = <?= json_encode($roomRequiresPasscode) ?>;
    window.MEETING_HOST_ID = <?= json_encode($meetingHostId) ?>;
    window.MEETING_HOST_NAME = <?= json_encode($meetingHostName) ?>;
    window.IS_HOST = <?= json_encode($isHost) ?>;
    window.DYNAMIC_ICE_SERVERS = <?= json_encode($dynamicIceServers) ?> || [];
  </script>
</head>
<body>
  <!-- Pre-Meeting Setup Screen (Microsoft Teams Lobby Style) -->
  <div id="preMeetingSetup" class="teams-prejoin-wrapper">
    <div class="teams-prejoin-content">
      <!-- Top Brand Icon & Meeting Title -->
      <div class="teams-prejoin-header">
        <div class="teams-brand-icon" title="Microsoft Teams meeting">
          <svg width="24" height="24" viewBox="0 0 24 24" fill="currentColor">
            <path d="M19.5 7.5A2.5 2.5 0 0 0 17 5h-4.5A2.5 2.5 0 0 0 10 7.5v9a2.5 2.5 0 0 0 2.5 2.5H17a2.5 2.5 0 0 0 2.5-2.5v-9zM7.5 7A2 2 0 1 0 7.5 11 2 2 0 0 0 7.5 7zm-3 5.5A1.5 1.5 0 0 0 3 14v1.5c0 .83.67 1.5 1.5 1.5H9v-3.5c0-.49.12-.95.34-1.36A3.48 3.48 0 0 0 7.5 12h-3zM15 8.5a1.5 1.5 0 1 1-3 0 1.5 1.5 0 0 1 3 0zm-3 4.5h3c.83 0 1.5.67 1.5 1.5v1.5H10.5v-1.5c0-.83.67-1.5 1.5-1.5z"/>
          </svg>
        </div>
        <h1 class="teams-prejoin-title" id="prejoinTitleDisplay"><?= htmlspecialchars($meetingTitle ?? 'Microsoft Teams meeting') ?></h1>
      </div>

      <!-- Main Two-Column Card Grid -->
      <div class="teams-prejoin-cards">
        <!-- Left Card: Live Camera Preview & Effects -->
        <div class="teams-card teams-video-card">
          <!-- Video Viewport -->
          <div class="teams-video-viewport" id="prejoinVideoViewport">
            <!-- Live Preview Video Element -->
            <video id="prejoinVideo" autoplay playsinline muted></video>
            <!-- Canvas for Blur and Virtual Background preview -->
            <canvas id="prejoinCanvas" style="display:none; width:100%; height:100%; object-fit:cover; position:absolute; inset:0; z-index:2; border-radius:inherit;"></canvas>

            <!-- Camera Off State (Visible by default until camera turned on) -->
            <div id="prejoinCamOffView" class="teams-cam-off-state">
              <div class="teams-cam-off-icon">
                <svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                  <line x1="1" y1="1" x2="23" y2="23"></line>
                  <path d="M21 21l-3.5-3.5M23 7l-7 5 7 5V7z"></path>
                  <rect x="1" y="5" width="15" height="14" rx="2" ry="2"></rect>
                </svg>
              </div>
              <span class="teams-cam-off-text">Your camera is turned off</span>
            </div>
          </div>

          <!-- Bottom Control Bar -->
          <div class="teams-video-bottom-bar">
            <div class="teams-cam-controls-left">
              <!-- Camera Icon with Chevron Selector -->
              <div class="teams-device-dropdown-wrapper">
                <button type="button" class="teams-cam-icon-btn" id="btnPrejoinCamIcon" title="Camera options">
                  <svg id="prejoinCamIconSvg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                    <line x1="1" y1="1" x2="23" y2="23"></line>
                    <path d="M21 21l-3.5-3.5M23 7l-7 5 7 5V7z"></path>
                    <rect x="1" y="5" width="15" height="14" rx="2" ry="2"></rect>
                  </svg>
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" style="margin-left: 2px;">
                    <polyline points="6 9 12 15 18 9"></polyline>
                  </svg>
                </button>
                <select id="prejoinCamSelect" class="teams-hidden-select" title="Select Camera Device"></select>
              </div>

              <!-- Camera Toggle Switch -->
              <label class="teams-toggle-switch" title="Toggle camera">
                <input type="checkbox" id="prejoinCamToggle" checked>
                <span class="teams-toggle-track"></span>
              </label>
            </div>

            <!-- Background Filters Button -->
            <button type="button" id="btnPrejoinBgFilters" class="teams-bg-filters-btn">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M12 2l2.4 4.8 5.3.8-3.8 3.7.9 5.3-4.8-2.5-4.8 2.5.9-5.3-3.8-3.7 5.3-.8z"></path>
              </svg>
              <span>Background filters</span>
            </button>
          </div>
        </div>

        <!-- Right Card: Audio Options & Join Actions -->
        <div class="teams-card teams-audio-card">
          <!-- 1. Computer Audio (Selected Default) -->
          <div class="teams-audio-option selected" id="optComputerAudio">
            <div class="teams-option-header">
              <label class="teams-radio-label">
                <input type="radio" name="prejoinAudioOption" value="computer" checked>
                <span class="teams-custom-radio"></span>
                <span class="teams-option-title">Computer audio</span>
              </label>
            </div>

            <!-- Nested Device Controls -->
            <div class="teams-audio-controls-body">
              <!-- Microphone Row -->
              <div class="teams-device-row">
                <div class="teams-device-lead">
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                    <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z"></path>
                    <path d="M19 10v2a7 7 0 0 1-14 0v-2"></path>
                    <line x1="12" y1="19" x2="12" y2="23"></line>
                    <line x1="8" y1="23" x2="16" y2="23"></line>
                  </svg>
                  <select id="prejoinMicSelect" class="teams-device-select" title="Microphone device">
                    <option value="default">Microphone (Realtek(R) Audio)</option>
                  </select>
                </div>
                <label class="teams-toggle-switch" title="Toggle microphone">
                  <input type="checkbox" id="prejoinMicToggle" checked>
                  <span class="teams-toggle-track"></span>
                </label>
              </div>

              <!-- Speaker Row -->
              <div class="teams-device-row">
                <div class="teams-device-lead" style="width: 100%;">
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                    <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"></polygon>
                    <path d="M19.07 4.93a10 10 0 0 1 0 14.14M15.54 8.46a5 5 0 0 1 0 7.07"></path>
                  </svg>
                  <select id="prejoinSpeakerSelect" class="teams-device-select" title="Speaker device">
                    <option value="default">Speakers (Realtek(R) Audio)</option>
                  </select>
                </div>
              </div>

              <!-- Test Mic & Speaker Link -->
              <div class="teams-test-row">
                <button type="button" id="btnPrejoinTestAudio" class="teams-test-link">
                  Test mic and speaker
                </button>
              </div>

              <!-- Live Audio Test Feedback (hidden initially) -->
              <div id="prejoinAudioMeter" class="teams-audio-meter-box" style="display:none;">
                <div class="teams-audio-meter-label">
                  <span id="prejoinAudioMeterText">Testing speaker &amp; microphone...</span>
                </div>
                <div class="teams-audio-meter-bar">
                  <div id="prejoinAudioMeterFill" class="teams-audio-meter-fill" style="width:0%;"></div>
                </div>
              </div>
            </div>
          </div>

          <!-- 2. Phone Audio (Radio Option) -->
          <div class="teams-audio-option disabled-option" id="optPhoneAudio">
            <label class="teams-radio-label">
              <input type="radio" name="prejoinAudioOption" value="phone">
              <span class="teams-custom-radio"></span>
              <span class="teams-option-title dimmed">Phone audio</span>
            </label>
          </div>

          <!-- 3. Don't Use Audio (Radio Option) -->
          <div class="teams-audio-option" id="optNoAudio">
            <label class="teams-radio-label">
              <input type="radio" name="prejoinAudioOption" value="none">
              <span class="teams-custom-radio"></span>
              <span class="teams-option-title">Don't use audio</span>
            </label>
          </div>

          <?php if (!$isLoggedIn): ?>
          <div class="teams-name-box">
            <label class="teams-name-label" for="prejoinUsernameInput">Your Name</label>
            <input type="text" id="prejoinUsernameInput" class="teams-name-input" placeholder="Enter your name" value="<?= htmlspecialchars($_SESSION['user_name'] ?? '') ?>" maxlength="50">
          </div>
          <?php endif; ?>

          <!-- Bottom Action Buttons -->
          <div class="teams-actions-row">
            <button type="button" id="btnPrejoinCancel" class="teams-btn-cancel">Cancel</button>
            <button type="button" id="btnPrejoinJoinNow" class="teams-btn-join">Join now</button>
          </div>
        </div>
      </div>

      <!-- Footer Need Help Link -->
      <div class="teams-prejoin-footer">
        <a href="javascript:void(0)" id="linkPrejoinHelp" class="teams-help-link">Need help?</a>
      </div>
    </div>
  </div>

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

      </div>

      <div class="header-center">
        <div class="meeting-timer" title="<?= $isUnlimitedMeeting ? 'Unlimited Meeting: No time limit' : 'Meeting Duration' ?>">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <circle cx="12" cy="12" r="10"></circle>
            <polyline points="12 6 12 12 16 14"></polyline>
          </svg>
          <span id="timerDisplay">00:00:00</span>
        </div>
      </div>

      <div class="header-right">
        <!-- Consistent Meeting Host / Admin Display -->
        <div id="meetingHostBadge" class="meeting-host-simple" title="Meeting Host: <?= htmlspecialchars($meetingHostName) ?>">
          <span>Host:</span>
          <strong id="meetingHostNameDisplay"><?= htmlspecialchars($meetingHostName) ?></strong>
        </div>

        <!-- Zoom Speaker View / Grid View Switcher -->
        <button id="btnToggleViewMode" class="btn btn-secondary btn-sm" style="display:none; align-items:center; gap:6px; font-size:0.8rem; padding:4px 12px; border-radius:999px; background:rgba(255,255,255,0.08); border:1px solid rgba(255,255,255,0.15); color:#fff; cursor:pointer;" title="Switch View Mode (Speaker vs Grid)">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="3" width="18" height="18" rx="2" ry="2"></rect><line x1="15" y1="3" x2="15" y2="21"></line></svg>
          <span id="viewModeText">Speaker View</span>
        </button>

        <button id="btnHeaderShortcuts" class="btn btn-icon" data-tooltip="Keyboard Shortcuts (?)" style="width:34px; height:34px;">
          <span style="font-weight:700; font-size:0.85rem;">?</span>
        </button>
      </div>
    </header>

    <!-- Main Video Conference Stage -->
    <main class="room-stage">
      <div id="videoGridWrapper" class="video-grid-wrapper">
        <!-- Insecure Context Camera Notice (Only displayed if accessed via plain HTTP on non-localhost IP) -->
        <div id="insecureOriginBanner" style="display:none; width:100%; margin-bottom:12px; background:rgba(99,102,241,0.15); border:1px solid rgba(99,102,241,0.35); color:#e0e7ff; border-radius:10px; padding:10px 16px; align-items:center; justify-content:space-between; gap:12px; box-sizing:border-box;">
          <div style="display:flex; align-items:center; gap:10px; font-size:0.85rem;">
            <span style="font-size:1.15rem;">📹</span>
            <span><strong>Physical Camera Note:</strong> Chrome blocks webcams on local HTTP IPs (<code style="background:rgba(0,0,0,0.3); padding:1px 5px; border-radius:4px; font-size:0.78rem;">http://192.168.1.91</code>). Live video streaming fallback is active. To use hardware webcam: enable <code style="background:rgba(0,0,0,0.3); padding:1px 5px; border-radius:4px; font-size:0.78rem;">chrome://flags/#unsafely-treat-insecure-origin-as-secure</code> or use HTTPS.</span>
          </div>
          <button type="button" onclick="this.parentElement.style.display='none'" style="background:rgba(255,255,255,0.12); color:#fff; border:none; border-radius:6px; padding:4px 10px; font-size:0.75rem; cursor:pointer;">Dismiss</button>
        </div>

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
        <div id="jitsiContainer" style="width: 100%; height: 100%; min-height: 480px; border-radius: var(--radius-lg); overflow: hidden; background: #090d16; box-shadow: var(--shadow-lg); border: 1px solid var(--border-subtle); position: relative;">
          <!-- Jitsi Loading Overlay -->
          <div id="jitsiLoadingOverlay" class="jitsi-loading-overlay">
            <div class="jitsi-spinner"></div>
            <div class="jitsi-loading-title">Connecting to Jitsi Meet...</div>
            <div class="jitsi-loading-subtitle">Joining secure video room: <strong id="jitsiRoomDisplay"><?= htmlspecialchars($jitsiRoomName) ?></strong></div>
          </div>

          <!-- Jitsi Connection Error Card -->
          <div id="jitsiErrorState" class="jitsi-error-state" style="display:none;">
            <div class="jitsi-error-icon">
              <svg width="34" height="34" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <circle cx="12" cy="12" r="10"></circle>
                <line x1="12" y1="8" x2="12" y2="12"></line>
                <line x1="12" y1="16" x2="12.01" y2="16"></line>
              </svg>
            </div>
            <h3 class="jitsi-error-title">Unable to Connect to Jitsi Meet</h3>
            <p id="jitsiErrorMessage" class="jitsi-error-desc">Could not connect to Jitsi server (<?= htmlspecialchars($jitsiDomain) ?>). Please check your internet connection or server domain configuration.</p>
            <div class="jitsi-error-actions">
              <button id="btnRetryJitsi" class="btn btn-primary" type="button">Retry Connection</button>
              <button id="btnFallbackWebRTC" class="btn btn-secondary" type="button">Switch to WebRTC Mesh</button>
            </div>
          </div>
        </div>

        <!-- Custom Video Grid (Fallback mesh) -->
        <div id="videoGrid" class="video-grid grid-1" style="display: none;">
          <!-- Local Video Tile (Always Present) -->
          <div id="localVideoTile" class="video-tile local-tile" data-peer-id="local">
            <video id="localVideo" autoplay playsinline muted></video>
            <canvas id="localOutputCanvas" class="local-segmentation-canvas" style="display:none; width:100%; height:100%; object-fit:cover; position:absolute; inset:0; z-index:2; border-radius:inherit;"></canvas>

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
                <span id="localTileHandBadge" class="tile-hand-badge" style="display: none;" title="Hand Raised">✋</span>
              </div>
            </div>

            <!-- Tile Action Buttons on Hover -->
            <div class="tile-overlay-top">
              <button class="tile-action-btn btn-maximize-screen" data-peer="local" title="Maximize this screen to main view">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                  <polyline points="15 3 21 3 21 9"></polyline>
                  <polyline points="9 21 3 21 3 15"></polyline>
                  <line x1="21" y1="3" x2="14" y2="10"></line>
                  <line x1="3" y1="21" x2="10" y2="14"></line>
                </svg>
              </button>
              <button class="tile-action-btn btn-minimize-tile" data-peer="local" title="Collapse / Minimize">
                <svg class="icon-minimize" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                  <line x1="5" y1="12" x2="19" y2="12"></line>
                </svg>
                <svg class="icon-maximize" style="display:none;" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                  <polyline points="15 3 21 3 21 9"></polyline>
                  <polyline points="9 21 3 21 3 15"></polyline>
                  <line x1="21" y1="3" x2="14" y2="10"></line>
                  <line x1="3" y1="21" x2="10" y2="14"></line>
                </svg>
              </button>
              <button class="tile-action-btn btn-pin-tile" data-peer="local" title="Spotlight / Pin">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                  <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"></path>
                  <circle cx="12" cy="10" r="3"></circle>
                </svg>
              </button>
            </div>
          </div>

          <!-- Filmstrip Container for Attendee / Camera Tiles during Presentation/Spotlight -->
          <div id="filmstripTray" class="filmstrip-container" style="display: none;"></div>
        </div>

        <!-- Presentation Floating Toolbar (shown when screen sharing is active) -->
        <div id="presentationControlsBar" class="presentation-controls-bar" style="display: none;">
          <div class="presentation-info">
            <span class="live-indicator-dot"></span>
            <span id="presentationSharerBadge">Presenting</span>
          </div>
          <div class="presentation-actions">
            <button id="btnToggleFilmstrip" class="btn-toggle-filmstrip" title="Minimize / Hide participants">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <rect x="3" y="3" width="18" height="18" rx="2" ry="2"></rect>
                <line x1="15" y1="3" x2="15" y2="21"></line>
              </svg>
              <span id="toggleFilmstripText">Hide Participants</span>
            </button>
            <button id="btnMaximizePresentation" class="btn-maximize-presentation" title="Full Screen Presentation">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <polyline points="15 3 21 3 21 9"></polyline>
                <polyline points="9 21 3 21 3 15"></polyline>
                <line x1="21" y1="3" x2="14" y2="10"></line>
                <line x1="3" y1="21" x2="10" y2="14"></line>
              </svg>
              <span>Maximize</span>
            </button>
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
            <!-- Host Quick Controls Bar -->
            <div id="hostControlsBar" style="display:none; padding:10px 16px; background:rgba(99,102,241,0.08); border-bottom:1px solid var(--border-subtle); align-items:center; justify-content:space-between;">
              <span style="font-size:0.75rem; font-weight:700; color:#818cf8; text-transform:uppercase; letter-spacing:0.5px;">Host Controls</span>
              <button type="button" id="btnHostMuteAll" class="btn btn-secondary btn-sm" style="font-size:0.75rem; padding:4px 10px; display:inline-flex; align-items:center; gap:5px;">
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                  <line x1="1" y1="1" x2="23" y2="23"></line>
                  <path d="M9 9v3a3 3 0 0 0 5.12 2.12M15 9.34V4a3 3 0 0 0-5.94-.6"></path>
                  <path d="M17 16.95A7 7 0 0 1 5 12v-2m14 0v2a7 7 0 0 1-.11 1.23"></path>
                </svg>
                Mute All
              </button>
            </div>

            <!-- Waiting Room Section for Host -->
            <div id="waitingRoomSection" style="display:none; padding:12px 16px; background:rgba(245,158,11,0.08); border-bottom:1px solid rgba(245,158,11,0.25);">
              <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:10px;">
                <span style="font-size:0.8rem; font-weight:700; color:#fbbf24; display:flex; align-items:center; gap:6px;">
                  <span>Waiting in Lobby</span>
                  <span id="waitingCountBadge" style="background:#f59e0b; color:#000; font-size:0.7rem; padding:1px 6px; border-radius:10px; font-weight:800;">0</span>
                </span>
                <button type="button" id="btnAdmitAll" class="btn btn-sm" style="background:#10b981; color:#fff; border:none; font-size:0.74rem; font-weight:600; padding:3px 9px; border-radius:6px; cursor:pointer;">
                  Admit All
                </button>
              </div>
              <div id="waitingParticipantsList" style="display:flex; flex-direction:column; gap:8px;"></div>
            </div>

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

      <!-- Background Effects Drawer / Side Panel -->
      <aside id="backgroundEffectsPanel" class="bg-effects-drawer">
        <div class="bg-effects-header">
          <div class="bg-effects-title-group">
            <div class="bg-effects-icon-badge">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <rect x="3" y="3" width="18" height="18" rx="3" ry="3"></rect>
                <circle cx="8.5" cy="8.5" r="1.5"></circle>
                <polyline points="21 15 16 10 5 21"></polyline>
              </svg>
            </div>
            <div>
              <h3 class="bg-effects-title">Background Effects</h3>
              <span class="bg-effects-subtitle">Blur your surroundings or choose a virtual background</span>
            </div>
          </div>
          <button id="btnCloseBgEffects" class="drawer-close-btn" title="Close Panel">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <line x1="18" y1="6" x2="6" y2="18"></line>
              <line x1="6" y1="6" x2="18" y2="18"></line>
            </svg>
          </button>
        </div>

        <div class="bg-effects-body">
          <!-- Live Preview Window -->
          <div class="bg-preview-card">
            <div class="bg-preview-viewport">
              <video id="bgPreviewVideo" autoplay playsinline muted></video>
              <canvas id="bgPreviewCanvas" class="bg-preview-canvas" style="display:none; width:100%; height:100%; object-fit:cover; position:absolute; inset:0; z-index:2; border-radius:inherit;"></canvas>
              <div id="bgPreviewVirtualLayer" class="bg-preview-virtual-layer"></div>
              <div id="bgPreviewPlaceholder" class="bg-preview-placeholder" style="display:none;">
                <div class="bg-preview-avatar"><?= $isLoggedIn ? strtoupper(substr($loggedInUser['username'], 0, 1)) : 'U' ?></div>
                <span>Camera off</span>
              </div>
            </div>
            <div class="bg-preview-footer">
              <span class="bg-preview-pill">
                <span class="preview-status-dot"></span>
                <span id="bgPreviewStatusLabel">None (Original Camera)</span>
              </span>
              <button id="btnResetBackground" class="bg-reset-btn" type="button" title="Reset to original camera background">
                Reset
              </button>
            </div>
          </div>

          <!-- Section 1: Blur Options -->
          <div class="bg-section">
            <div class="bg-section-header">
              <span class="bg-section-title">Blur Background</span>
              <span class="bg-section-desc">Keep you in focus while blurring your surroundings</span>
            </div>
            <div class="bg-blur-grid">
              <!-- None Option -->
              <button type="button" class="bg-option-card active" data-bg-type="none" data-bg-value="none">
                <div class="bg-card-thumb thumb-none">
                  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <circle cx="12" cy="12" r="10"></circle>
                    <line x1="4.93" y1="4.93" x2="19.07" y2="19.07"></line>
                  </svg>
                </div>
                <div class="bg-card-info">
                  <span class="bg-card-name">None</span>
                  <span class="bg-card-sub">Original background</span>
                </div>
                <div class="bg-card-check">✓</div>
              </button>

              <!-- Light Blur Option -->
              <button type="button" class="bg-option-card" data-bg-type="blur" data-bg-value="light">
                <div class="bg-card-thumb thumb-blur-light">
                  <div class="blur-demo-person"></div>
                  <div class="blur-demo-backdrop light"></div>
                </div>
                <div class="bg-card-info">
                  <span class="bg-card-name">Light Blur</span>
                  <span class="bg-card-sub">Subtle blur</span>
                </div>
                <div class="bg-card-check">✓</div>
              </button>

              <!-- Strong Blur Option -->
              <button type="button" class="bg-option-card" data-bg-type="blur" data-bg-value="strong">
                <div class="bg-card-thumb thumb-blur-strong">
                  <div class="blur-demo-person"></div>
                  <div class="blur-demo-backdrop strong"></div>
                </div>
                <div class="bg-card-info">
                  <span class="bg-card-name">Strong Blur</span>
                  <span class="bg-card-sub">Deeper blur</span>
                </div>
                <div class="bg-card-check">✓</div>
              </button>
            </div>
          </div>

          <!-- Section 2: Virtual Backgrounds -->
          <div class="bg-section">
            <div class="bg-section-header">
              <div style="display:flex; justify-content:space-between; align-items:center;">
                <span class="bg-section-title">Virtual Backgrounds</span>
                <span class="bg-section-count">8 Presets</span>
              </div>
              <span class="bg-section-desc">Replace your backdrop with a selected scene</span>
            </div>
            <div class="bg-virtual-grid">
              <!-- Cosmic Space Warp (from Teams screenshot) -->
              <button type="button" class="bg-virtual-card" data-bg-type="image" data-bg-value="assets/backgrounds/cosmic-space.svg" data-bg-title="Cosmic Space Warp">
                <div class="bg-virtual-thumb" style="background-image: url('assets/backgrounds/cosmic-space.svg');">
                  <div class="bg-card-check">✓</div>
                </div>
                <span class="bg-virtual-label">Cosmic Space</span>
              </button>

              <!-- 1. Professional office -->
              <button type="button" class="bg-virtual-card" data-bg-type="image" data-bg-value="assets/backgrounds/professional-office.svg" data-bg-title="Professional Office">
                <div class="bg-virtual-thumb" style="background-image: url('assets/backgrounds/professional-office.svg');">
                  <div class="bg-card-check">✓</div>
                </div>
                <span class="bg-virtual-label">Professional Office</span>
              </button>

              <!-- 2. Modern home office -->
              <button type="button" class="bg-virtual-card" data-bg-type="image" data-bg-value="assets/backgrounds/modern-home-office.svg" data-bg-title="Modern Home Office">
                <div class="bg-virtual-thumb" style="background-image: url('assets/backgrounds/modern-home-office.svg');">
                  <div class="bg-card-check">✓</div>
                </div>
                <span class="bg-virtual-label">Modern Home Office</span>
              </button>

              <!-- 3. Meeting room -->
              <button type="button" class="bg-virtual-card" data-bg-type="image" data-bg-value="assets/backgrounds/meeting-room.svg" data-bg-title="Meeting Room">
                <div class="bg-virtual-thumb" style="background-image: url('assets/backgrounds/meeting-room.svg');">
                  <div class="bg-card-check">✓</div>
                </div>
                <span class="bg-virtual-label">Meeting Room</span>
              </button>

              <!-- 4. Library -->
              <button type="button" class="bg-virtual-card" data-bg-type="image" data-bg-value="assets/backgrounds/library.svg" data-bg-title="Library">
                <div class="bg-virtual-thumb" style="background-image: url('assets/backgrounds/library.svg');">
                  <div class="bg-card-check">✓</div>
                </div>
                <span class="bg-virtual-label">Library</span>
              </button>

              <!-- 5. Nature and greenery -->
              <button type="button" class="bg-virtual-card" data-bg-type="image" data-bg-value="assets/backgrounds/nature-greenery.svg" data-bg-title="Nature and Greenery">
                <div class="bg-virtual-thumb" style="background-image: url('assets/backgrounds/nature-greenery.svg');">
                  <div class="bg-card-check">✓</div>
                </div>
                <span class="bg-virtual-label">Nature &amp; Greenery</span>
              </button>

              <!-- 6. Beach -->
              <button type="button" class="bg-virtual-card" data-bg-type="image" data-bg-value="assets/backgrounds/beach.svg" data-bg-title="Beach">
                <div class="bg-virtual-thumb" style="background-image: url('assets/backgrounds/beach.svg');">
                  <div class="bg-card-check">✓</div>
                </div>
                <span class="bg-virtual-label">Beach</span>
              </button>

              <!-- 7. Plain light background -->
              <button type="button" class="bg-virtual-card" data-bg-type="image" data-bg-value="assets/backgrounds/plain-light.svg" data-bg-title="Plain Light Background">
                <div class="bg-virtual-thumb" style="background-image: url('assets/backgrounds/plain-light.svg');">
                  <div class="bg-card-check">✓</div>
                </div>
                <span class="bg-virtual-label">Plain Light</span>
              </button>
            </div>
          </div>

          <!-- Section 3: Custom Upload -->
          <div class="bg-section">
            <div class="bg-section-header">
              <span class="bg-section-title">Custom Image</span>
              <span class="bg-section-desc">Upload your own personalized background photo</span>
            </div>

            <!-- Upload Action Button -->
            <div class="bg-upload-box" id="btnTriggerUpload">
              <input type="file" id="customBgFileInput" accept="image/png, image/jpeg, image/webp" style="display:none;">
              <div class="bg-upload-icon">
                <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                  <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path>
                  <polyline points="17 8 12 3 7 8"></polyline>
                  <line x1="12" y1="3" x2="12" y2="15"></line>
                </svg>
              </div>
              <div class="bg-upload-text">
                <strong>Upload Custom Image</strong>
                <span>Supports PNG, JPG, WebP</span>
              </div>
            </div>

            <!-- Custom Images List Container -->
            <div id="customBackgroundsContainer" class="bg-virtual-grid" style="margin-top:10px;"></div>
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

        <!-- Camera Control Group with Teams/Zoom Inbuilt Effects Chevron -->
        <div class="control-btn-group" id="camControlGroup">
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
          <!-- Inbuilt Video Effects Popover (Teams & Zoom Style) -->
          <div id="cameraEffectsPopover" class="teams-effects-popover">
            <div class="teams-effects-header">
              <span class="teams-effects-title">Video Effects &amp; Settings</span>
              <button type="button" id="btnCloseEffectsPopover" class="teams-effects-close" title="Close">&times;</button>
            </div>

            <div class="teams-effects-body">
              <!-- 1. Camera Selection -->
              <div class="teams-section">
                <div class="teams-section-title">Camera</div>
                <div id="cameraDeviceList" class="teams-camera-list">
                  <label class="teams-camera-radio">
                    <input type="radio" name="cameraDeviceRadio" value="default" checked>
                    <span class="teams-camera-name" id="labelCurrentCamera">Integrated Webcam</span>
                  </label>
                </div>
              </div>

              <div class="teams-divider"></div>

              <!-- 2. Backgrounds Selection -->
              <div class="teams-section">
                <div class="teams-section-title">Backgrounds</div>
                <div class="teams-bg-grid">
                  <!-- None -->
                  <button type="button" class="teams-bg-card active" data-bg-type="none" data-bg-value="none" title="None">
                    <div class="teams-bg-thumb">
                      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <circle cx="12" cy="12" r="10"></circle>
                        <line x1="4.93" y1="4.93" x2="19.07" y2="19.07"></line>
                      </svg>
                    </div>
                    <span class="teams-bg-label">None</span>
                    <div class="teams-bg-check">✓</div>
                  </button>

                  <!-- Standard blur -->
                  <button type="button" class="teams-bg-card" data-bg-type="blur" data-bg-value="light" title="Standard blur">
                    <div class="teams-bg-thumb">
                      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"></path>
                        <circle cx="9" cy="7" r="4"></circle>
                        <path d="M23 21v-2a4 4 0 0 0-3-3.87"></path>
                        <path d="M16 3.13a4 4 0 0 1 0 7.75"></path>
                      </svg>
                    </div>
                    <span class="teams-bg-label">Standard blur ⌵</span>
                    <div class="teams-bg-check">✓</div>
                  </button>

                  <!-- Decorate / Studio Lighting -->
                  <button type="button" class="teams-bg-card" data-bg-type="decorate" data-bg-value="decorate" title="Decorate">
                    <div class="teams-bg-thumb" style="position:relative;">
                      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <path d="M12 2l2.5 5 5 .5-4 4 1 5.5-4.5-2.5-4.5 2.5 1-5.5-4-4 5-.5z"></path>
                      </svg>
                      <span style="position:absolute; top:-2px; right:-6px; font-size:10px;">💎</span>
                    </div>
                    <span class="teams-bg-label">Decorate</span>
                    <div class="teams-bg-check">✓</div>
                  </button>

                  <!-- Cosmic Warp (from screenshot) -->
                  <button type="button" class="teams-bg-card img-card" data-bg-type="image" data-bg-value="assets/backgrounds/cosmic-space.svg" title="Cosmic Warp">
                    <div class="teams-bg-thumb" style="background-image: url('assets/backgrounds/cosmic-space.svg'); background-size:cover; background-position:center;"></div>
                    <div class="teams-bg-check">✓</div>
                  </button>

                  <!-- Modern Home Office -->
                  <button type="button" class="teams-bg-card img-card" data-bg-type="image" data-bg-value="assets/backgrounds/modern-home-office.svg" title="Modern Home Office">
                    <div class="teams-bg-thumb" style="background-image: url('assets/backgrounds/modern-home-office.svg'); background-size:cover; background-position:center;"></div>
                    <div class="teams-bg-check">✓</div>
                  </button>

                  <!-- Professional Office -->
                  <button type="button" class="teams-bg-card img-card" data-bg-type="image" data-bg-value="assets/backgrounds/professional-office.svg" title="Professional Office">
                    <div class="teams-bg-thumb" style="background-image: url('assets/backgrounds/professional-office.svg'); background-size:cover; background-position:center;"></div>
                    <div class="teams-bg-check">✓</div>
                  </button>
                </div>
              </div>

              <div class="teams-divider"></div>

              <!-- 3. Adjust brightness -->
              <div class="teams-toggle-row">
                <span class="teams-toggle-text">Adjust brightness</span>
                <label class="teams-switch">
                  <input type="checkbox" id="teamsAdjustBrightness">
                  <span class="teams-switch-slider"></span>
                </label>
              </div>

              <!-- 4. Soft focus (Smooth appearance / touch up) -->
              <div class="teams-toggle-row">
                <span class="teams-toggle-text">Soft focus</span>
                <label class="teams-switch">
                  <input type="checkbox" id="teamsSoftFocus" checked>
                  <span class="teams-switch-slider"></span>
                </label>
              </div>

              <!-- Soft focus intensity slider with smiling face icon -->
              <div id="teamsSoftFocusControl" class="teams-slider-row">
                <div class="teams-face-icon" title="Soft focus smoothing intensity">
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <circle cx="12" cy="12" r="10"></circle>
                    <path d="M8 14s1.5 2 4 2 4-2 4-2"></path>
                    <line x1="9" y1="9" x2="9.01" y2="9"></line>
                    <line x1="15" y1="9" x2="15.01" y2="9"></line>
                  </svg>
                </div>
                <input type="range" id="teamsSoftFocusRange" min="0" max="100" value="50" class="teams-range-slider" title="Soft focus intensity">
              </div>

              <div class="teams-divider"></div>

              <!-- 5. More video effects link -->
              <div class="teams-footer">
                <button type="button" id="btnTeamsMoreEffects" class="teams-more-link">
                  More video effects and settings
                </button>
              </div>
            </div>
          </div>
        </div>

        <!-- Video Effects Trigger Button -->
        <button id="btnToggleBackgrounds" class="control-btn" data-tooltip="Video Effects &amp; Filters (B)" title="Video Effects &amp; Filters">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <rect x="3" y="3" width="18" height="18" rx="3" ry="3"></rect>
            <circle cx="8.5" cy="8.5" r="1.5"></circle>
            <polyline points="21 15 16 10 5 21"></polyline>
            <path d="M18 4l1 2 2 1-2 1-1 2-1-2-2-1 2-1z" fill="currentColor"></path>
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

        <!-- Raise Hand Button (Immediately to the LEFT of Reactions) -->
        <button id="btnRaiseHand" class="control-btn" data-tooltip="Raise Hand (H)" title="Raise Hand">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <path d="M18 11V6a2 2 0 0 0-2-2 2 2 0 0 0-2 2v0"></path>
            <path d="M14 10V4a2 2 0 0 0-2-2 2 2 0 0 0-2 2v2"></path>
            <path d="M10 10.5V6a2 2 0 0 0-2-2 2 2 0 0 0-2 2v8"></path>
            <path d="M18 8a2 2 0 1 1 4 0v6a8 8 0 0 1-8 8h-2c-2.8 0-4.5-.86-5.99-2.34l-3.6-3.6a2 2 0 0 1 2.83-2.82L7 15"></path>
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

        <!-- Toggle Fullscreen -->
        <button id="btnToggleFullscreen" class="control-btn" data-tooltip="Toggle Fullscreen (F)">
          <svg id="iconFullscreenEnter" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <path d="M8 3H5a2 2 0 0 0-2 2v3m18 0V5a2 2 0 0 0-2-2h-3m0 18h3a2 2 0 0 0 2-2v-3M3 16v3a2 2 0 0 0 2 2h3"></path>
          </svg>
          <svg id="iconFullscreenExit" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="display:none;">
            <path d="M8 3v3a2 2 0 0 1-2 2H3m18 0h-3a2 2 0 0 1-2-2V3m0 18v-3a2 2 0 0 1 2-2h3M3 16h3a2 2 0 0 1 2 2v3"></path>
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
        <div style="display:flex; justify-content:space-between;"><kbd style="background:rgba(255,255,255,0.1); padding:2px 8px; border-radius:4px;">B</kbd> <span>Background Effects Panel</span></div>
        <div style="display:flex; justify-content:space-between;"><kbd style="background:rgba(255,255,255,0.1); padding:2px 8px; border-radius:4px;">S</kbd> <span>Share / Stop Screen</span></div>
        <div style="display:flex; justify-content:space-between;"><kbd style="background:rgba(255,255,255,0.1); padding:2px 8px; border-radius:4px;">H</kbd> <span>Raise / Lower Hand</span></div>
        <div style="display:flex; justify-content:space-between;"><kbd style="background:rgba(255,255,255,0.1); padding:2px 8px; border-radius:4px;">F</kbd> <span>Toggle Fullscreen Mode</span></div>
        <div style="display:flex; justify-content:space-between;"><kbd style="background:rgba(255,255,255,0.1); padding:2px 8px; border-radius:4px;">C</kbd> <span>Toggle Chat Panel</span></div>
        <div style="display:flex; justify-content:space-between;"><kbd style="background:rgba(255,255,255,0.1); padding:2px 8px; border-radius:4px;">?</kbd> <span>Show Shortcuts Sheet</span></div>
      </div>
    </div>
  </div>

  <!-- Native Meeting Waiting Room (Shown to attendees until admitted by the host) -->
  <div id="nativeWaitingRoom" style="display:none; position:fixed; inset:0; background:radial-gradient(circle at 50% 30%, #172138 0%, #090d16 100%); z-index:9998; align-items:center; justify-content:center; padding:20px;">
    <div class="card-glass" style="max-width:480px; width:100%; padding:40px 32px; text-align:center; border:1px solid rgba(255,255,255,0.1); border-radius:20px; box-shadow:0 20px 50px rgba(0,0,0,0.5);">
      <div style="margin:0 auto 24px; width:72px; height:72px; border-radius:50%; border:3px solid rgba(99,102,241,0.25); border-top-color:#6366f1; border-right-color:#a855f7; animation:jitsiSpin 1.2s linear infinite; display:flex; align-items:center; justify-content:center;">
        <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#818cf8" stroke-width="2">
          <circle cx="12" cy="12" r="10"></circle>
          <polyline points="12 6 12 12 16 14"></polyline>
        </svg>
      </div>
      <h2 style="font-size:1.45rem; font-weight:700; margin-bottom:10px; color:#fff;" id="waitingTitle">Please wait, the host will let you in soon</h2>
      <p style="color:var(--text-muted); font-size:0.92rem; line-height:1.5; margin-bottom:24px;" id="waitingSubtitle">
        You have joined the meeting lobby. We've let the meeting host know that you're waiting.
      </p>
      <div style="background:rgba(255,255,255,0.04); border:1px solid rgba(255,255,255,0.08); border-radius:12px; padding:12px 16px; margin-bottom:24px; display:inline-flex; align-items:center; gap:10px;">
        <span style="font-size:0.85rem; color:#94a3b8;">Meeting:</span>
        <strong style="color:#e2e8f0; font-size:0.9rem;" id="waitingMeetingNameDisplay"><?= htmlspecialchars($meetingTitle) ?></strong>
      </div>
      <div>
        <a href="index.php" class="btn btn-secondary" style="text-decoration:none; display:inline-flex; align-items:center; gap:8px;">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"></path>
            <polyline points="16 17 21 12 16 7"></polyline>
            <line x1="21" y1="12" x2="9" y2="12"></line>
          </svg>
          Leave Lobby
        </a>
      </div>
    </div>
  </div>

  <!-- Floating Host Admission Notification (Teams/Zoom style) -->
  <div id="hostAdmissionBanner" class="host-admission-banner" style="display:none;">
    <div style="display:flex; align-items:center; gap:12px;">
      <div class="admission-avatar" id="admissionBannerAvatar">U</div>
      <div>
        <div style="font-weight:600; font-size:0.92rem; color:#fff;" id="admissionBannerName">Attendee</div>
        <div style="font-size:0.75rem; color:#fbbf24;">Waiting in lobby to enter</div>
      </div>
    </div>
    <div style="display:flex; align-items:center; gap:8px;">
      <button type="button" id="btnBannerAdmit" class="btn btn-primary btn-sm" style="background:#10b981; border-color:#10b981; font-weight:600; padding:6px 12px; cursor:pointer;">
        Admit
      </button>
      <button type="button" id="btnBannerDeny" class="btn btn-secondary btn-sm" style="color:#ef4444; border-color:rgba(239,68,68,0.3); padding:6px 10px; cursor:pointer;">
        Deny
      </button>
    </div>
  </div>

  <!-- Participant Prompt Modal (Host requested Mute/Unmute) -->
  <div id="participantPromptModal" style="display:none; position:fixed; inset:0; background:rgba(4,7,14,0.85); backdrop-filter:blur(10px); z-index:9999; align-items:center; justify-content:center; padding:16px;">
    <div class="card-glass" style="max-width:420px; width:100%; padding:28px 24px; text-align:center; border:1px solid rgba(255,255,255,0.15); border-radius:16px;">
      <div id="promptModalIcon" style="width:52px; height:52px; border-radius:50%; background:rgba(99,102,241,0.15); border:1px solid rgba(99,102,241,0.3); color:#818cf8; display:flex; align-items:center; justify-content:center; margin:0 auto 16px;">
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z"></path>
          <path d="M19 10v2a7 7 0 0 1-14 0v-2"></path>
        </svg>
      </div>
      <h3 id="promptModalTitle" style="font-size:1.2rem; font-weight:700; margin-bottom:8px; color:#fff;">Microphone Request</h3>
      <p id="promptModalMessage" style="color:var(--text-muted); font-size:0.9rem; margin-bottom:24px; line-height:1.5;">
        The meeting host has asked you to mute your microphone.
      </p>
      <div style="display:flex; justify-content:center; gap:12px;">
        <button type="button" id="btnPromptConfirm" class="btn btn-primary" style="padding:9px 20px; font-weight:600; cursor:pointer;">
          Mute Microphone
        </button>
        <button type="button" id="btnPromptDismiss" class="btn btn-secondary" style="padding:9px 18px; cursor:pointer;">
          Dismiss
        </button>
      </div>
    </div>
  </div>

  <!-- Host Action Confirmation Modal (Remove / Make Host) -->
  <div id="hostActionModal" style="display:none; position:fixed; inset:0; background:rgba(4,7,14,0.85); backdrop-filter:blur(10px); z-index:9999; align-items:center; justify-content:center; padding:16px;">
    <div class="card-glass" style="max-width:420px; width:100%; padding:28px 24px; text-align:center; border:1px solid rgba(255,255,255,0.15); border-radius:16px;">
      <div id="hostActionIcon" style="width:52px; height:52px; border-radius:50%; background:rgba(239,68,68,0.15); border:1px solid rgba(239,68,68,0.3); color:#ef4444; display:flex; align-items:center; justify-content:center; margin:0 auto 16px;">
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <circle cx="12" cy="12" r="10"></circle>
          <line x1="12" y1="8" x2="12" y2="12"></line>
          <line x1="12" y1="16" x2="12.01" y2="16"></line>
        </svg>
      </div>
      <h3 id="hostActionTitle" style="font-size:1.2rem; font-weight:700; margin-bottom:8px; color:#fff;">Confirm Action</h3>
      <p id="hostActionMessage" style="color:var(--text-muted); font-size:0.9rem; margin-bottom:24px; line-height:1.5;">
        Are you sure?
      </p>
      <div style="display:flex; justify-content:center; gap:12px;">
        <button type="button" id="btnHostActionConfirm" class="btn btn-danger" style="padding:9px 20px; font-weight:600; cursor:pointer;">
          Confirm
        </button>
        <button type="button" id="btnHostActionCancel" class="btn btn-secondary" style="padding:9px 18px; cursor:pointer;">
          Cancel
        </button>
      </div>
    </div>
  </div>

  <!-- Removed From Meeting Modal -->
  <div id="removedFromMeetingModal" style="display:none; position:fixed; inset:0; background:rgba(4,7,14,0.92); backdrop-filter:blur(14px); z-index:99999; align-items:center; justify-content:center; padding:16px;">
    <div class="card-glass" style="max-width:440px; width:100%; padding:36px 28px; text-align:center; border:1px solid rgba(239,68,68,0.3); border-radius:18px;">
      <div style="width:58px; height:58px; border-radius:50%; background:rgba(239,68,68,0.15); border:1px solid rgba(239,68,68,0.35); color:#ef4444; display:flex; align-items:center; justify-content:center; margin:0 auto 18px;">
        <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <path d="M16 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"></path>
          <circle cx="8.5" cy="7.5" r="4"></circle>
          <line x1="18" y1="8" x2="23" y2="13"></line>
          <line x1="23" y1="8" x2="18" y2="13"></line>
        </svg>
      </div>
      <h3 style="font-size:1.35rem; font-weight:700; margin-bottom:10px; color:#fff;">Removed from Meeting</h3>
      <p style="color:var(--text-muted); font-size:0.92rem; margin-bottom:26px; line-height:1.5;">
        You have been removed from this meeting by the host.
      </p>
      <a href="index.php" class="btn btn-primary" style="text-decoration:none; display:inline-flex; align-items:center; gap:8px; padding:10px 24px; font-weight:600;">
        Return to Home
      </a>
    </div>
  </div>

  <!-- Dynamic Elements -->
  <div id="toastContainer" class="toast-container"></div>
  <div id="reactionsContainer"></div>

  <!-- Scripts -->
  <script src="assets/mediapipe/selfie_segmentation.js"></script>
  <script src="js/sound.js"></script>
  <script src="js/webrtc.js"></script>
  <script src="js/room.js"></script>
</body>
</html>
