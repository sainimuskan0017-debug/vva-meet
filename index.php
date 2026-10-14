<?php
/**
 * VVA Meet - Landing Page & Pre-Join Lobby
 * BigRock Hosting Compatible (PHP + MySQL + Jitsi Meet External API)
 */

if (session_status() === PHP_SESSION_NONE) {
    session_start();
}

// Require login first: Any visitor who has not logged in is redirected to the login page
if (empty($_SESSION['user_id'])) {
    header('Location: login.php');
    exit;
}

$isLoggedIn = true;
$loggedInUser = [
    'id' => $_SESSION['user_id'],
    'username' => $_SESSION['user_name'] ?? 'User',
    'email' => $_SESSION['user_email'] ?? '',
    'auth_provider' => $_SESSION['auth_provider'] ?? 'email'
];

$baseDir = rtrim(dirname($_SERVER['SCRIPT_NAME']), '/\\');
$baseUrl = ($baseDir === '' || $baseDir === '/') ? '/' : $baseDir . '/';
?>
<!DOCTYPE html>
<html lang="en">

<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>VVA Meet - Next-Gen Video Conferencing</title>
  <base href="<?= htmlspecialchars($baseUrl) ?>">
  <link rel="stylesheet" href="css/main.css">
  <link rel="stylesheet" href="css/landing.css">
</head>

