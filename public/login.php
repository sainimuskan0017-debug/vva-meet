<?php
/**
 * VVA Meet - Authentication Portal
 * Provides Sign In, Sign Up (Email/Gmail or Google), and Direct Meeting Entry with Passcode
 * Compatible with BigRock Hosting (PHP + MySQL)
 */

if (session_status() === PHP_SESSION_NONE) {
    session_start();
}

// Handle explicit logout or account switch
if (isset($_GET['action']) && in_array($_GET['action'], ['switch', 'logout'])) {
    $_SESSION = [];
    if (ini_get("session.use_cookies")) {
        $params = session_get_cookie_params();
        setcookie(session_name(), '', time() - 42000,
            $params["path"], $params["domain"],
            $params["secure"], $params["httponly"]
        );
    }
    if (session_id() !== '') {
        session_destroy();
    }
}

// Redirect if already logged in unless action=switch or action=logout
if (!empty($_SESSION['user_id']) && ($_GET['action'] ?? '') !== 'switch' && ($_GET['action'] ?? '') !== 'logout' && empty($_GET['redirect'])) {
    header('Location: index.php');
    exit;
}

$redirectUrl = $_GET['redirect'] ?? 'index.php';
$initialTab = $_GET['tab'] ?? 'signin';
$defaultRoom = $_GET['room'] ?? '';
$defaultPasscode = $_GET['passcode'] ?? '';

