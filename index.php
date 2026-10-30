<?php
/**
 * VVA Meet - Next-Gen Video Conferencing & Team Collaboration Dashboard
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
  <title>Dashboard - Build Audit</title>
  <base href="<?= htmlspecialchars($baseUrl) ?>">
  <link rel="stylesheet" href="css/main.css">
  <link rel="stylesheet" href="css/dashboard.css">
</head>

<body class="dashboard-body">
  <div class="app-layout">
    <!-- ====================================================================
         1. Left Navigation Sidebar (Fixed / Sticky)
         ==================================================================== -->
    <aside class="app-sidebar" id="appSidebar">
      <!-- Sidebar Brand Header -->
      <div class="sidebar-header">
        <a href="javascript:void(0)" onclick="window.vvaDashboard.switchTab('meet')" class="sidebar-brand" title="Build Audit Home">
          <div class="sidebar-brand-icon">
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
              <path d="M12 2.5L20.5 7.2V16.8L12 21.5L3.5 16.8V7.2L12 2.5Z" stroke="#ffffff" stroke-width="2" stroke-linejoin="round" fill="rgba(255, 255, 255, 0.12)"/>
              <path d="M12 12V21.5" stroke="#ffffff" stroke-width="1.8" stroke-linejoin="round"/>
              <path d="M20.5 7.2L12 12L3.5 7.2" stroke="#ffffff" stroke-width="1.8" stroke-linejoin="round"/>
              <path d="M8.2 12.2L11 15L16.2 8.8" stroke="#38bdf8" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"/>
            </svg>
          </div>
          <div class="sidebar-brand-name">
            <strong class="brand-build">Build</strong> <span class="brand-audit">Audit</span>
          </div>
        </a>
      </div>

      <!-- Navigation Options (Chat, Meet, People, History) -->
      <nav class="sidebar-nav" aria-label="Main Navigation">
        <!-- 1. Chat -->
        <button type="button" class="sidebar-nav-item" id="navChat" data-tab="chat" title="Chat & Direct Messages">
          <div class="nav-item-icon">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"></path>
            </svg>
            <span id="chatNavBadge" class="nav-badge-pill" style="display:none;">0</span>
          </div>
          <span class="nav-item-label">Chat</span>
        </button>

        <!-- 2. Meet (Active Default) -->
        <button type="button" class="sidebar-nav-item active" id="navMeet" data-tab="meet" title="Meetings & Video Calls">
          <div class="nav-item-icon">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
              <polygon points="23 7 16 12 23 17 23 7"></polygon>
              <rect x="1" y="5" width="15" height="14" rx="2" ry="2"></rect>
            </svg>
          </div>
          <span class="nav-item-label">Meet</span>
        </button>

        <!-- 3. People -->
        <button type="button" class="sidebar-nav-item" id="navPeople" data-tab="people" title="People & Contacts">
          <div class="nav-item-icon">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"></path>
              <circle cx="9" cy="7" r="4"></circle>
              <path d="M23 21v-2a4 4 0 0 0-3-3.87"></path>
              <path d="M16 3.13a4 4 0 0 1 0 7.75"></path>
            </svg>
          </div>
          <span class="nav-item-label">People</span>
        </button>

        <!-- 4. History -->
        <button type="button" class="sidebar-nav-item" id="navHistory" data-tab="history" title="Meeting Logs & Attendance">
          <div class="nav-item-icon">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <circle cx="12" cy="12" r="10"></circle>
              <polyline points="12 6 12 12 16 14"></polyline>
            </svg>
          </div>
          <span class="nav-item-label">History</span>
        </button>
      </nav>

      <!-- Sidebar Footer: Profile Dropdown -->
      <div class="sidebar-footer">
        <div id="profileMenuContainer" class="sidebar-profile-container">
          <div id="profileTrigger" class="sidebar-profile-card" title="Account Menu">
            <div class="sidebar-avatar-wrapper">
              <div class="sidebar-avatar">
                <?= strtoupper(substr($loggedInUser['username'], 0, 1)) ?>
              </div>
              <span class="presence-dot online" title="Online"></span>
            </div>
            <div class="sidebar-user-meta">
              <span class="sidebar-user-name"><?= htmlspecialchars($loggedInUser['username']) ?></span>
              <span class="sidebar-user-sub">Online</span>
            </div>
            <svg class="profile-caret" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
              <polyline points="6 9 12 15 18 9"></polyline>
            </svg>
          </div>

          <!-- Profile Popup Menu -->
          <div class="sidebar-profile-dropdown">
            <div class="dropdown-user-header">
              <div class="dropdown-user-name"><?= htmlspecialchars($loggedInUser['username']) ?></div>
              <div class="dropdown-user-email"><?= htmlspecialchars($loggedInUser['email'] ?: 'No email registered') ?></div>
              <span class="dropdown-user-badge">ID: <?= htmlspecialchars(substr($loggedInUser['id'], 0, 8)) ?></span>
            </div>

            <div class="dropdown-items">
              <button type="button" class="dropdown-item" onclick="window.vvaDashboard.openProfileModal()">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                  <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"></path>
                  <circle cx="12" cy="7" r="4"></circle>
                </svg>
                My Profile
              </button>

              <button type="button" class="dropdown-item" onclick="window.vvaDashboard.openPasswordModal()">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                  <rect x="3" y="11" width="18" height="11" rx="2" ry="2"></rect>
                  <path d="M7 11V7a5 5 0 0 1 10 0v4"></path>
                </svg>
                Change Password
              </button>
            </div>

            <!-- Accounts Switcher List (shown when multiple accounts are signed in) -->
            <div id="dropdownAccountsSection" class="dropdown-accounts-section" style="display: none;">
              <div class="dropdown-divider"></div>
              <div class="dropdown-section-title">Switch Account</div>
              <div id="dropdownAccountsList" class="dropdown-accounts-list"></div>
            </div>

            <div class="dropdown-divider"></div>

            <div class="dropdown-items">
              <button type="button" class="dropdown-item" id="btnAddAnotherAccount" onclick="window.vvaDashboard.openAddAccountModal()">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                  <path d="M16 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"></path>
                  <circle cx="8.5" cy="7" r="4"></circle>
                  <line x1="20" y1="8" x2="20" y2="14"></line>
                  <line x1="23" y1="11" x2="17" y2="11"></line>
                </svg>
                Add Another Account
              </button>
            </div>

            <div class="dropdown-divider"></div>

            <div class="dropdown-items">
              <a href="login.php?action=switch" class="dropdown-item danger" onclick="try{localStorage.removeItem('meet_username');localStorage.removeItem('meet_user_id');localStorage.removeItem('meet_email');sessionStorage.clear();}catch(e){}">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                  <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"></path>
                  <polyline points="16 17 21 12 16 7"></polyline>
                  <line x1="21" y1="12" x2="9" y2="12"></line>
                </svg>
                Sign Out
              </a>
            </div>
          </div>
        </div>
      </div>
    </aside>

    <!-- Overlay backdrop for mobile drawer -->
    <div id="sidebarBackdrop" class="sidebar-backdrop"></div>

    <!-- ====================================================================
         2. Main Application Content Area (Right of Sidebar)
         ==================================================================== -->
    <div class="app-main-area">
      <!-- Top Bar: Mobile Hamburger, Current Section Title, Live Clock, Quick Actions -->
      <header class="app-topbar">
        <div class="topbar-left">
          <button type="button" id="btnSidebarToggle" class="mobile-sidebar-toggle" title="Toggle Navigation Menu">
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
              <line x1="3" y1="12" x2="21" y2="12"></line>
              <line x1="3" y1="6" x2="21" y2="6"></line>
              <line x1="3" y1="18" x2="21" y2="18"></line>
            </svg>
          </button>
          <div class="topbar-title-wrap">
            <h1 id="topbarSectionTitle" class="topbar-title">Meet</h1>
            <span id="topbarSectionSub" class="topbar-sub">Manage, join, and schedule video meetings</span>
          </div>
        </div>

        <div class="topbar-center">
          <div class="header-clock-pill" title="Live System Time">
            <span class="header-clock-dot"></span>
            <span id="headerClockTime" class="header-clock-time">--:--:--</span>
            <span style="color:#94a3b8;">•</span>
            <span id="headerClockDate">---, --- --</span>
          </div>
        </div>

        <div class="topbar-right">
          <button type="button" class="btn btn-secondary btn-sm" onclick="window.vvaDashboard.openJoinModal()" title="Join meeting with Code or URL">
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
              <path d="M15 3h4a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-4"></path>
              <polyline points="10 17 15 12 10 7"></polyline>
              <line x1="15" y1="12" x2="3" y2="12"></line>
            </svg>
            Join with ID
          </button>
          <button type="button" class="btn btn-primary btn-sm" id="btnTopInstant" title="Start an instant meeting">
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
              <polygon points="23 7 16 12 23 17 23 7"></polygon>
              <rect x="1" y="5" width="15" height="14" rx="2" ry="2"></rect>
            </svg>
            New Meeting
          </button>
        </div>
      </header>

      <!-- Scrollable Main Viewport -->
      <main class="app-viewport">
        <!-- ================================================================
             SECTION 1: MEET VIEW (Main Meeting Dashboard)
             ================================================================ -->
        <section id="viewMeet" class="content-view active">
          <!-- Three Action Cards (Zoom / Google Meet Style) -->
          <div class="quick-actions-grid">
            <!-- Card 1: New Meeting (Instant) -->
            <div id="cardInstantMeeting" class="action-card card-instant" role="button" tabindex="0">
              <div class="card-top">
                <div class="card-icon-wrapper">
                  <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
                    <polygon points="23 7 16 12 23 17 23 7"></polygon>
                    <rect x="1" y="5" width="15" height="14" rx="2" ry="2"></rect>
                  </svg>
                </div>
              </div>
              <div class="card-content">
                <h3>New Meeting</h3>
                <p>Create an instant video room, copy the invitation link, and start collaborating immediately.</p>
              </div>
              <div class="card-action-hint">
                Start meeting now
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
                  <line x1="5" y1="12" x2="19" y2="12"></line>
                  <polyline points="12 5 19 12 12 19"></polyline>
                </svg>
              </div>
            </div>

            <!-- Card 2: Schedule a Meeting -->
            <div id="cardScheduleMeeting" class="action-card card-schedule" role="button" tabindex="0">
              <div class="card-top">
                <div class="card-icon-wrapper">
                  <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
                    <rect x="3" y="4" width="18" height="18" rx="2" ry="2"></rect>
                    <line x1="16" y1="2" x2="16" y2="6"></line>
                    <line x1="8" y1="2" x2="8" y2="6"></line>
                    <line x1="3" y1="10" x2="21" y2="10"></line>
                  </svg>
                </div>
              </div>
              <div class="card-content">
                <h3>Schedule</h3>
                <p>Plan a meeting for later, set a date, time, and optional agenda.</p>
              </div>
              <div class="card-action-hint">
                Schedule meeting
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
                  <line x1="5" y1="12" x2="19" y2="12"></line>
                  <polyline points="12 5 19 12 12 19"></polyline>
                </svg>
              </div>
            </div>

            <!-- Card 3: Join Meeting with ID or Link -->
            <div id="cardJoinMeeting" class="action-card card-join" role="button" tabindex="0">
              <div class="card-top">
                <div class="card-icon-wrapper">
                  <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
                    <path d="M15 3h4a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-4"></path>
                    <polyline points="10 17 15 12 10 7"></polyline>
                    <line x1="15" y1="12" x2="3" y2="12"></line>
                  </svg>
                </div>
              </div>
              <div class="card-content">
                <h3>Join Meeting</h3>
                <p>Have an invitation code or URL? Enter the meeting code or link to connect instantly.</p>
              </div>
              <div class="card-action-hint">
                Enter meeting code
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
                  <line x1="5" y1="12" x2="19" y2="12"></line>
                  <polyline points="12 5 19 12 12 19"></polyline>
                </svg>
              </div>
            </div>
          </div>

          <!-- Upcoming Scheduled Meetings Section -->
          <div class="section-container" style="margin-top: 36px;">
            <div class="section-header-row">
              <div>
                <h2 class="section-title">Upcoming Meetings</h2>
                <p class="section-sub">Scheduled calls and sessions planned for your team</p>
              </div>
              <button type="button" class="btn btn-secondary btn-sm" onclick="window.vvaDashboard.loadUpcomingMeetings()" title="Refresh upcoming meetings">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="23 4 23 10 17 10"></polyline><path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"></path></svg>
                Refresh
              </button>
            </div>

            <div id="upcomingMeetingsList" class="upcoming-meetings-grid">
              <!-- Dynamically populated via JS -->
            </div>
          </div>
        </section>

        <!-- ================================================================
             SECTION 2: CHAT VIEW (Direct 1-on-1 Messaging)
             ================================================================ -->
        <section id="viewChat" class="content-view">
          <div class="chat-module-container">
            <!-- Left Sub-Panel: Conversations List & Search -->
            <div class="chat-sidebar-panel">
              <div class="chat-sidebar-top">
                <div class="chat-search-wrapper">
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="8"></circle><line x1="21" y1="21" x2="16.65" y2="16.65"></line></svg>
                  <input type="text" id="chatSearchInput" placeholder="Search conversations..." autocomplete="off">
                </div>
                <button type="button" id="btnNewChat" class="btn btn-primary btn-sm" title="Start new conversation" onclick="window.vvaDashboard.openNewChatModal()">
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><line x1="12" y1="5" x2="12" y2="19"></line><line x1="5" y1="12" x2="19" y2="12"></line></svg>
                  <span>New Chat</span>
                </button>
              </div>

              <!-- Conversations List Scrollable -->
              <div id="chatConversationsList" class="chat-conversations-list">
                <div class="chat-loading-state">Loading conversations...</div>
              </div>
            </div>

            <!-- Right Panel: Active Chat Thread Pane -->
            <div class="chat-thread-panel">
              <!-- Header for currently active contact -->
              <div id="chatActiveHeader" class="chat-thread-header" style="display:none;">
                <div class="chat-header-user">
                  <div class="chat-header-avatar" id="chatHeaderAvatar">U</div>
                  <div class="chat-header-info">
                    <h3 id="chatHeaderName" class="chat-header-name">-</h3>
                    <span id="chatHeaderStatus" class="chat-header-status">Offline</span>
                  </div>
                </div>

                <div class="chat-header-actions">
                  <button type="button" class="btn btn-secondary btn-sm" id="btnChatInviteMeeting" title="Invite contact to instant meeting">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polygon points="23 7 16 12 23 17 23 7"></polygon><rect x="1" y="5" width="15" height="14" rx="2" ry="2"></rect></svg>
                    Start Video Call
                  </button>
                </div>
              </div>

              <!-- Message History Scroll Container -->
              <div id="chatMessagesBody" class="chat-messages-body">
                <div class="chat-empty-selection">
                  <div class="empty-icon-circle">
                    <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"></path></svg>
                  </div>
                  <h3>Select a conversation</h3>
                  <p>Choose an existing chat from the left panel or start a new message with any team member.</p>
                  <button type="button" class="btn btn-primary btn-sm" onclick="window.vvaDashboard.openNewChatModal()">Start New Chat</button>
                </div>
              </div>

              <!-- Message Composer (Hidden when no chat active) -->
              <form id="chatComposerForm" class="chat-composer-box" style="display:none;">
                <input type="text" id="chatComposerInput" class="chat-composer-input" placeholder="Type a message... (Press Enter to send)" autocomplete="off">
                <button type="submit" id="btnSendDirectMessage" class="btn btn-primary chat-send-btn" title="Send message">
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><line x1="22" y1="2" x2="11" y2="13"></line><polygon points="22 2 15 22 11 13 2 9 22 2"></polygon></svg>
                  Send
                </button>
              </form>
            </div>
          </div>
        </section>

        <!-- ================================================================
             SECTION 3: PEOPLE VIEW (Contacts & Presence Directory)
             ================================================================ -->
        <section id="viewPeople" class="content-view">
          <div class="section-container">
            <div class="contacts-toolbar">
              <div class="contacts-search-box">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="8"></circle><line x1="21" y1="21" x2="16.65" y2="16.65"></line></svg>
                <input type="text" id="contactsSearchInput" placeholder="Search contacts by name or email..." autocomplete="off">
              </div>

              <div class="contacts-filter-tabs">
                <button type="button" class="filter-tab-btn active" id="tabFilterAllContacts" data-filter="all">
                  All Contacts <span id="countAllContacts" class="tab-badge-pill">0</span>
                </button>
                <button type="button" class="filter-tab-btn" id="tabFilterActiveContacts" data-filter="active">
                  Active Now <span id="countActiveContacts" class="tab-badge-pill green">0</span>
                </button>
              </div>
            </div>

            <!-- Contacts Cards Grid -->
            <div id="contactsGrid" class="contacts-grid">
              <div class="contacts-loading">Loading contacts...</div>
            </div>
          </div>
        </section>

        <!-- ================================================================
             SECTION 4: HISTORY VIEW (Meeting Logs & Attendance)
             ================================================================ -->
        <section id="viewHistory" class="content-view">
          <div class="section-container">
            <div class="history-toolbar-card">
              <div class="history-search-wrapper">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="8"></circle><line x1="21" y1="21" x2="16.65" y2="16.65"></line></svg>
                <input type="text" id="historySearchInput" placeholder="Search by meeting title, ID, or host..." autocomplete="off">
              </div>

              <div class="history-filters-group">
                <select id="historyDateFilter" class="form-control filter-select">
                  <option value="all">All Dates</option>
                  <option value="today">Today</option>
                  <option value="week">Past 7 Days</option>
                  <option value="month">Past 30 Days</option>
                </select>

                <select id="historyStatusFilter" class="form-control filter-select">
                  <option value="all">All Statuses</option>
                  <option value="completed">Completed</option>
                  <option value="active">Active Now</option>
                  <option value="scheduled">Scheduled</option>
                  <option value="cancelled">Cancelled</option>
                </select>

                <button type="button" id="btnExportCsv" class="btn btn-secondary" title="Export meeting logs as CSV spreadsheet">
                  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path><polyline points="7 10 12 15 17 10"></polyline><line x1="12" y1="15" x2="12" y2="3"></line></svg>
                  Export CSV
                </button>

                <button type="button" id="btnClearHistory" class="btn btn-secondary" title="Clear cancelled and past meetings" onclick="window.vvaDashboard.clearHistory()" style="color:#ef4444; border-color:#fecaca;">
                  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path></svg>
                  Clear History
                </button>
              </div>
            </div>

            <!-- History Table -->
            <div class="history-table-wrapper">
              <table class="history-table">
                <thead>
                  <tr>
                    <th>Meeting Details</th>
                    <th>Host</th>
                    <th>Date & Time</th>
                    <th>Duration</th>
                    <th>Attendees</th>
                    <th>Status</th>
                    <th style="text-align:right;">Actions</th>
                  </tr>
                </thead>
                <tbody id="historyTableBody">
                  <tr>
                    <td colspan="7" style="text-align:center; padding:32px; color:#64748b;">
                      Loading meeting records...
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>

            <!-- History Pagination -->
            <div id="historyPagination" class="history-pagination-footer">
              <div id="historyPaginationInfo" class="pagination-info">Showing 0 meetings</div>
              <div class="pagination-buttons">
                <button type="button" id="btnHistoryPrevPage" class="btn btn-secondary btn-sm" disabled>Previous</button>
                <button type="button" id="btnHistoryNextPage" class="btn btn-secondary btn-sm" disabled>Next</button>
              </div>
            </div>
          </div>
        </section>
      </main>
    </div>
  </div>

  <!-- ====================================================================
       3. Global Modals System
       ==================================================================== -->

  <!-- Modal 1: Instant Meeting Setup -->
  <div id="instantMeetingModal" class="modal-overlay">
    <div class="modal-dialog">
      <div class="modal-header">
        <div class="modal-title-group">
          <div class="modal-icon-badge" style="background: linear-gradient(135deg, #f97316, #ef4444);">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
              <polygon points="23 7 16 12 23 17 23 7"></polygon>
              <rect x="1" y="5" width="15" height="14" rx="2" ry="2"></rect>
            </svg>
          </div>
          <div>
            <h3 class="modal-title">Start Instant Meeting</h3>
            <span class="modal-subtitle">Enter meeting topic and share your invite link.</span>
          </div>
        </div>
        <button type="button" class="modal-close-btn" data-close-modal title="Close">✕</button>
      </div>

      <div class="modal-body">
        <!-- Meeting Topic / Name Input -->
        <div class="form-group" style="margin-bottom:16px;">
          <label for="instantTopicInput" class="share-link-header" style="display:flex; align-items:center; gap:6px; margin-bottom:8px;">
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" style="color:#4f46e5;">
              <path d="M12 20h9"></path>
              <path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"></path>
            </svg>
            Meeting Topic / Name
          </label>
          <input type="text" id="instantTopicInput" class="form-control" placeholder="e.g. Design Review, Sprint Planning, Quick Sync" maxlength="100" autocomplete="off" style="font-size:0.92rem; padding:10px 14px; border:1px solid #cbd5e1; border-radius:10px; background:#fff;">
        </div>

        <p style="color:#64748b; font-size:0.85rem; margin-bottom:12px;">
          Share this link with participants. The meeting will launch when you click <strong>Start Meeting Now</strong>.
        </p>

        <!-- Shareable Invite Link -->
        <div class="share-link-box">
          <div class="share-link-header">Shareable Meeting Invite Link</div>
          <div class="share-link-input-group">
            <div id="instantMeetingUrlText" class="share-link-text">https://...</div>
            <button type="button" id="btnCopyInstantLink" class="btn btn-secondary" style="padding:9px 16px; font-size:0.84rem;">
              Copy Link
            </button>
          </div>
        </div>

        <!-- Meeting ID Row -->
        <div style="background:#f8fafc; border:1px solid #e2e8f0; border-radius:12px; padding:12px 16px; display:flex; justify-content:space-between; align-items:center; margin-top:12px;">
          <div style="display:flex; align-items:center; gap:8px;">
            <span class="share-link-header" style="margin:0;">Meeting ID:</span>
            <span id="instantMeetingIdText" style="color:#4f46e5; font-family:var(--font-mono, monospace); font-size:0.85rem; font-weight:600;">-</span>
          </div>
          <button type="button" id="btnCopyInstantId" class="btn btn-secondary btn-sm" style="padding:6px 14px; font-size:0.84rem;">
            Copy ID
          </button>
        </div>
      </div>

      <div class="modal-footer">
        <button type="button" class="btn btn-secondary" data-close-modal>Close</button>
        <button type="button" id="btnStartInstantMeeting" class="btn btn-primary" style="display:inline-flex; align-items:center; gap:8px;">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
            <polygon points="5 3 19 12 5 21 5 3"></polygon>
          </svg>
          Start Meeting Now
        </button>
      </div>
    </div>
  </div>

  <!-- Modal 2: Schedule a Meeting -->
  <div id="scheduleMeetingModal" class="modal-overlay">
    <div class="modal-dialog">
      <div class="modal-header">
        <div class="modal-title-group">
          <div class="modal-icon-badge" style="background: linear-gradient(135deg, #0ea5e9, #3b82f6);">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
              <rect x="3" y="4" width="18" height="18" rx="2" ry="2"></rect>
              <line x1="16" y1="2" x2="16" y2="6"></line>
              <line x1="8" y1="2" x2="8" y2="6"></line>
              <line x1="3" y1="10" x2="21" y2="10"></line>
            </svg>
          </div>
          <div>
            <h3 class="modal-title">Schedule a Meeting</h3>
            <span class="modal-subtitle">Plan a future session and send invites</span>
          </div>
        </div>
        <button type="button" class="modal-close-btn" data-close-modal title="Close">✕</button>
      </div>

      <form id="scheduleMeetingForm">
        <div class="modal-body">
          <div class="form-group">
            <label class="form-label" for="schedTitleInput">Meeting Title *</label>
            <input type="text" id="schedTitleInput" class="form-control" placeholder="e.g. Weekly Product Sync" required maxlength="100">
          </div>

          <div class="form-row-2">
            <div class="form-group">
              <label class="form-label" for="schedDateInput">Date *</label>
              <input type="date" id="schedDateInput" class="form-control" required>
            </div>
            <div class="form-group">
              <label class="form-label" for="schedStartTimeInput">Start Time *</label>
              <input type="time" id="schedStartTimeInput" class="form-control" required>
            </div>
          </div>

          <div class="form-group">
            <label class="form-label" for="schedDurationSelect">Estimated Duration</label>
            <select id="schedDurationSelect" class="form-control">
              <option value="15">15 minutes</option>
              <option value="30" selected>30 minutes</option>
              <option value="45">45 minutes</option>
              <option value="60">1 hour</option>
              <option value="90">1.5 hours</option>
              <option value="120">2 hours</option>
              <option value="unlimited">Unlimited (No time limit)</option>
            </select>
            <span style="font-size:0.75rem; color:#64748b; margin-top:6px; display:block;">
              Select Unlimited to allow this meeting to run continuously without any application-imposed cutoff or time limit.
            </span>
          </div>

          <div class="form-group">
            <label class="form-label" for="schedDescInput">Description <span class="optional">(Optional agenda)</span></label>
            <textarea id="schedDescInput" class="form-control" placeholder="Add meeting topics, agenda, or notes..."></textarea>
          </div>

        </div>

        <div class="modal-footer">
          <button type="button" class="btn btn-secondary" data-close-modal>Cancel</button>
          <button type="submit" class="btn btn-primary">Schedule Meeting</button>
        </div>
      </form>
    </div>
  </div>

  <!-- Modal 3: Join Meeting with ID & Security Passcode -->
  <div id="joinMeetingModal" class="modal-overlay">
    <div class="modal-dialog">
      <div class="modal-header">
        <div class="modal-title-group">
          <div class="modal-icon-badge" style="background: linear-gradient(135deg, #8b5cf6, #6366f1);">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
              <path d="M15 3h4a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-4"></path>
              <polyline points="10 17 15 12 10 7"></polyline>
              <line x1="15" y1="12" x2="3" y2="12"></line>
            </svg>
          </div>
          <div>
            <h3 class="modal-title">Join a Meeting</h3>
            <span class="modal-subtitle">Enter meeting code or paste invite URL</span>
          </div>
        </div>
        <button type="button" class="modal-close-btn" data-close-modal title="Close">✕</button>
      </div>

      <form id="joinMeetingForm">
        <div class="modal-body">
          <div class="form-group">
            <label class="form-label" for="joinMeetingInput">Meeting ID or Invitation URL *</label>
            <input type="text" id="joinMeetingInput" class="form-control" placeholder="e.g. meet-sync-428 or https://meet.../room.php?room=..." required autocomplete="off">
            <span style="font-size:0.75rem; color:#64748b; margin-top:6px; display:block;">
              You can paste a full meeting invite link or just the meeting code.
            </span>
          </div>
        </div>

        <div class="modal-footer">
          <button type="button" class="btn btn-secondary" data-close-modal>Cancel</button>
          <button type="submit" class="btn btn-primary">Join Meeting</button>
        </div>
      </form>
    </div>
  </div>

  <!-- Modal 4: Edit Meeting (Host only) -->
  <div id="editMeetingModal" class="modal-overlay">
    <div class="modal-dialog">
      <div class="modal-header">
        <div class="modal-title-group">
          <div class="modal-icon-badge" style="background: rgba(99, 102, 241, 0.2); color:#818cf8;">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path>
              <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path>
            </svg>
          </div>
          <div>
            <h3 class="modal-title">Edit Meeting</h3>
            <span class="modal-subtitle">Update schedule details</span>
          </div>
        </div>
        <button type="button" class="modal-close-btn" data-close-modal title="Close">✕</button>
      </div>

      <form id="editMeetingForm">
        <input type="hidden" id="editRoomIdHidden">
        <div class="modal-body">
          <div class="form-group">
            <label class="form-label" for="editTitleInput">Meeting Title *</label>
            <input type="text" id="editTitleInput" class="form-control" required>
          </div>

          <div class="form-row-2">
            <div class="form-group">
              <label class="form-label" for="editDateInput">Date</label>
              <input type="date" id="editDateInput" class="form-control">
            </div>
            <div class="form-group">
              <label class="form-label" for="editStartTimeInput">Start Time</label>
              <input type="time" id="editStartTimeInput" class="form-control">
            </div>
          </div>

          <div class="form-group">
            <label class="form-label" for="editDurationSelect">Estimated Duration</label>
            <select id="editDurationSelect" class="form-control">
              <option value="15">15 minutes</option>
              <option value="30">30 minutes</option>
              <option value="45">45 minutes</option>
              <option value="60">1 hour</option>
              <option value="90">1.5 hours</option>
              <option value="120">2 hours</option>
              <option value="unlimited">Unlimited (No time limit)</option>
            </select>
          </div>

          <div class="form-group">
            <label class="form-label" for="editDescInput">Description</label>
            <textarea id="editDescInput" class="form-control"></textarea>
          </div>
        </div>

        <div class="modal-footer">
          <button type="button" class="btn btn-secondary" data-close-modal>Cancel</button>
          <button type="submit" class="btn btn-primary">Save Changes</button>
        </div>
      </form>
    </div>
  </div>

  <!-- Modal 5: Meeting Details & Attendee Roster -->
  <div id="meetingDetailsModal" class="modal-overlay">
    <div class="modal-dialog modal-large">
      <div class="modal-header">
        <div class="modal-title-group">
          <div class="modal-icon-badge" style="background: rgba(16, 185, 129, 0.2); color:#34d399;">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <circle cx="12" cy="12" r="10"></circle>
              <line x1="12" y1="16" x2="12" y2="12"></line>
              <line x1="12" y1="8" x2="12.01" y2="8"></line>
            </svg>
          </div>
          <div>
            <h3 id="detailTitle" class="modal-title">Meeting Details</h3>
            <span class="modal-subtitle">Persistent session breakdown and attendee roster</span>
          </div>
        </div>
        <button type="button" class="modal-close-btn" data-close-modal title="Close">✕</button>
      </div>

      <div class="modal-body">
        <div class="detail-grid">
          <div class="detail-item">
            <div class="detail-label">Meeting ID</div>
            <div id="detailRoomId" class="detail-value" style="font-family:var(--font-mono);">-</div>
          </div>
          <div class="detail-item">
            <div class="detail-label">Host</div>
            <div id="detailHost" class="detail-value">-</div>
          </div>
          <div class="detail-item">
            <div class="detail-label">Status</div>
            <div id="detailStatus" class="detail-value">-</div>
          </div>
          <div class="detail-item">
            <div class="detail-label">Total Messages</div>
            <div id="detailMessages" class="detail-value">0</div>
          </div>
          <div class="detail-item">
            <div class="detail-label">Created At</div>
            <div id="detailCreated" class="detail-value">-</div>
          </div>
          <div class="detail-item">
            <div class="detail-label">Total Duration</div>
            <div id="detailDuration" class="detail-value">-</div>
          </div>
          <div class="detail-item">
            <div class="detail-label">Started At</div>
            <div id="detailStart" class="detail-value">-</div>
          </div>
          <div class="detail-item">
            <div class="detail-label">Ended At</div>
            <div id="detailEnd" class="detail-value">-</div>
          </div>
        </div>

        <div class="share-link-box">
          <div class="share-link-header">Invite Link</div>
          <div class="share-link-input-group">
            <input type="text" id="detailJoinLink" class="share-link-text" readonly>
            <button type="button" id="btnCopyDetailLink" class="btn btn-secondary" style="padding:9px 16px;">
              Copy
            </button>
          </div>
        </div>

        <h4 style="font-size:1rem; font-weight:700; color:#0f172a; margin-bottom:12px; margin-top:20px;">
          Attendance Roster (Session Participants)
        </h4>
        <div class="history-table-wrapper" style="max-height: 220px; overflow-y:auto;">
          <table class="history-table">
            <thead>
              <tr>
                <th>Participant</th>
                <th>Email</th>
                <th>Joined</th>
                <th>Left</th>
                <th>Duration</th>
              </tr>
            </thead>
            <tbody id="detailAttendeesBody">
              <tr>
                <td colspan="5" style="text-align:center; padding:18px; color:#64748b;">
                  Loading roster...
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      <div class="modal-footer">
        <button type="button" class="btn btn-secondary" data-close-modal>Close</button>
      </div>
    </div>
  </div>

  <!-- Modal 6: Edit Profile -->
  <div id="profileModal" class="modal-overlay">
    <div class="modal-dialog">
      <div class="modal-header">
        <div class="modal-title-group">
          <div class="modal-icon-badge" style="background: rgba(99, 102, 241, 0.2); color:#818cf8;">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"></path>
              <circle cx="12" cy="7" r="4"></circle>
            </svg>
          </div>
          <div>
            <h3 class="modal-title">My Profile</h3>
            <span class="modal-subtitle">Update display name & account details</span>
          </div>
        </div>
        <button type="button" class="modal-close-btn" data-close-modal title="Close">✕</button>
      </div>

      <form id="editProfileForm">
        <div class="modal-body">
          <div class="form-group">
            <label class="form-label" for="profileUsernameInput">Display Name *</label>
            <input type="text" id="profileUsernameInput" class="form-control" value="<?= htmlspecialchars($loggedInUser['username']) ?>" required maxlength="50">
          </div>

          <div class="form-group">
            <label class="form-label" for="profileEmailDisplay">Registered Email</label>
            <input type="text" id="profileEmailDisplay" class="form-control" value="<?= htmlspecialchars($loggedInUser['email'] ?: 'No email registered') ?>" readonly style="opacity:0.6; cursor:not-allowed;">
          </div>

          <div class="form-group">
            <label class="form-label" for="profileAvatarInput">Avatar Image URL <span class="optional">(Optional)</span></label>
            <input type="url" id="profileAvatarInput" class="form-control" placeholder="https://example.com/avatar.jpg">
          </div>
        </div>

        <div class="modal-footer">
          <button type="button" class="btn btn-secondary" data-close-modal>Cancel</button>
          <button type="submit" class="btn btn-primary">Save Profile</button>
        </div>
      </form>
    </div>
  </div>

  <!-- Modal 7: Change Password -->
  <div id="changePasswordModal" class="modal-overlay">
    <div class="modal-dialog">
      <div class="modal-header">
        <div class="modal-title-group">
          <div class="modal-icon-badge" style="background: rgba(245, 158, 11, 0.2); color:#f59e0b;">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <rect x="3" y="11" width="18" height="11" rx="2" ry="2"></rect>
              <path d="M7 11V7a5 5 0 0 1 10 0v4"></path>
            </svg>
          </div>
          <div>
            <h3 class="modal-title">Change Password</h3>
            <span class="modal-subtitle">Secure your Build Audit account</span>
          </div>
        </div>
        <button type="button" class="modal-close-btn" data-close-modal title="Close">✕</button>
      </div>

      <form id="changePasswordForm">
        <div class="modal-body">
          <div class="form-group">
            <label class="form-label" for="pwdCurrentInput">Current Password</label>
            <input type="password" id="pwdCurrentInput" class="form-control" placeholder="Enter current password" autocomplete="current-password">
          </div>

          <div class="form-group">
            <label class="form-label" for="pwdNewInput">New Password *</label>
            <input type="password" id="pwdNewInput" class="form-control" placeholder="At least 6 characters" required minlength="6" autocomplete="new-password">
          </div>

          <div class="form-group">
            <label class="form-label" for="pwdConfirmInput">Confirm New Password *</label>
            <input type="password" id="pwdConfirmInput" class="form-control" placeholder="Re-enter new password" required minlength="6" autocomplete="new-password">
          </div>
        </div>

        <div class="modal-footer">
          <button type="button" class="btn btn-secondary" data-close-modal>Cancel</button>
          <button type="submit" class="btn btn-primary">Update Password</button>
        </div>
      </form>
    </div>
  </div>

  <!-- Modal 8: New Chat User Picker -->
  <div id="newChatModal" class="modal-overlay">
    <div class="modal-dialog">
      <div class="modal-header">
        <div class="modal-title-group">
          <div class="modal-icon-badge" style="background: linear-gradient(135deg, #4f46e5, #7c3aed);">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"></path>
            </svg>
          </div>
          <div>
            <h3 class="modal-title">Start a Conversation</h3>
            <span class="modal-subtitle">Pick a contact to send a direct message</span>
          </div>
        </div>
        <button type="button" class="modal-close-btn" data-close-modal title="Close">✕</button>
      </div>

      <div class="modal-body">
        <div class="chat-search-wrapper" style="margin-bottom: 16px;">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="8"></circle><line x1="21" y1="21" x2="16.65" y2="16.65"></line></svg>
          <input type="text" id="newChatSearchInput" placeholder="Search contacts..." autocomplete="off">
        </div>

        <div id="newChatUsersList" class="new-chat-users-list" style="max-height: 280px; overflow-y: auto;">
          <div class="contacts-loading">Loading contacts...</div>
        </div>
      </div>

      <div class="modal-footer">
        <button type="button" class="btn btn-secondary" data-close-modal>Cancel</button>
      </div>
    </div>
  </div>

  <!-- Modal 9: Add Another Account -->
  <div id="addAccountModal" class="modal-overlay">
    <div class="modal-dialog">
      <div class="modal-header">
        <div class="modal-title-group">
          <div class="modal-icon-badge" style="background: rgba(99, 102, 241, 0.15); color: #4f46e5;">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M16 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"></path>
              <circle cx="8.5" cy="7" r="4"></circle>
              <line x1="20" y1="8" x2="20" y2="14"></line>
              <line x1="23" y1="11" x2="17" y2="11"></line>
            </svg>
          </div>
          <div>
            <h3 class="modal-title">Add Another Account</h3>
            <span class="modal-subtitle">Sign in to switch between accounts without logging out</span>
          </div>
        </div>
        <button type="button" class="modal-close-btn" data-close-modal title="Close">✕</button>
      </div>

      <form id="addAccountForm">
        <div class="modal-body">
          <div id="addAccountAlert" class="alert-banner error" style="display: none; margin-bottom: 14px; padding: 10px 14px; border-radius: 8px; font-size: 0.85rem; background: #fef2f2; border: 1px solid #fecaca; color: #dc2626; align-items: center; gap: 8px;">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"></circle><line x1="12" y1="8" x2="12" y2="12"></line><line x1="12" y1="16" x2="12.01" y2="16"></line></svg>
            <span id="addAccountAlertText"></span>
          </div>

          <div class="form-group">
            <label class="form-label" for="addAccountEmail">Email or Username *</label>
            <input type="text" id="addAccountEmail" class="form-control" placeholder="e.g. navdeep@gmail.com" required autocomplete="username">
          </div>

          <div class="form-group">
            <label class="form-label" for="addAccountPassword">Password *</label>
            <div class="password-input-wrapper" style="position: relative;">
              <input type="password" id="addAccountPassword" class="form-control" placeholder="Enter account password" required autocomplete="current-password" style="padding-right: 42px;">
              <button type="button" id="toggleAddAccountPassword" class="btn-toggle-pwd" style="position: absolute; right: 10px; top: 50%; transform: translateY(-50%); background: none; border: none; cursor: pointer; color: #64748b; padding: 4px; display: flex; align-items: center; justify-content: center;" title="Show/Hide Password">
                <svg id="addAccountEyeIcon" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                  <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"></path>
                  <circle cx="12" cy="12" r="3"></circle>
                </svg>
              </button>
            </div>
          </div>

          <div style="font-size: 0.78rem; color: #64748b; display: flex; align-items: center; gap: 6px; margin-top: 8px; line-height: 1.4;">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#10b981" stroke-width="2" style="flex-shrink: 0;"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"></rect><path d="M7 11V7a5 5 0 0 1 10 0v4"></path></svg>
            <span>Credentials are authenticated securely via server session tokens. Passwords are never saved in browser storage.</span>
          </div>
        </div>

        <div class="modal-footer">
          <button type="button" class="btn btn-secondary" data-close-modal>Cancel</button>
          <button type="submit" id="btnAddAccountSubmit" class="btn btn-primary" style="display: inline-flex; align-items: center; gap: 8px;">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M16 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"></path>
              <circle cx="8.5" cy="7" r="4"></circle>
              <line x1="20" y1="8" x2="20" y2="14"></line>
              <line x1="23" y1="11" x2="17" y2="11"></line>
            </svg>
            <span class="btn-text">Sign In & Add Account</span>
          </button>
        </div>
      </form>
    </div>
  </div>

  <!-- Floating Toast Shelf -->
  <div id="toastShelf" class="toast-shelf"></div>

  <!-- Client Script Initialization -->
  <script>
    window.LOGGED_IN_USER = <?= json_encode($loggedInUser) ?>;
  </script>
  <script src="js/dashboard.js"></script>
</body>

</html>