<body>
  <div class="landing-container">
    <!-- Header -->
    <header class="landing-header">
      <a href="./" class="brand-logo">
        <div class="brand-icon">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"
            stroke-linecap="round" stroke-linejoin="round">
            <polygon points="23 7 16 12 23 17 23 7"></polygon>
            <rect x="1" y="5" width="15" height="14" rx="2" ry="2"></rect>
          </svg>
        </div>
        <span class="brand-name"><strong class="brand-vva">VVA</strong> <span class="brand-meet">Meet</span></span>
      </a>

      <div class="header-meta" style="display:flex; align-items:center; gap:8px;">
        <?php if ($isLoggedIn): ?>
          <!-- Logged In User Profile -->
          <div style="display:flex; align-items:center; gap:8px; background:rgba(255,255,255,0.06); padding:4px 12px; border-radius:999px; border:1px solid rgba(255,255,255,0.12);">
            <div style="width:24px; height:24px; border-radius:50%; background:linear-gradient(135deg,#6366f1,#8b5cf6); display:flex; align-items:center; justify-content:center; font-weight:700; font-size:0.75rem; color:#fff;">
              <?= strtoupper(substr($loggedInUser['username'], 0, 1)) ?>
            </div>
            <span style="font-size:0.85rem; font-weight:600; color:#fff;"><?= htmlspecialchars($loggedInUser['username']) ?></span>
            <span style="font-size:0.72rem; color:var(--text-muted);">(ID: <?= htmlspecialchars(substr($loggedInUser['id'], 0, 8)) ?>)</span>
            <a href="login.php?action=switch" class="badge" style="text-decoration:none; color:#f87171; background:rgba(239,68,68,0.15); border:1px solid rgba(239,68,68,0.3); padding:2px 8px; margin-left:4px;" title="Sign Out">Sign Out</a>
          </div>
        <?php else: ?>
          <!-- Authentication Buttons -->
          <a href="login.php?tab=signin" class="btn btn-secondary" style="padding:6px 14px; font-size:0.82rem; text-decoration:none;">Sign In</a>
          <a href="login.php?tab=signup" class="btn btn-primary" style="padding:6px 14px; font-size:0.82rem; text-decoration:none;">Sign Up</a>
        <?php endif; ?>
      </div>
    </header>

    <!-- Main Content -->
    <main class="landing-main">
      <div class="hero-text">
        <h1>Seamless, Secure Video Conferences</h1>
      </div>
      <div class="lobby-grid">
        <!-- Media Preview Card (Lobby) -->
        <div class="card-glass preview-card">
          <div class="video-preview-wrapper">
            <video id="previewVideo" autoplay playsinline muted></video>
            <div id="videoPlaceholder" class="video-placeholder" style="display: none;">
              <div id="avatarPreview" class="avatar-preview"><?= $isLoggedIn ? strtoupper(substr($loggedInUser['username'], 0, 1)) : 'U' ?></div>
              <span>Camera is turned off</span>
            </div>

            <!-- Preview Toggle Controls -->
            <div class="preview-controls">
              <button id="btnTogglePreviewMic" class="preview-btn" data-tooltip="Toggle Microphone"
                aria-label="Toggle Microphone">
                <svg id="iconMicOn" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor"
                  stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                  <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z"></path>
                  <path d="M19 10v2a7 7 0 0 1-14 0v-2"></path>
                  <line x1="12" y1="19" x2="12" y2="23"></line>
                  <line x1="8" y1="23" x2="16" y2="23"></line>
                </svg>
                <svg id="iconMicOff" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor"
                  stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="display:none;">
                  <line x1="1" y1="1" x2="23" y2="23"></line>
                  <path d="M9 9v3a3 3 0 0 0 5.12 2.12M15 9.34V4a3 3 0 0 0-5.94-.6"></path>
                  <path d="M17 16.95A7 7 0 0 1 5 12v-2m14 0v2a7 7 0 0 1-.11 1.23"></path>
                  <line x1="12" y1="19" x2="12" y2="23"></line>
                  <line x1="8" y1="23" x2="16" y2="23"></line>
                </svg>
              </button>

              <button id="btnTogglePreviewCam" class="preview-btn" data-tooltip="Toggle Camera"
                aria-label="Toggle Camera">
                <svg id="iconCamOn" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor"
                  stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                  <polygon points="23 7 16 12 23 17 23 7"></polygon>
                  <rect x="1" y="5" width="15" height="14" rx="2" ry="2"></rect>
                </svg>
                <svg id="iconCamOff" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor"
                  stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="display:none;">
                  <line x1="1" y1="1" x2="23" y2="23"></line>
                  <path d="M21 21l-3.5-3.5M23 7l-7 5 7 5V7z"></path>
                  <rect x="1" y="5" width="15" height="14" rx="2" ry="2"></rect>
                </svg>
              </button>
            </div>
          </div>

          <!-- Mic Audio Visualizer -->
          <div class="audio-meter-container">
            <span class="meter-label">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z"></path>
                <path d="M19 10v2a7 7 0 0 1-14 0v-2"></path>
              </svg>
              Mic Level:
            </span>
            <div class="meter-bar-wrapper">
              <div id="micMeterFill" class="meter-bar-fill"></div>
            </div>
          </div>
        </div>

        <!-- Join / Create Room Form Card -->
        <div class="card-glass form-card">
          <div class="form-header">
            <h2>Start or Join a Meeting</h2>
            <p>Pick a display name, room ID, and optional security passcode.</p>
          </div>

          <form id="joinForm" class="form-body">
            <!-- Name Input -->
            <div class="input-group">
              <label class="input-label" for="usernameInput">Your Display Name / User ID</label>
              <input type="text" id="usernameInput" class="input-field" placeholder="e.g. Alex Morgan" maxlength="32"
                value="<?= $isLoggedIn ? htmlspecialchars($loggedInUser['username']) : '' ?>"
                required autocomplete="name">
            </div>

            <!-- Room ID Input -->
            <div class="input-group">
              <label class="input-label" for="roomIdInput">Room Name or ID</label>
              <div class="room-input-container">
                <input type="text" id="roomIdInput" class="input-field" placeholder="e.g. daily-sync-room"
                  maxlength="40" required autocomplete="off">
                <button type="button" id="btnGenerateRoom" class="btn btn-secondary btn-generate"
                  title="Generate random room code">
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"
                    stroke-linecap="round" stroke-linejoin="round">
                    <polyline points="23 4 23 10 17 10"></polyline>
                    <polyline points="1 20 1 14 7 14"></polyline>
                    <path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"></path>
                  </svg>
                  Random
                </button>
              </div>
            </div>

            <!-- Meeting Passcode Input -->
            <div class="input-group">
              <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:6px;">
                <label class="input-label" for="passcodeInput" style="margin-bottom:0;">Meeting Passcode</label>
                <span style="font-size:0.75rem; color:var(--text-muted);">Required if set on room</span>
              </div>
              <div class="room-input-container">
                <input type="text" id="passcodeInput" class="input-field" placeholder="e.g. 482910 (Optional for open rooms)"
                  maxlength="32" autocomplete="off">
                <button type="button" id="btnGeneratePasscode" class="btn btn-secondary btn-generate"
                  title="Generate 6-digit Security PIN">
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <rect x="3" y="11" width="18" height="11" rx="2" ry="2"></rect>
                    <path d="M7 11V7a5 5 0 0 1 10 0v4"></path>
                  </svg>
                  PIN
                </button>
              </div>
            </div>

            <div class="form-actions">
              <button type="submit" id="btnJoinRoom" class="btn btn-primary btn-join-main">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"
                  stroke-linecap="round" stroke-linejoin="round">
                  <polygon points="5 3 19 12 5 21 5 3"></polygon>
                </svg>
                Enter Meeting
              </button>
            </div>
          </form>

          <div style="display:flex; justify-content:space-between; align-items:center; margin-top:14px; font-size:0.82rem; color:var(--text-muted);">
            <a href="login.php?tab=join" style="color:#818cf8; text-decoration:none;">🔒 Direct Passcode Entry</a>
            <a href="login.php?tab=signin" style="color:var(--text-muted); text-decoration:none;">Sign in with Google / Email</a>
          </div>

          <!-- Shareable link preview -->
          <div id="shareLinkContainer"
            style="display:none; margin-top: 16px; padding: 10px 14px; background: rgba(0,0,0,0.3); border-radius: var(--radius-sm); border: 1px dashed var(--border-subtle); font-size: 0.82rem;">
            <div style="display:flex; justify-content:space-between; align-items:center;">
              <span style="color:var(--text-muted); overflow:hidden; text-overflow:ellipsis; white-space:nowrap;"
                id="shareUrlPreview"></span>
              <button type="button" id="btnCopyShareLink" class="btn btn-secondary"
                style="padding:4px 8px; font-size:0.75rem;">
                Copy
              </button>
            </div>
          </div>
        </div>
      </div>

    </main>
  </div>

  <!-- Toast Container -->
  <div id="toastContainer" class="toast-container"></div>

  <script src="js/landing.js"></script>
</body>

</html>