$baseDir = rtrim(dirname($_SERVER['SCRIPT_NAME']), '/\\');
$baseUrl = ($baseDir === '' || $baseDir === '/') ? '/' : $baseDir . '/';
?>
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Sign In & Join Meetings - VVA Meet</title>
  <base href="<?= htmlspecialchars($baseUrl) ?>">
  <link rel="stylesheet" href="css/main.css">
  <style>
    body {
      min-height: 100vh;
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      padding: 32px 16px;
      background: radial-gradient(circle at 50% 15%, #18223c 0%, #080c16 100%);
      position: relative;
      overflow-x: hidden;
    }

    body::before {
      content: '';
      position: absolute;
      top: -150px;
      left: 50%;
      transform: translateX(-50%);
      width: 700px;
      height: 400px;
      background: radial-gradient(circle, rgba(99, 102, 241, 0.18) 0%, rgba(99, 102, 241, 0) 70%);
      pointer-events: none;
      z-index: 0;
    }

    .auth-container {
      width: 100%;
      max-width: 480px;
      position: relative;
      z-index: 10;
    }

    .auth-card {
      background: rgba(15, 23, 42, 0.78);
      backdrop-filter: blur(20px);
      border: 1px solid rgba(255, 255, 255, 0.1);
      border-radius: 24px;
      padding: 36px 32px;
      box-shadow: 0 25px 50px -12px rgba(0, 0, 0, 0.6), 0 0 0 1px rgba(255, 255, 255, 0.05);
    }

    .auth-header {
      text-align: center;
      margin-bottom: 24px;
    }

    .auth-logo {
      display: inline-flex;
      align-items: center;
      gap: 10px;
      font-size: 1.25rem;
      font-weight: 700;
      color: #ffffff;
      text-decoration: none;
      margin-bottom: 14px;
    }

    .auth-tabs {
      display: flex;
      background: rgba(255, 255, 255, 0.04);
      border: 1px solid rgba(255, 255, 255, 0.08);
      border-radius: 12px;
      padding: 4px;
      margin-bottom: 24px;
      gap: 4px;
    }

    .auth-tab-btn {
      flex: 1;
      padding: 9px 12px;
      border: none;
      background: transparent;
      color: var(--text-muted);
      font-size: 0.85rem;
      font-weight: 600;
      border-radius: 8px;
      cursor: pointer;
      transition: all 0.2s ease;
      display: flex;
      align-items: center;
      justify-content: center;
      gap: 6px;
    }

    .auth-tab-btn.active {
      background: rgba(99, 102, 241, 0.25);
      color: #ffffff;
      border: 1px solid rgba(99, 102, 241, 0.4);
      box-shadow: 0 2px 8px rgba(99, 102, 241, 0.2);
    }

    .tab-content {
      display: none;
    }

    .tab-content.active {
      display: block;
      animation: fadeIn 0.25s ease forwards;
    }

    @keyframes fadeIn {
      from { opacity: 0; transform: translateY(6px); }
      to { opacity: 1; transform: translateY(0); }
    }

    .btn-google {
      width: 100%;
      display: flex;
      align-items: center;
      justify-content: center;
      gap: 12px;
      padding: 11px 18px;
      background: rgba(255, 255, 255, 0.06);
      border: 1px solid rgba(255, 255, 255, 0.15);
      border-radius: 10px;
      color: #ffffff;
      font-size: 0.92rem;
      font-weight: 600;
      cursor: pointer;
      transition: all 0.2s ease;
      margin-bottom: 20px;
    }

    .btn-google:hover {
      background: rgba(255, 255, 255, 0.1);
      border-color: rgba(255, 255, 255, 0.3);
      transform: translateY(-1px);
    }

    .divider-text {
      display: flex;
      align-items: center;
      text-align: center;
      margin: 18px 0;
      color: var(--text-muted);
      font-size: 0.78rem;
      text-transform: uppercase;
      letter-spacing: 0.05em;
    }

    .divider-text::before,
    .divider-text::after {
      content: '';
      flex: 1;
      border-bottom: 1px solid rgba(255, 255, 255, 0.08);
    }

    .divider-text span {
      padding: 0 12px;
    }

    .input-row {
      margin-bottom: 16px;
    }

    .input-row label {
      display: block;
      font-size: 0.82rem;
      font-weight: 500;
      color: var(--text-muted);
      margin-bottom: 6px;
    }

    .input-wrapper {
      position: relative;
    }

    .input-control {
      width: 100%;
      padding: 11px 14px;
      background: rgba(0, 0, 0, 0.35);
      border: 1px solid rgba(255, 255, 255, 0.12);
      border-radius: 10px;
      color: #ffffff;
      font-size: 0.92rem;
      transition: all 0.2s ease;
      box-sizing: border-box;
    }

    .input-control:focus {
      outline: none;
      border-color: #6366f1;
      box-shadow: 0 0 0 3px rgba(99, 102, 241, 0.25);
      background: rgba(0, 0, 0, 0.5);
    }

    .input-icon-right {
      position: absolute;
      right: 12px;
      top: 50%;
      transform: translateY(-50%);
      background: none;
      border: none;
      color: var(--text-muted);
      cursor: pointer;
      padding: 4px;
    }

    .passcode-badge {
      display: inline-flex;
      align-items: center;
      gap: 4px;
      padding: 2px 8px;
      background: rgba(245, 158, 11, 0.15);
      color: #f59e0b;
      border: 1px solid rgba(245, 158, 11, 0.3);
      border-radius: 4px;
      font-size: 0.72rem;
      font-weight: 600;
      margin-left: 6px;
    }

    .btn-submit {
      width: 100%;
      padding: 12px 20px;
      background: linear-gradient(135deg, #6366f1 0%, #4f46e5 100%);
      border: none;
      border-radius: 10px;
      color: #ffffff;
      font-size: 0.95rem;
      font-weight: 600;
      cursor: pointer;
      transition: all 0.2s ease;
      box-shadow: 0 4px 14px rgba(79, 70, 229, 0.4);
      display: flex;
      align-items: center;
      justify-content: center;
      gap: 8px;
      margin-top: 8px;
    }

    .btn-submit:hover {
      background: linear-gradient(135deg, #4f46e5 0%, #4338ca 100%);
      transform: translateY(-1px);
      box-shadow: 0 6px 18px rgba(79, 70, 229, 0.5);
    }

    .btn-join-direct {
      background: linear-gradient(135deg, #10b981 0%, #059669 100%);
      box-shadow: 0 4px 14px rgba(16, 185, 129, 0.35);
    }

    .btn-join-direct:hover {
      background: linear-gradient(135deg, #059669 0%, #047857 100%);
      box-shadow: 0 6px 18px rgba(16, 185, 129, 0.45);
    }

    .footer-note {
      text-align: center;
      margin-top: 24px;
      font-size: 0.85rem;
      color: var(--text-muted);
    }

    .footer-note a {
      color: #818cf8;
      text-decoration: none;
      font-weight: 500;
    }

    .footer-note a:hover {
      text-decoration: underline;
    }

    /* Google Modal Simulator for Quick Testing */
    .modal-overlay {
      position: fixed;
      inset: 0;
      background: rgba(0, 0, 0, 0.7);
      backdrop-filter: blur(8px);
      z-index: 9999;
      display: none;
      align-items: center;
      justify-content: center;
      padding: 16px;
    }

    .modal-overlay.open {
      display: flex;
    }

    .google-modal {
      width: 100%;
      max-width: 400px;
      background: #1e293b;
      border: 1px solid rgba(255, 255, 255, 0.15);
      border-radius: 18px;
      padding: 28px 24px;
      box-shadow: 0 20px 40px rgba(0,0,0,0.6);
    }
  </style>
</head>
<body>
  <div class="auth-container">
    <div class="auth-card">
      <!-- Header -->
      <div class="auth-header">
        <a href="index.php" class="auth-logo">
          <div class="brand-icon">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
              <polygon points="23 7 16 12 23 17 23 7"></polygon>
              <rect x="1" y="5" width="15" height="14" rx="2" ry="2"></rect>
            </svg>
          </div>
          <span class="brand-name"><strong class="brand-vva">VVA</strong> <span class="brand-meet">Meet</span></span>
        </a>
        <p id="authSubtitle" style="color: var(--text-muted); font-size: 0.88rem; margin: 0;">Sign in to start or join encrypted conferences</p>
      </div>

      <!-- Navigation Tabs -->
      <div class="auth-tabs">
        <button type="button" class="auth-tab-btn <?= $initialTab === 'signin' ? 'active' : '' ?>" data-tab="signin">
          Sign In
        </button>
        <button type="button" class="auth-tab-btn <?= $initialTab === 'signup' ? 'active' : '' ?>" data-tab="signup">
          Sign Up
        </button>
        <button type="button" class="auth-tab-btn <?= $initialTab === 'join' ? 'active' : '' ?>" data-tab="join">
          Enter Meeting
        </button>
      </div>

      <!-- ================= 1. SIGN IN FORM ================= -->
      <div id="tab-signin" class="tab-content <?= $initialTab === 'signin' ? 'active' : '' ?>">
        <!-- One-Click Google / Gmail Button -->
        <button type="button" class="btn-google btn-google-trigger">
          <svg width="18" height="18" viewBox="0 0 24 24">
            <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
            <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
            <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z"/>
            <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z"/>
          </svg>
          Continue with Google
        </button>

        <div class="divider-text"><span>or continue with email</span></div>

        <form id="formSignIn">
          <div class="input-row">
            <label for="signinEmail">Email or Gmail Address</label>
            <div class="input-wrapper">
              <input type="email" id="signinEmail" class="input-control" placeholder="alex@gmail.com" required autocomplete="email">
            </div>
          </div>

          <div class="input-row">
            <label for="signinPassword">Password</label>
            <div class="input-wrapper">
              <input type="password" id="signinPassword" class="input-control" placeholder="••••••••" required autocomplete="current-password">
              <button type="button" class="input-icon-right btn-toggle-pwd" title="Show / Hide Password">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"></path><circle cx="12" cy="12" r="3"></circle></svg>
              </button>
            </div>
          </div>

          <button type="submit" id="btnSignInSubmit" class="btn-submit">
            <span>Sign In to VVA Meet</span>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><line x1="5" y1="12" x2="19" y2="12"></line><polyline points="12 5 19 12 12 19"></polyline></svg>
          </button>
        </form>

        <div class="footer-note">
          Don't have an account? <a href="javascript:void(0)" onclick="switchTab('signup')">Create account</a>
        </div>
      </div>

      <!-- ================= 2. SIGN UP FORM ================= -->
      <div id="tab-signup" class="tab-content <?= $initialTab === 'signup' ? 'active' : '' ?>">
        <button type="button" class="btn-google btn-google-trigger">
          <svg width="18" height="18" viewBox="0 0 24 24">
            <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
            <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
            <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z"/>
            <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z"/>
          </svg>
          Sign up with Google
        </button>

        <div class="divider-text"><span>or sign up with email</span></div>

        <form id="formSignUp">
          <div class="input-row">
            <label for="signupName">Full Name / Display Name</label>
            <div class="input-wrapper">
              <input type="text" id="signupName" class="input-control" placeholder="Alex Morgan" required autocomplete="name">
            </div>
          </div>

          <div class="input-row">
            <label for="signupUserId">User ID <span style="font-size:0.75rem; color:var(--text-muted); font-weight:normal;">(Optional custom ID)</span></label>
            <div class="input-wrapper">
              <input type="text" id="signupUserId" class="input-control" placeholder="e.g. alex99" autocomplete="username">
            </div>
          </div>

          <div class="input-row">
            <label for="signupEmail">Email or Gmail Address</label>
            <div class="input-wrapper">
              <input type="email" id="signupEmail" class="input-control" placeholder="alex.morgan@gmail.com" required autocomplete="email">
            </div>
          </div>

          <div class="input-row">
            <label for="signupPassword">Password</label>
            <div class="input-wrapper">
              <input type="password" id="signupPassword" class="input-control" placeholder="At least 6 characters" minlength="6" required autocomplete="new-password">
              <button type="button" class="input-icon-right btn-toggle-pwd" title="Show / Hide Password">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"></path><circle cx="12" cy="12" r="3"></circle></svg>
              </button>
            </div>
          </div>

          <button type="submit" id="btnSignUpSubmit" class="btn-submit">
            <span>Create Free Account</span>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="20 6 9 17 4 12"></polyline></svg>
          </button>
        </form>

        <div class="footer-note">
          Already have an account? <a href="javascript:void(0)" onclick="switchTab('signin')">Sign in</a>
        </div>
      </div>

      <!-- ================= 3. JOIN MEETING WITH PASSCODE ================= -->
      <div id="tab-join" class="tab-content <?= $initialTab === 'join' ? 'active' : '' ?>">
        <div style="background: rgba(99, 102, 241, 0.08); border: 1px solid rgba(99, 102, 241, 0.2); border-radius: 12px; padding: 12px 14px; margin-bottom: 20px; font-size: 0.85rem; color: #c7d2fe; display: flex; gap: 10px; align-items: center;">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"></rect><path d="M7 11V7a5 5 0 0 1 10 0v4"></path></svg>
          <span>Enter meeting room code and security passcode to join instantly.</span>
        </div>

        <form id="formDirectJoin">
          <div class="input-row">
            <label for="directRoomId">Meeting Room Name or Code</label>
            <div class="input-wrapper">
              <input type="text" id="directRoomId" class="input-control" placeholder="e.g. daily-sync-room" value="<?= htmlspecialchars($defaultRoom) ?>" required autocomplete="off">
            </div>
          </div>

          <div class="input-row">
            <label for="directUsername">Your Name or User ID</label>
            <div class="input-wrapper">
              <input type="text" id="directUsername" class="input-control" placeholder="e.g. Alex Morgan" required autocomplete="name">
            </div>
          </div>

          <div class="input-row">
            <label for="directPasscode">
              Meeting Passcode
              <span class="passcode-badge">Required if set</span>
            </label>
            <div class="input-wrapper">
              <input type="text" id="directPasscode" class="input-control" placeholder="e.g. 482910" value="<?= htmlspecialchars($defaultPasscode) ?>" autocomplete="off">
            </div>
          </div>

          <button type="submit" id="btnDirectJoinSubmit" class="btn-submit btn-join-direct">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polygon points="5 3 19 12 5 21 5 3"></polygon></svg>
            <span>Enter Meeting Now</span>
          </button>
        </form>

        <div class="footer-note">
          Want to host & schedule rooms? <a href="javascript:void(0)" onclick="switchTab('signin')">Sign in</a>
        </div>
      </div>
    </div>
  </div>

  <!-- Google Authentication Dialog / Modal -->
  <div id="googleAuthModal" class="modal-overlay">
    <div class="google-modal">
      <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:16px;">
        <div style="display:flex; align-items:center; gap:8px;">
          <svg width="20" height="20" viewBox="0 0 24 24">
            <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
            <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
            <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z"/>
            <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z"/>
          </svg>
          <span style="font-weight:600; font-size:0.95rem;">Sign in with Google</span>
        </div>
        <button type="button" id="btnCloseGoogleModal" style="background:none; border:none; color:var(--text-muted); font-size:1.4rem; cursor:pointer;">&times;</button>
      </div>

      <p style="font-size:0.85rem; color:var(--text-muted); margin-bottom:16px;">
        Choose or enter your Google / Gmail account to connect to VVA Meet.
      </p>

      <form id="formGoogleAuth">
        <div class="input-row">
          <label for="googleEmail">Gmail Address</label>
          <input type="email" id="googleEmail" class="input-control" placeholder="user@gmail.com" required>
        </div>

        <div class="input-row">
          <label for="googleName">Display Name</label>
          <input type="text" id="googleName" class="input-control" placeholder="Alex Morgan" required>
        </div>

        <button type="submit" class="btn-submit" style="background:#4285F4; box-shadow:0 4px 14px rgba(66, 133, 244, 0.4);">
          Continue with Gmail
        </button>
      </form>
    </div>
  </div>

  <div id="toastContainer" class="toast-container"></div>

  <script>
    // Tab switching
    function switchTab(tabName) {
      document.querySelectorAll('.auth-tab-btn').forEach(btn => {
        btn.classList.toggle('active', btn.getAttribute('data-tab') === tabName);
      });
      document.querySelectorAll('.tab-content').forEach(content => {
        content.classList.toggle('active', content.id === 'tab-' + tabName);
      });

      const subtitle = document.getElementById('authSubtitle');
      if (tabName === 'signin') subtitle.textContent = 'Sign in to start or join encrypted conferences';
      else if (tabName === 'signup') subtitle.textContent = 'Create your account with email or Gmail';
      else if (tabName === 'join') subtitle.textContent = 'Directly enter an existing meeting with passcode';
    }

    document.querySelectorAll('.auth-tab-btn').forEach(btn => {
      btn.addEventListener('click', () => switchTab(btn.getAttribute('data-tab')));
    });

    // Password toggle
    document.querySelectorAll('.btn-toggle-pwd').forEach(btn => {
      btn.addEventListener('click', () => {
        const input = btn.previousElementSibling;
        if (input.type === 'password') {
          input.type = 'text';
          btn.style.color = '#818cf8';
        } else {
          input.type = 'password';
          btn.style.color = '';
        }
      });
    });

    // Toast Notifications
    function showToast(message, type = 'info') {
      const container = document.getElementById('toastContainer');
      const toast = document.createElement('div');
      toast.className = `toast toast-${type}`;
      toast.textContent = message;
      container.appendChild(toast);
      setTimeout(() => {
        toast.style.opacity = '0';
        toast.style.transform = 'translateX(100%)';
        setTimeout(() => toast.remove(), 300);
      }, 3500);
    }

    // Google Modal
    const googleModal = document.getElementById('googleAuthModal');
    document.querySelectorAll('.btn-google-trigger').forEach(btn => {
      btn.addEventListener('click', () => {
        googleModal.classList.add('open');
      });
    });
    document.getElementById('btnCloseGoogleModal').addEventListener('click', () => {
      googleModal.classList.remove('open');
    });

    // Google Sign-In Submit
    document.getElementById('formGoogleAuth').addEventListener('submit', async (e) => {
      e.preventDefault();
      const email = document.getElementById('googleEmail').value.trim();
      const name = document.getElementById('googleName').value.trim();

      try {
        const res = await fetch('api/auth.php?action=google', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ email, name })
        });
        const data = await res.json();
        if (data.success) {
          localStorage.setItem('meet_username', data.user.username);
          localStorage.setItem('meet_user_id', data.user.id);
          localStorage.setItem('meet_email', data.user.email);
          showToast('Signed in successfully!', 'success');
          setTimeout(() => {
            window.location.href = '<?= htmlspecialchars($redirectUrl) ?>';
          }, 600);
        } else {
          showToast(data.error || 'Google authentication failed', 'danger');
        }
      } catch (err) {
        showToast('Connection error during Google auth.', 'danger');
      }
    });

    // Sign In Form Submit
    document.getElementById('formSignIn').addEventListener('submit', async (e) => {
      e.preventDefault();
      const email = document.getElementById('signinEmail').value.trim();
      const password = document.getElementById('signinPassword').value;

      try {
        const res = await fetch('api/auth.php?action=signin', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ email, password })
        });
        const data = await res.json();
        if (data.success) {
          localStorage.setItem('meet_username', data.user.username);
          localStorage.setItem('meet_user_id', data.user.id);
          localStorage.setItem('meet_email', data.user.email);
          showToast('Signed in successfully!', 'success');
          setTimeout(() => {
            window.location.href = '<?= htmlspecialchars($redirectUrl) ?>';
          }, 600);
        } else {
          showToast(data.error || 'Invalid credentials', 'danger');
        }
      } catch (err) {
        showToast('Server connection error. Please try again.', 'danger');
      }
    });

    // Sign Up Form Submit
    document.getElementById('formSignUp').addEventListener('submit', async (e) => {
      e.preventDefault();
      const username = document.getElementById('signupName').value.trim();
      const userId = document.getElementById('signupUserId') ? document.getElementById('signupUserId').value.trim() : '';
      const email = document.getElementById('signupEmail').value.trim();
      const password = document.getElementById('signupPassword').value;

      try {
        const res = await fetch('api/auth.php?action=signup', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ username, userId, email, password })
        });
        const data = await res.json();
        if (data.success) {
          localStorage.setItem('meet_username', data.user.username);
          localStorage.setItem('meet_user_id', data.user.id);
          localStorage.setItem('meet_email', data.user.email);
          showToast('Account created successfully!', 'success');
          setTimeout(() => {
            window.location.href = '<?= htmlspecialchars($redirectUrl) ?>';
          }, 600);
        } else {
          showToast(data.error || 'Failed to register', 'danger');
        }
      } catch (err) {
        showToast('Server connection error. Please try again.', 'danger');
      }
    });

    // Direct Join with Passcode Form Submit
    document.getElementById('formDirectJoin').addEventListener('submit', (e) => {
      e.preventDefault();
      const roomId = document.getElementById('directRoomId').value.trim();
      const username = document.getElementById('directUsername').value.trim();
      const passcode = document.getElementById('directPasscode').value.trim();

      if (!roomId || !username) {
        showToast('Please enter room code and your name', 'danger');
        return;
      }

      localStorage.setItem('meet_username', username);
      if (passcode) {
        sessionStorage.setItem('meet_passcode_' + roomId, passcode);
      }

      let targetUrl = `room.php?room=${encodeURIComponent(roomId)}`;
      if (passcode) {
        targetUrl += `&passcode=${encodeURIComponent(passcode)}`;
      }
      window.location.href = targetUrl;
    });

    // Prepopulate saved name if available
    window.addEventListener('DOMContentLoaded', () => {
      const savedName = localStorage.getItem('meet_username');
      if (savedName) {
        const directUserInput = document.getElementById('directUsername');
        if (directUserInput) directUserInput.value = savedName;
      }
    });
  </script>
</body>
</html>
