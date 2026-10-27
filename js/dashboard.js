/**
 * VVA Meet - Unified Application Dashboard & SPA Router
 * Handles Left Sidebar Navigation (Meet, Chat, People, History),
 * Direct 1-on-1 Messaging, Team Presence & Contacts Directory,
 * Instant Meetings, Scheduling, PIN Verification, Roster & History Logging.
 */

(function () {
  'use strict';

  // ------------------------------------------------------------------------
  // Application State
  // ------------------------------------------------------------------------
  const state = {
    user: window.LOGGED_IN_USER || null,
    accounts: [],
    activeTab: 'meet',
    currentInstantMeeting: null,
    instantPinDebounceTimer: null,

    // Chat State
    conversations: [],
    activeContact: null,
    messages: [],
    chatSearchQuery: '',
    allContactsForModal: [],

    // People State
    contacts: [],
    contactsFilter: 'all', // 'all' | 'active'
    contactsSearchQuery: '',

    // Meet State
    upcomingMeetings: [],

    // History State
    historyMeetings: [],
    historyTotal: 0,
    historyPage: 1,
    historyPerPage: 10,
    historyTotalPages: 1,
    historySearchDebounce: null,
    filters: {
      search: '',
      status: 'all',
      date: 'all',
      myMeetings: false
    }
  };

  // Base URL Resolver
  const baseUrlEl = document.querySelector('base');
  const baseUrl = baseUrlEl ? baseUrlEl.getAttribute('href') : '/';

  function apiUrl(endpoint) {
    const cleanBase = baseUrl.endsWith('/') ? baseUrl : baseUrl + '/';
    return cleanBase + endpoint.replace(/^\//, '');
  }

  // ------------------------------------------------------------------------
  // 1. Toast Notification System
  // ------------------------------------------------------------------------
  function showToast(message, type = 'info', duration = 3500) {
    let shelf = document.getElementById('toastShelf');
    if (!shelf) {
      shelf = document.createElement('div');
      shelf.id = 'toastShelf';
      shelf.className = 'toast-shelf';
      document.body.appendChild(shelf);
    }

    const toast = document.createElement('div');
    toast.className = `toast-message toast-${type}`;

    let iconSvg = '';
    if (type === 'success') {
      iconSvg = `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="20 6 9 17 4 12"></polyline></svg>`;
    } else if (type === 'error') {
      iconSvg = `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><circle cx="12" cy="12" r="10"></circle><line x1="15" y1="9" x2="9" y2="15"></line><line x1="9" y1="9" x2="15" y2="15"></line></svg>`;
    } else {
      iconSvg = `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><circle cx="12" cy="12" r="10"></circle><line x1="12" y1="16" x2="12" y2="12"></line><line x1="12" y1="8" x2="12.01" y2="8"></line></svg>`;
    }

    toast.innerHTML = `${iconSvg}<span>${escapeHtml(message)}</span>`;
    shelf.appendChild(toast);

    setTimeout(() => {
      toast.style.opacity = '0';
      toast.style.transform = 'translateY(10px) scale(0.95)';
      toast.style.transition = 'all 0.25s ease';
      setTimeout(() => toast.remove(), 250);
    }, duration);
  }

  function escapeHtml(str) {
    if (!str) return '';
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }

  function copyToClipboard(text, successMessage = 'Link copied to clipboard!') {
    // If the text is a local meeting link and we have a server network IP or active tunnel, resolve it for other devices
    let shareText = text;
    if (typeof shareText === 'string' && (shareText.startsWith('http://localhost') || shareText.startsWith('http://127.0.0.1'))) {
      if (window.SERVER_TUNNEL_URL) {
        shareText = shareText.replace(/^(https?:\/\/)(localhost|127\.0\.0\.1)(:\d+)?/i, window.SERVER_TUNNEL_URL.replace(/\/$/, ''));
      } else if (window.SERVER_NETWORK_IP) {
        shareText = shareText.replace(/^(https?:\/\/)(localhost|127\.0\.0\.1)(:\d+)?/i, `$1${window.SERVER_NETWORK_IP}`);
      }
    }

    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(shareText).then(() => {
        showToast(successMessage, 'success');
      }).catch(() => fallbackCopy(shareText, successMessage));
    } else {
      fallbackCopy(shareText, successMessage);
    }
  }

  // Resolve meeting URLs to reachable LAN IP or public tunnel if opened on localhost
  function getShareableMeetingUrl(pathOrUrl) {
    if (!pathOrUrl) return '';
    let url = pathOrUrl;
    if (!url.startsWith('http://') && !url.startsWith('https://')) {
      url = window.location.origin + apiUrl(url);
    }
    const isLocal = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1';
    if (isLocal) {
      if (window.SERVER_TUNNEL_URL) {
        url = url.replace(/^(https?:\/\/)(localhost|127\.0\.0\.1)(:\d+)?/i, window.SERVER_TUNNEL_URL.replace(/\/$/, ''));
      } else if (window.SERVER_NETWORK_IP) {
        url = url.replace(/^(https?:\/\/)(localhost|127\.0\.0\.1)(:\d+)?/i, `$1${window.SERVER_NETWORK_IP}`);
      }
    }
    return url;
  }

  function fallbackCopy(text, successMessage) {
    const input = document.createElement('input');
    input.value = text;
    document.body.appendChild(input);
    input.select();
    try {
      document.execCommand('copy');
      showToast(successMessage, 'success');
    } catch (e) {
      showToast('Could not copy automatically. Please copy manually.', 'error');
    }
    document.body.removeChild(input);
  }

  // ------------------------------------------------------------------------
  // 2. Real-Time Digital Clock
  // ------------------------------------------------------------------------
  function initClock() {
    const timeEl = document.getElementById('headerClockTime');
    const dateEl = document.getElementById('headerClockDate');
    if (!timeEl) return;

    function update() {
      const now = new Date();
      timeEl.textContent = now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
      if (dateEl) {
        dateEl.textContent = now.toLocaleDateString([], { weekday: 'short', month: 'short', day: 'numeric' });
      }
    }

    update();
    setInterval(update, 1000);
  }

  // ------------------------------------------------------------------------
  // 3. User Profile Dropdown & Modals
  // ------------------------------------------------------------------------
  function initProfileDropdown() {
    const container = document.getElementById('profileMenuContainer');
    const trigger = document.getElementById('profileTrigger');
    if (!container || !trigger) return;

    trigger.addEventListener('click', (e) => {
      e.stopPropagation();
      container.classList.toggle('open');
    });

    document.addEventListener('click', (e) => {
      if (!container.contains(e.target)) {
        container.classList.remove('open');
      }
    });

    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') {
        container.classList.remove('open');
      }
    });
  }

  // ------------------------------------------------------------------------
  // 3b. Multi-Account Management & Switcher
  // ------------------------------------------------------------------------
  async function loadAuthenticatedAccounts() {
    try {
      const res = await fetch(apiUrl('api/auth.php?action=list_accounts'));
      const data = await res.json();
      if (data.success && Array.isArray(data.accounts)) {
        state.accounts = data.accounts;
        renderAccountsDropdown();
      }
    } catch (err) {
      console.warn('Could not load accounts list:', err);
    }
  }

  function renderAccountsDropdown() {
    const section = document.getElementById('dropdownAccountsSection');
    const list = document.getElementById('dropdownAccountsList');
    if (!section || !list) return;

    if (!state.accounts || state.accounts.length <= 1) {
      section.style.display = 'none';
      list.innerHTML = '';
      return;
    }

    section.style.display = 'block';
    list.innerHTML = '';

    state.accounts.forEach(acc => {
      const initial = (acc.username || 'U').charAt(0).toUpperCase();
      const isActive = Boolean(acc.isActive || (state.user && acc.id === state.user.id));

      const item = document.createElement('button');
      item.type = 'button';
      item.className = 'account-switch-item' + (isActive ? ' active' : '');
      item.title = isActive ? `Active Account: ${acc.username}` : `Switch to ${acc.username}`;

      item.innerHTML = `
        <div class="account-item-avatar">${escapeHtml(initial)}</div>
        <div class="account-item-info">
          <div class="account-item-name">${escapeHtml(acc.username)}</div>
          <div class="account-item-email">${escapeHtml(acc.email || 'No email')}</div>
        </div>
        ${isActive ? `
          <span class="account-active-check" title="Active Account">
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
              <polyline points="20 6 9 17 4 12"></polyline>
            </svg>
          </span>
        ` : ''}
      `;

      if (!isActive) {
        item.addEventListener('click', (e) => {
          e.stopPropagation();
          switchAccount(acc.id);
        });
      }

      list.appendChild(item);
    });
  }

  function openAddAccountModal() {
    const container = document.getElementById('profileMenuContainer');
    if (container) container.classList.remove('open');

    const form = document.getElementById('addAccountForm');
    if (form) form.reset();

    const alertEl = document.getElementById('addAccountAlert');
    if (alertEl) alertEl.style.display = 'none';

    const submitBtn = document.getElementById('btnAddAccountSubmit');
    if (submitBtn) {
      submitBtn.disabled = false;
      const textSpan = submitBtn.querySelector('.btn-text');
      if (textSpan) textSpan.textContent = 'Sign In & Add Account';
    }

    openModal('addAccountModal');
  }

  function initAddAccountForm() {
    const togglePwd = document.getElementById('toggleAddAccountPassword');
    const pwdInput = document.getElementById('addAccountPassword');
    const eyeIcon = document.getElementById('addAccountEyeIcon');

    if (togglePwd && pwdInput) {
      togglePwd.addEventListener('click', () => {
        const isPassword = pwdInput.type === 'password';
        pwdInput.type = isPassword ? 'text' : 'password';
        if (eyeIcon) {
          eyeIcon.innerHTML = isPassword
            ? '<path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"></path><line x1="1" y1="1" x2="23" y2="23"></line>'
            : '<path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"></path><circle cx="12" cy="12" r="3"></circle>';
        }
      });
    }

    const form = document.getElementById('addAccountForm');
    if (!form) return;

    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      const email = (document.getElementById('addAccountEmail')?.value || '').trim();
      const password = (document.getElementById('addAccountPassword')?.value || '');
      const alertEl = document.getElementById('addAccountAlert');
      const alertText = document.getElementById('addAccountAlertText');
      const submitBtn = document.getElementById('btnAddAccountSubmit');
      const textSpan = submitBtn ? submitBtn.querySelector('.btn-text') : null;

      if (!email || !password) {
        if (alertEl && alertText) {
          alertText.textContent = 'Please provide both email/username and password.';
          alertEl.style.display = 'flex';
        }
        return;
      }

      if (alertEl) alertEl.style.display = 'none';
      if (submitBtn) {
        submitBtn.disabled = true;
        if (textSpan) textSpan.textContent = 'Authenticating...';
      }

      try {
        const res = await fetch(apiUrl('api/auth.php?action=add_account'), {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ email, password })
        });
        const data = await res.json();

        if (res.ok && data.success) {
          closeModal('addAccountModal');
          form.reset();

          if (data.activeUser) {
            state.user = data.activeUser;
            updateUserProfileUI(data.activeUser);
            try {
              localStorage.setItem('meet_username', data.activeUser.username);
              localStorage.setItem('meet_user_id', data.activeUser.id);
              if (data.activeUser.email) localStorage.setItem('meet_email', data.activeUser.email);
            } catch (e) {}
          }
          if (data.accounts) {
            state.accounts = data.accounts;
            renderAccountsDropdown();
          }

          refreshActiveAccountData();
          showToast(`Account ${data.activeUser.username} added successfully!`, 'success');
        } else {
          if (alertEl && alertText) {
            alertText.textContent = data.error || 'Authentication failed. Please verify your credentials.';
            alertEl.style.display = 'flex';
          }
        }
      } catch (err) {
        if (alertEl && alertText) {
          alertText.textContent = 'An error occurred while connecting to authentication service.';
          alertEl.style.display = 'flex';
        }
      } finally {
        if (submitBtn) {
          submitBtn.disabled = false;
          if (textSpan) textSpan.textContent = 'Sign In & Add Account';
        }
      }
    });
  }

  async function switchAccount(targetUserId) {
    if (!targetUserId || (state.user && state.user.id === targetUserId)) return;

    const container = document.getElementById('profileMenuContainer');
    if (container) container.classList.remove('open');

    showToast('Switching account...', 'info', 1500);

    try {
      const res = await fetch(apiUrl('api/auth.php?action=switch_account'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ targetUserId })
      });
      const data = await res.json();

      if (res.ok && data.success) {
        if (data.activeUser) {
          state.user = data.activeUser;
          updateUserProfileUI(data.activeUser);
          try {
            localStorage.setItem('meet_username', data.activeUser.username);
            localStorage.setItem('meet_user_id', data.activeUser.id);
            if (data.activeUser.email) localStorage.setItem('meet_email', data.activeUser.email);
          } catch (e) {}
        }
        if (data.accounts) {
          state.accounts = data.accounts;
          renderAccountsDropdown();
        }

        refreshActiveAccountData();
        showToast(data.message || `Switched to ${data.activeUser.username}`, 'success');
      } else {
        showToast(data.error || 'Failed to switch account.', 'error');
      }
    } catch (err) {
      showToast('Error switching account.', 'error');
    }
  }

  function updateUserProfileUI(user) {
    if (!user) return;
    const username = user.username || 'User';
    const email = user.email || 'No email registered';
    const idShort = (user.id || '').substring(0, 8);
    const initial = username.charAt(0).toUpperCase();

    document.querySelectorAll('.sidebar-user-name, .dropdown-user-name').forEach(el => el.textContent = username);
    document.querySelectorAll('.dropdown-user-email').forEach(el => el.textContent = email);
    document.querySelectorAll('.dropdown-user-badge').forEach(el => el.textContent = 'ID: ' + idShort);
    document.querySelectorAll('.sidebar-avatar').forEach(el => el.textContent = initial);

    const profileUserInp = document.getElementById('profileUsernameInput');
    if (profileUserInp) profileUserInp.value = username;
    const profileEmailDisp = document.getElementById('profileEmailDisplay');
    if (profileEmailDisp) profileEmailDisp.value = email;
  }

  function refreshActiveAccountData() {
    // 1. Reset chat selection to prevent mixed state
    state.conversations = [];
    state.activeContact = null;
    state.messages = [];

    const activeHeader = document.getElementById('chatActiveHeader');
    const composerForm = document.getElementById('chatComposerForm');
    if (activeHeader) activeHeader.style.display = 'none';
    if (composerForm) composerForm.style.display = 'none';

    const chatMessagesBody = document.getElementById('chatMessagesBody');
    if (chatMessagesBody) {
      chatMessagesBody.innerHTML = `
        <div class="chat-empty-selection">
          <div class="chat-empty-icon">
            <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
              <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"></path>
            </svg>
          </div>
          <h3>Select a conversation</h3>
          <p>Choose a contact on the left or click <strong>+ New Chat</strong> to begin messaging.</p>
        </div>
      `;
    }

    // 2. Reset and reload meetings
    state.upcomingMeetings = [];
    state.historyMeetings = [];
    state.historyPage = 1;
    loadUpcomingMeetings();
    loadMeetingHistory();

    // 3. Reset and reload contacts / chat if active
    state.contacts = [];
    if (state.activeTab === 'chat') {
      loadConversations();
    } else if (state.activeTab === 'people') {
      loadContacts();
    }

    // 4. Update unread count & touch presence for newly active user
    fetch(apiUrl('api/contacts.php?action=heartbeat'), { method: 'POST' }).catch(() => {});
    fetch(apiUrl('api/chat.php?action=unread_count'))
      .then(res => res.json())
      .then(data => {
        if (data && data.success) {
          updateUnreadBadges(data.total_unread || 0);
        }
      })
      .catch(() => {});
  }

  // ------------------------------------------------------------------------
  // 4. Modal Management Helper
  // ------------------------------------------------------------------------
  function openModal(modalId) {
    const modal = document.getElementById(modalId);
    if (!modal) return;
    modal.classList.add('open');
    document.body.style.overflow = 'hidden';

    const firstInput = modal.querySelector('input:not([type="hidden"]), select, textarea');
    if (firstInput) setTimeout(() => firstInput.focus(), 100);
  }

  function closeModal(modalId) {
    const modal = typeof modalId === 'string' ? document.getElementById(modalId) : modalId;
    if (!modal) return;
    modal.classList.remove('open');
    document.body.style.overflow = '';
  }

  function initModals() {
    document.querySelectorAll('.modal-overlay').forEach(modal => {
      modal.addEventListener('click', (e) => {
        if (e.target === modal) {
          closeModal(modal);
        }
      });

      modal.querySelectorAll('.modal-close-btn, [data-close-modal]').forEach(btn => {
        btn.addEventListener('click', () => closeModal(modal));
      });
    });

    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') {
        document.querySelectorAll('.modal-overlay.open').forEach(closeModal);
      }
    });
  }

  // ------------------------------------------------------------------------
  // 5. Left Navigation Router (Chat, Meet, People, History)
  // ------------------------------------------------------------------------
  function switchTab(tabId) {
    const validTabs = ['meet', 'chat', 'people', 'history'];
    if (!validTabs.includes(tabId)) tabId = 'meet';

    state.activeTab = tabId;

    // 1. Highlight selected sidebar nav item
    document.querySelectorAll('.sidebar-nav-item').forEach(btn => {
      if (btn.getAttribute('data-tab') === tabId) {
        btn.classList.add('active');
      } else {
        btn.classList.remove('active');
      }
    });

    // 2. Update Topbar View Title
    const titleMap = {
      meet: 'Meetings Dashboard',
      chat: 'Team Chat',
      people: 'Contacts Directory',
      history: 'Meeting History'
    };
    const topbarTitle = document.getElementById('topbarViewTitle');
    if (topbarTitle) {
      topbarTitle.textContent = titleMap[tabId] || 'Dashboard';
    }

    // 3. Switch main view visibility without reload
    const viewMap = {
      meet: 'viewMeet',
      chat: 'viewChat',
      people: 'viewPeople',
      history: 'viewHistory'
    };

    Object.entries(viewMap).forEach(([t, sectionId]) => {
      const el = document.getElementById(sectionId);
      if (!el) return;
      if (t === tabId) {
        el.classList.add('active');
      } else {
        el.classList.remove('active');
      }
    });

    // 4. Sync URL hash
    if (window.location.hash !== '#' + tabId) {
      history.replaceState(null, null, '#' + tabId);
    }

    // Close mobile drawer if opened
    closeMobileSidebar();

    // 5. Load/refresh view-specific data
    if (tabId === 'meet') {
      loadUpcomingMeetings();
    } else if (tabId === 'chat') {
      loadConversations();
      if (state.activeContact) {
        loadDirectMessages(state.activeContact.id);
      }
    } else if (tabId === 'people') {
      loadContacts();
    } else if (tabId === 'history') {
      loadMeetingHistory();
    }
  }

  function initSidebarNavigation() {
    // Nav buttons
    document.querySelectorAll('.sidebar-nav-item').forEach(btn => {
      btn.addEventListener('click', () => {
        const tab = btn.getAttribute('data-tab');
        if (tab) switchTab(tab);
      });
    });

    // Mobile sidebar hamburger toggle & backdrop
    const toggleBtn = document.getElementById('btnSidebarToggle');
    const sidebar = document.getElementById('appSidebar');
    const backdrop = document.getElementById('sidebarBackdrop');

    if (toggleBtn && sidebar) {
      toggleBtn.addEventListener('click', () => {
        sidebar.classList.toggle('open');
        if (backdrop) backdrop.classList.toggle('open');
      });
    }

    if (backdrop && sidebar) {
      backdrop.addEventListener('click', closeMobileSidebar);
    }

    // Topbar quick buttons
    const btnTopInstant = document.getElementById('btnTopInstant');
    if (btnTopInstant) {
      btnTopInstant.addEventListener('click', () => {
        const cardInstant = document.getElementById('cardInstantMeeting');
        if (cardInstant) cardInstant.click();
      });
    }

    // Hash change handler
    window.addEventListener('hashchange', () => {
      const hash = window.location.hash.replace('#', '');
      if (hash && hash !== state.activeTab) {
        switchTab(hash);
      }
    });

    // Initial route check
    const initialHash = window.location.hash.replace('#', '');
    if (initialHash && ['meet', 'chat', 'people', 'history'].includes(initialHash)) {
      switchTab(initialHash);
    } else {
      switchTab('meet');
    }
  }

  function closeMobileSidebar() {
    const sidebar = document.getElementById('appSidebar');
    const backdrop = document.getElementById('sidebarBackdrop');
    if (sidebar) sidebar.classList.remove('open');
    if (backdrop) backdrop.classList.remove('open');
  }

  // ------------------------------------------------------------------------
  // 6. Action Cards Handlers (Meet View)
  // ------------------------------------------------------------------------
  function initActionCards() {
    // Instant Meeting
    const btnInstant = document.getElementById('cardInstantMeeting');
    if (btnInstant) {
      btnInstant.addEventListener('click', () => {
        // Generate random clean room ID upfront for sharing without hitting backend yet
        const words = ['sync', 'huddle', 'nexus', 'pulse', 'orbit', 'focus', 'talk', 'connect', 'vision', 'stream'];
        const randWord = words[Math.floor(Math.random() * words.length)];
        const suffix = Math.random().toString(36).substring(2, 8);
        const roomId = `meet-${randWord}-${suffix}`;

        state.pendingInstantMeeting = { roomId };

        const defaultTitle = (state.user ? state.user.username : 'Alex') + "'s Instant Meeting";
        const topicInput = document.getElementById('instantTopicInput');
        if (topicInput) {
          topicInput.value = '';
          topicInput.placeholder = `e.g. ${defaultTitle}`;
        }

        const idEl = document.getElementById('instantMeetingIdText');
        if (idEl) idEl.textContent = roomId;

        const rawJoinUrl = `room.php?room=${encodeURIComponent(roomId)}`;
        const fullLink = getShareableMeetingUrl(rawJoinUrl);
        const urlEl = document.getElementById('instantMeetingUrlText');
        if (urlEl) urlEl.textContent = fullLink;

        const btnCopyLink = document.getElementById('btnCopyInstantLink');
        if (btnCopyLink) {
          btnCopyLink.onclick = () => {
            copyToClipboard(fullLink, 'Meeting invite link copied!');
          };
        }

        const btnCopyId = document.getElementById('btnCopyInstantId');
        if (btnCopyId) {
          btnCopyId.onclick = () => {
            copyToClipboard(roomId, 'Meeting ID copied!');
          };
        }

        openModal('instantMeetingModal');
        setTimeout(() => {
          if (topicInput) topicInput.focus();
        }, 150);
      });
    }

    // Start Instant Meeting Now button handler (Inside the modal)
    const btnStartInstant = document.getElementById('btnStartInstantMeeting');
    if (btnStartInstant) {
      btnStartInstant.addEventListener('click', async () => {
        if (!state.pendingInstantMeeting) return;
        const roomId = state.pendingInstantMeeting.roomId;
        const topicInput = document.getElementById('instantTopicInput');
        const defaultTitle = (state.user ? state.user.username : 'Alex') + "'s Instant Meeting";
        const title = (topicInput && topicInput.value.trim()) ? topicInput.value.trim() : defaultTitle;

        btnStartInstant.disabled = true;
        btnStartInstant.textContent = 'Starting...';

        try {
          // NOW officially create the meeting on the server so it appears as a dashboard card!
          const res = await fetch(apiUrl('api/meetings.php?action=create_instant'), {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              roomId,
              title
            })
          });
          const data = await res.json();
          if (data && data.success) {
            loadUpcomingMeetings();
            loadMeetingHistory();
          }
        } catch (err) {}

        // Launch the meeting room
        window.location.href = apiUrl(`room.php?room=${encodeURIComponent(roomId)}`);
      });
    }

    // Schedule Meeting
    const btnSchedule = document.getElementById('cardScheduleMeeting');
    if (btnSchedule) {
      btnSchedule.addEventListener('click', () => {
        const now = new Date();
        const yyyy = now.getFullYear();
        const mm = String(now.getMonth() + 1).padStart(2, '0');
        const dd = String(now.getDate()).padStart(2, '0');
        const dateInput = document.getElementById('schedDateInput');
        if (dateInput) {
          dateInput.value = `${yyyy}-${mm}-${dd}`;
          dateInput.min = `${yyyy}-${mm}-${dd}`;
        }

        const minutes = now.getMinutes();
        const nextHalfHour = minutes < 30 ? 30 : 0;
        const nextHour = minutes < 30 ? now.getHours() : now.getHours() + 1;
        const timeInput = document.getElementById('schedStartTimeInput');
        if (timeInput) {
          timeInput.value = `${String(nextHour).padStart(2, '0')}:${String(nextHalfHour).padStart(2, '0')}`;
        }

        openModal('scheduleMeetingModal');
      });
    }

    // Join Meeting
    const btnJoin = document.getElementById('cardJoinMeeting');
    if (btnJoin) {
      btnJoin.addEventListener('click', openJoinModal);
    }
  }

  function openJoinModal() {
    const input = document.getElementById('joinMeetingInput');
    if (input) input.value = '';
    openModal('joinMeetingModal');
    if (input) setTimeout(() => input.focus(), 50);
  }

  // ------------------------------------------------------------------------
  // 7. Schedule Meeting Form Submission
  // ------------------------------------------------------------------------
  function initScheduleForm() {
    const form = document.getElementById('scheduleMeetingForm');
    if (!form) return;

    form.addEventListener('submit', async (e) => {
      e.preventDefault();

      const title = document.getElementById('schedTitleInput').value.trim();
      const date = document.getElementById('schedDateInput').value;
      const startTime = document.getElementById('schedStartTimeInput').value;
      const duration = document.getElementById('schedDurationSelect').value;
      const description = document.getElementById('schedDescInput').value.trim();
      const passcode = '';

      if (!title || !date || !startTime) {
        showToast('Please fill out all required fields.', 'error');
        return;
      }

      const isUnlimited = duration === 'unlimited' || duration === '0';
      const durationMinutes = isUnlimited ? 0 : parseInt(duration, 10);

      const submitBtn = form.querySelector('button[type="submit"]');
      const originalText = submitBtn.innerHTML;
      submitBtn.disabled = true;
      submitBtn.innerHTML = '<span>Scheduling...</span>';

      try {
        const res = await fetch(apiUrl('api/meetings.php?action=schedule'), {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            title,
            date,
            startTime,
            durationMinutes,
            isUnlimited,
            description,
            passcode
          })
        });

        const data = await res.json();
        if (data.success) {
          closeModal('scheduleMeetingModal');
          form.reset();
          showToast('Meeting scheduled successfully!', 'success');

          const fullLink = getShareableMeetingUrl(data.joinUrl);
          copyToClipboard(fullLink, 'Meeting scheduled & invite link copied!');

          loadUpcomingMeetings();
          loadMeetingHistory();
        } else {
          showToast(data.error || 'Failed to schedule meeting', 'error');
        }
      } catch (err) {
        showToast('Network error while scheduling meeting.', 'error');
      } finally {
        submitBtn.disabled = false;
        submitBtn.innerHTML = originalText;
      }
    });
  }

  // ------------------------------------------------------------------------
  // 8. Join Meeting Form Submission & Verification
  // ------------------------------------------------------------------------
  function initJoinForm() {
    const form = document.getElementById('joinMeetingForm');
    if (!form) return;

    form.addEventListener('submit', async (e) => {
      e.preventDefault();

      const input = document.getElementById('joinMeetingInput').value.trim();

      if (!input) {
        showToast('Please enter a Meeting ID or full Invite Link', 'error');
        return;
      }

      const submitBtn = form.querySelector('button[type="submit"]');
      const originalText = submitBtn.innerHTML;
      submitBtn.disabled = true;
      submitBtn.innerHTML = '<span>Connecting...</span>';

      try {
        const res = await fetch(apiUrl('api/meetings.php?action=verify_join'), {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ meetingInput: input })
        });

        const data = await res.json();
        if (data.success) {
          closeModal('joinMeetingModal');
          showToast('Connecting to meeting...', 'success', 1500);
          setTimeout(() => {
            window.location.href = apiUrl(data.targetUrl);
          }, 400);
        } else {
          showToast(data.error || 'Invalid meeting ID or invite link', 'error');
        }
      } catch (err) {
        showToast('Failed to connect to meeting. Please try again.', 'error');
      } finally {
        submitBtn.disabled = false;
        submitBtn.innerHTML = originalText;
      }
    });
  }

  // ------------------------------------------------------------------------
  // 9. Upcoming Meetings Loader & Renderer
  // ------------------------------------------------------------------------
  async function loadUpcomingMeetings() {
    const container = document.getElementById('upcomingMeetingsList');
    if (!container) return;

    try {
      const res = await fetch(apiUrl('api/meetings.php?action=upcoming'));
      const data = await res.json();

      if (data.success && Array.isArray(data.meetings)) {
        state.upcomingMeetings = data.meetings;
        renderUpcomingMeetings(data.meetings);
      } else {
        container.innerHTML = `<div class="empty-state-box" style="grid-column: 1 / -1;"><p>${escapeHtml(data.error || 'Could not load upcoming meetings')}</p></div>`;
      }
    } catch (err) {
      container.innerHTML = `<div class="empty-state-box" style="grid-column: 1 / -1;"><p>Unable to connect to server. Retrying...</p></div>`;
    }
  }

  function renderUpcomingMeetings(meetings) {
    const container = document.getElementById('upcomingMeetingsList');
    if (!container) return;

    if (meetings.length === 0) {
      container.innerHTML = `
        <div class="empty-state-box" style="grid-column: 1 / -1;">
          <div class="empty-icon-circle">
            <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <rect x="3" y="4" width="18" height="18" rx="2" ry="2"></rect>
              <line x1="16" y1="2" x2="16" y2="6"></line>
              <line x1="8" y1="2" x2="8" y2="6"></line>
              <line x1="3" y1="10" x2="21" y2="10"></line>
            </svg>
          </div>
          <h4>No Upcoming Meetings</h4>
          <p>You have no meetings scheduled right now. Click "Schedule" above to organize your next video call.</p>
          <button type="button" class="btn btn-secondary btn-sm" style="width:auto; padding:8px 20px;" onclick="document.getElementById('cardScheduleMeeting').click()">
            Schedule a Meeting
          </button>
        </div>
      `;
      return;
    }

    container.innerHTML = meetings.map(m => {
      const isLive = m.status === 'active';
      const statusClass = isLive ? 'status-active' : 'status-scheduled';
      const statusLabel = isLive ? '<span class="status-dot"></span> Live Now' : 'Scheduled';

      const scheduledDisplay = formatMeetingDateTime(m.scheduled_start || m.created_at);
      const fullJoinLink = getShareableMeetingUrl(m.join_url);

      return `
        <div class="meeting-card" data-meeting-id="${escapeHtml(m.id)}">
          <div class="meeting-card-header">
            <span class="meeting-status-text ${statusClass}">${statusLabel}</span>
            <span class="meeting-card-time">${escapeHtml(scheduledDisplay)}</span>
          </div>

          <h3 class="meeting-card-title">${escapeHtml(m.display_title || m.room_name)}</h3>
          ${m.description ? `<p class="meeting-card-desc">${escapeHtml(m.description)}</p>` : ''}

          <div class="meeting-card-meta">
            <div class="meta-chip">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"></path><circle cx="12" cy="7" r="4"></circle></svg>
              <span>${escapeHtml(m.host_name || 'Host')}</span>
            </div>
            <div class="meta-chip">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"></rect><path d="M7 11V7a5 5 0 0 1 10 0v4"></path></svg>
              <span>ID: ${escapeHtml(m.id)}</span>
            </div>
            ${(!m.scheduled_end || m.is_unlimited || m.duration_minutes === 0) ? `
              <div class="meta-chip" style="color:#10b981; background:rgba(16,185,129,0.1); border:1px solid rgba(16,185,129,0.25);">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"></circle><polyline points="12 6 12 12 16 14"></polyline></svg>
                <span>♾️ Unlimited (No Time Limit)</span>
              </div>
            ` : ''}
          </div>

          <div class="meeting-card-actions">
            <a href="${apiUrl(m.join_url)}" class="btn-join-meeting">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polygon points="5 3 19 12 5 21 5 3"></polygon></svg>
              ${isLive ? 'Join Meeting' : 'Start Meeting'}
            </a>

            <button type="button" class="btn-icon-action" title="Copy Invite Link" onclick="window.vvaDashboard.copyLink('${escapeHtml(fullJoinLink)}')">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path></svg>
            </button>

            ${m.is_host ? `
              <button type="button" class="btn-icon-action" title="Edit Meeting" onclick="window.vvaDashboard.openEditModal('${escapeHtml(m.id)}')">
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path></svg>
              </button>
              <button type="button" class="btn-icon-action danger" title="Cancel Meeting" onclick="window.vvaDashboard.cancelMeeting('${escapeHtml(m.id)}')">
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
              </button>
            ` : ''}
          </div>
        </div>
      `;
    }).join('');
  }

  function formatMeetingDateTime(dateStr) {
    if (!dateStr) return 'Flexible Time';
    const date = new Date(dateStr.replace(' ', 'T'));
    if (isNaN(date.getTime())) return dateStr;

    const today = new Date();
    const isToday = date.toDateString() === today.toDateString();

    const timeFormatted = date.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
    if (isToday) {
      return `Today at ${timeFormatted}`;
    }

    const tomorrow = new Date();
    tomorrow.setDate(today.getDate() + 1);
    if (date.toDateString() === tomorrow.toDateString()) {
      return `Tomorrow at ${timeFormatted}`;
    }

    return `${date.toLocaleDateString([], { month: 'short', day: 'numeric' })} at ${timeFormatted}`;
  }

  // ------------------------------------------------------------------------
  // 10. Chat Module (Direct Messaging & Conversations)
  // ------------------------------------------------------------------------
  async function loadConversations() {
    const listEl = document.getElementById('chatConversationsList');
    if (!listEl) return;

    try {
      const res = await fetch(apiUrl('api/chat.php?action=conversations'));
      const data = await res.json();

      if (data.success && Array.isArray(data.conversations)) {
        const oldFp = (state.conversations || []).map(c => `${c.user_id}:${c.unread_count}:${c.last_message}:${c.is_online}`).join('|');
        const newFp = data.conversations.map(c => `${c.user_id}:${c.unread_count}:${c.last_message}:${c.is_online}`).join('|');

        state.conversations = data.conversations;
        updateUnreadBadges(data.total_unread || 0);

        // Only re-render DOM if conversation list or unread badges actually changed
        if (oldFp !== newFp || !listEl.children.length) {
          renderConversationsList();
        }
      } else {
        if (!listEl.children.length) {
          listEl.innerHTML = `<div class="chat-loading-state" style="color:#ef4444;">${escapeHtml(data.error || 'Failed to load conversations')}</div>`;
        }
      }
    } catch (err) {
      if (!listEl.children.length) {
        listEl.innerHTML = `<div class="chat-loading-state">Error fetching chats.</div>`;
      }
    }
  }

  function updateUnreadBadges(totalUnread) {
    const navBadge = document.getElementById('chatNavBadge');
    if (navBadge) {
      if (totalUnread > 0) {
        navBadge.textContent = totalUnread > 99 ? '99+' : totalUnread;
        navBadge.style.display = 'inline-flex';
      } else {
        navBadge.style.display = 'none';
      }
    }
  }

  function renderConversationsList() {
    const listEl = document.getElementById('chatConversationsList');
    if (!listEl) return;

    let items = state.conversations;
    if (state.chatSearchQuery) {
      const q = state.chatSearchQuery.toLowerCase();
      items = items.filter(c => (c.username && c.username.toLowerCase().includes(q)) || (c.last_message && c.last_message.toLowerCase().includes(q)));
    }

    if (items.length === 0) {
      listEl.innerHTML = `
        <div class="chat-loading-state" style="padding: 32px 16px;">
          ${state.chatSearchQuery ? 'No conversations matching search.' : 'No conversations yet.<br><span style="font-size:0.8rem; color:#64748b;">Click "New Chat" to start messaging.</span>'}
        </div>
      `;
      return;
    }

    listEl.innerHTML = items.map(c => {
      const isSelected = state.activeContact && state.activeContact.id === c.user_id;
      const initial = (c.username || 'U').charAt(0).toUpperCase();
      const isOnline = !!c.is_online;
      const unreadCount = parseInt(c.unread_count || 0, 10);
      const timeDisplay = formatMessageTime(c.last_time);

      return `
        <div class="conversation-item ${isSelected ? 'active' : ''}" data-user-id="${escapeHtml(c.user_id)}">
          <div class="conversation-avatar-wrapper">
            <div class="conversation-avatar">${escapeHtml(initial)}</div>
            <span class="presence-dot ${isOnline ? 'online' : 'offline'}" title="${isOnline ? 'Active Now' : 'Offline'}"></span>
          </div>

          <div class="conversation-meta">
            <div class="conversation-row-top">
              <span class="conversation-name">${escapeHtml(c.username)}</span>
              <span class="conversation-timestamp">${escapeHtml(timeDisplay)}</span>
            </div>
            <div class="conversation-row-bottom">
              <span class="conversation-snippet">${escapeHtml(c.last_message || 'Started a conversation')}</span>
              ${unreadCount > 0 ? `<span class="conversation-unread-pill">${unreadCount}</span>` : ''}
            </div>
          </div>
        </div>
      `;
    }).join('');

    // Bind item clicks
    listEl.querySelectorAll('.conversation-item').forEach(el => {
      el.addEventListener('click', () => {
        const userId = el.getAttribute('data-user-id');
        const contact = state.conversations.find(c => c.user_id === userId);
        if (contact) {
          selectConversation({
            id: contact.user_id,
            username: contact.username,
            email: contact.email || '',
            is_online: contact.is_online
          });
        }
      });
    });
  }

  function selectConversation(contact) {
    state.activeContact = contact;

    // Immediately clear unread status locally for instant UI responsiveness
    const targetConvo = (state.conversations || []).find(c => c.user_id === contact.id);
    if (targetConvo && targetConvo.unread_count > 0) {
      targetConvo.unread_count = 0;
      const remainingUnread = state.conversations.reduce((sum, c) => sum + (c.unread_count || 0), 0);
      updateUnreadBadges(remainingUnread);
    }

    // Update conversation item active state
    document.querySelectorAll('.conversation-item').forEach(el => {
      if (el.getAttribute('data-user-id') === contact.id) {
        el.classList.add('active');
        const unreadPill = el.querySelector('.conversation-unread-pill');
        if (unreadPill) unreadPill.remove();
      } else {
        el.classList.remove('active');
      }
    });

    // Show header & composer
    const activeHeader = document.getElementById('chatActiveHeader');
    const composerForm = document.getElementById('chatComposerForm');
    if (activeHeader) activeHeader.style.display = 'flex';
    if (composerForm) composerForm.style.display = 'flex';

    // Populate contact info in header
    const nameEl = document.getElementById('chatHeaderName');
    const avatarEl = document.getElementById('chatHeaderAvatar');
    const statusEl = document.getElementById('chatHeaderStatus');

    if (nameEl) nameEl.textContent = contact.username;
    if (avatarEl) avatarEl.textContent = contact.username.charAt(0).toUpperCase();
    if (statusEl) {
      statusEl.textContent = contact.is_online ? 'Active Now' : 'Offline';
      statusEl.className = 'chat-header-status ' + (contact.is_online ? 'online' : 'offline');
    }

    // Load messages
    loadDirectMessages(contact.id);

    // Focus composer input
    const composerInput = document.getElementById('chatComposerInput');
    if (composerInput) setTimeout(() => composerInput.focus(), 80);
  }

  async function loadDirectMessages(contactId) {
    const bodyEl = document.getElementById('chatMessagesBody');
    if (!bodyEl) return;

    try {
      const res = await fetch(apiUrl(`api/chat.php?action=messages&contact_id=${encodeURIComponent(contactId)}`));
      const data = await res.json();

      if (data.success && Array.isArray(data.messages)) {
        // Only re-render if messages actually changed to eliminate lag and scroll jitter
        const oldIds = (state.messages || []).map(m => m.id).join(',');
        const newIds = data.messages.map(m => m.id).join(',');
        const hasChanged = oldIds !== newIds || (state.messages || []).length !== data.messages.length;

        state.messages = data.messages;
        if (hasChanged || !bodyEl.children.length) {
          renderDirectMessages();
        }

        // Mark as read in background on server
        fetch(apiUrl(`api/chat.php?action=mark_read&contact_id=${encodeURIComponent(contactId)}`), { method: 'POST' })
          .then(() => {
            const targetConvo = (state.conversations || []).find(c => c.user_id === contactId);
            if (targetConvo && targetConvo.unread_count > 0) {
              targetConvo.unread_count = 0;
              const remainingUnread = state.conversations.reduce((sum, c) => sum + (c.unread_count || 0), 0);
              updateUnreadBadges(remainingUnread);
            }
          })
          .catch(() => {});
      } else {
        if (!bodyEl.children.length) {
          bodyEl.innerHTML = `<div class="chat-loading-state" style="color:#ef4444;">${escapeHtml(data.error || 'Failed to load messages')}</div>`;
        }
      }
    } catch (err) {
      if (!bodyEl.children.length) {
        bodyEl.innerHTML = `<div class="chat-loading-state">Error fetching messages.</div>`;
      }
    }
  }

  function renderDirectMessages() {
    const bodyEl = document.getElementById('chatMessagesBody');
    if (!bodyEl) return;

    if (state.messages.length === 0) {
      bodyEl.innerHTML = `
        <div class="chat-empty-thread">
          <div class="empty-icon-circle">
            <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"></path>
            </svg>
          </div>
          <h4>No messages yet</h4>
          <p>Send a message below to start your conversation with <strong>${escapeHtml(state.activeContact ? state.activeContact.username : 'User')}</strong>.</p>
        </div>
      `;
      return;
    }

    const currentUserId = state.user ? state.user.id : '';

    bodyEl.innerHTML = state.messages.map(m => {
      const isMine = m.sender_id === currentUserId;
      const initial = (m.sender_name || 'U').charAt(0).toUpperCase();
      const timeStr = formatMessageTime(m.created_at);

      // Check if message contains meeting link
      let textHtml = escapeHtml(m.message_text);
      if (textHtml.includes('room.php?room=')) {
        textHtml = textHtml.replace(/(https?:\/\/[^\s]+room\.php\?room=[^\s]+)/g, '<a href="$1" class="chat-inline-link">📹 Join Meeting Link</a>');
      }

      return `
        <div class="chat-message-row ${isMine ? 'outgoing' : 'incoming'}">
          ${!isMine ? `<div class="chat-msg-avatar" title="${escapeHtml(m.sender_name)}">${escapeHtml(initial)}</div>` : ''}
          <div class="chat-msg-bubble">
            ${!isMine ? `<div class="chat-msg-sender">${escapeHtml(m.sender_name)}</div>` : ''}
            <div class="chat-msg-text">${textHtml}</div>
            <div class="chat-msg-time">${escapeHtml(timeStr)}</div>
          </div>
        </div>
      `;
    }).join('');

    // Scroll to bottom
    bodyEl.scrollTop = bodyEl.scrollHeight;
  }

  function formatMessageTime(dateStr) {
    if (!dateStr) return '';
    const date = new Date(dateStr.replace(' ', 'T'));
    if (isNaN(date.getTime())) return dateStr;

    const today = new Date();
    const isToday = date.toDateString() === today.toDateString();

    if (isToday) {
      return date.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
    }
    return date.toLocaleDateString([], { month: 'short', day: 'numeric' });
  }

  function initChatComposer() {
    const form = document.getElementById('chatComposerForm');
    const input = document.getElementById('chatComposerInput');
    if (!form || !input) return;

    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      const text = input.value.trim();
      if (!text || !state.activeContact) return;

      input.value = '';
      input.focus();

      try {
        const res = await fetch(apiUrl('api/chat.php?action=send'), {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            receiver_id: state.activeContact.id,
            message_text: text
          })
        });

        const data = await res.json();
        if (data.success) {
          // Immediately append to local messages
          state.messages.push(data.message);
          renderDirectMessages();
          loadConversations();
        } else {
          showToast(data.error || 'Failed to send message', 'error');
        }
      } catch (err) {
        showToast('Network error sending message', 'error');
      }
    });

    // Search filter for conversation list
    const searchInput = document.getElementById('chatSearchInput');
    if (searchInput) {
      searchInput.addEventListener('input', (e) => {
        state.chatSearchQuery = e.target.value.trim();
        renderConversationsList();
      });
    }

    // Call / Invite button in Chat header
    const btnCall = document.getElementById('btnChatInviteMeeting');
    if (btnCall) {
      btnCall.addEventListener('click', async () => {
        if (!state.activeContact) return;
        try {
          showToast(`Generating meeting room for ${state.activeContact.username}...`, 'info', 2000);
          const res = await fetch(apiUrl('api/meetings.php?action=create_instant'), {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              title: `Meeting with ${state.activeContact.username}`
            })
          });
          const data = await res.json();
          if (data.success) {
            const fullLink = getShareableMeetingUrl(data.joinUrl);

            // Send invite link as direct message
            await fetch(apiUrl('api/chat.php?action=send'), {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                receiver_id: state.activeContact.id,
                message_text: `I've started a video meeting. Click here to join: ${fullLink}`
              })
            });

            // Reload chat messages
            loadDirectMessages(state.activeContact.id);
            showToast('Meeting link sent in chat! Starting call...', 'success', 2000);

            setTimeout(() => {
              window.location.href = apiUrl(data.joinUrl);
            }, 600);
          } else {
            showToast(data.error || 'Failed to start call', 'error');
          }
        } catch (err) {
          showToast('Error starting video call.', 'error');
        }
      });
    }
  }

  // ------------------------------------------------------------------------
  // 11. New Chat Modal (User Picker)
  // ------------------------------------------------------------------------
  async function openNewChatModal() {
    const listEl = document.getElementById('newChatUsersList');
    if (!listEl) return;

    openModal('newChatModal');
    listEl.innerHTML = '<div class="contacts-loading">Loading team contacts...</div>';

    try {
      const res = await fetch(apiUrl('api/contacts.php?action=list'));
      const data = await res.json();

      if (data.success && Array.isArray(data.contacts)) {
        state.allContactsForModal = data.contacts;
        renderNewChatUsers(data.contacts);
      } else {
        listEl.innerHTML = `<div class="contacts-loading" style="color:#ef4444;">${escapeHtml(data.error || 'Could not load contacts')}</div>`;
      }
    } catch (err) {
      listEl.innerHTML = '<div class="contacts-loading">Error loading contacts.</div>';
    }
  }

  function renderNewChatUsers(contacts) {
    const listEl = document.getElementById('newChatUsersList');
    if (!listEl) return;

    if (contacts.length === 0) {
      listEl.innerHTML = '<div class="contacts-loading">No other contacts found.</div>';
      return;
    }

    listEl.innerHTML = contacts.map(c => {
      const initial = (c.username || 'U').charAt(0).toUpperCase();
      const isOnline = !!c.is_online;

      return `
        <div class="new-chat-user-row" data-user-id="${escapeHtml(c.id)}" style="display:flex; align-items:center; justify-content:space-between; padding:10px 14px; border-radius:10px; cursor:pointer; transition:background 0.15s ease;">
          <div style="display:flex; align-items:center; gap:12px;">
            <div class="conversation-avatar-wrapper">
              <div class="conversation-avatar" style="width:36px; height:36px; font-size:0.9rem;">${escapeHtml(initial)}</div>
              <span class="presence-dot ${isOnline ? 'online' : 'offline'}" style="bottom:0; right:0;"></span>
            </div>
            <div>
              <div style="font-weight:600; font-size:0.92rem; color:#0f172a;">${escapeHtml(c.username)}</div>
              <div style="font-size:0.78rem; color:#64748b;">${escapeHtml(c.email || 'Team Member')}</div>
            </div>
          </div>
          <button type="button" class="btn btn-secondary btn-sm" style="font-size:0.8rem; padding:5px 12px;">Message</button>
        </div>
      `;
    }).join('');

    listEl.querySelectorAll('.new-chat-user-row').forEach(row => {
      row.addEventListener('click', () => {
        const userId = row.getAttribute('data-user-id');
        const contact = state.allContactsForModal.find(c => c.id === userId);
        if (contact) {
          closeModal('newChatModal');
          switchTab('chat');
          selectConversation(contact);
        }
      });
    });
  }

  function initNewChatSearch() {
    const searchInput = document.getElementById('newChatSearchInput');
    if (searchInput) {
      searchInput.addEventListener('input', (e) => {
        const q = e.target.value.toLowerCase().trim();
        const filtered = state.allContactsForModal.filter(c =>
          (c.username && c.username.toLowerCase().includes(q)) ||
          (c.email && c.email.toLowerCase().includes(q))
        );
        renderNewChatUsers(filtered);
      });
    }
  }

  // ------------------------------------------------------------------------
  // 12. People Module (Contacts Directory & Presence)
  // ------------------------------------------------------------------------
  async function loadContacts() {
    const gridEl = document.getElementById('contactsGrid');
    if (!gridEl) return;

    try {
      const res = await fetch(apiUrl('api/contacts.php?action=list'));
      const data = await res.json();

      if (data.success && Array.isArray(data.contacts)) {
        state.contacts = data.contacts;

        // Update counts
        const allBadge = document.getElementById('countAllContacts');
        const activeBadge = document.getElementById('countActiveContacts');
        if (allBadge) allBadge.textContent = data.contacts.length;
        if (activeBadge) activeBadge.textContent = data.total_active || 0;

        renderContactsGrid();
      } else {
        gridEl.innerHTML = `<div class="contacts-loading" style="color:#ef4444;">${escapeHtml(data.error || 'Failed to load contacts')}</div>`;
      }
    } catch (err) {
      gridEl.innerHTML = `<div class="contacts-loading">Error fetching contacts.</div>`;
    }
  }

  function renderContactsGrid() {
    const gridEl = document.getElementById('contactsGrid');
    if (!gridEl) return;

    let items = state.contacts;

    // Filter All vs Active
    if (state.contactsFilter === 'active') {
      items = items.filter(c => !!c.is_online);
    }

    // Filter Search
    if (state.contactsSearchQuery) {
      const q = state.contactsSearchQuery.toLowerCase();
      items = items.filter(c =>
        (c.username && c.username.toLowerCase().includes(q)) ||
        (c.email && c.email.toLowerCase().includes(q))
      );
    }

    if (items.length === 0) {
      gridEl.innerHTML = `
        <div class="empty-state-box" style="grid-column: 1 / -1;">
          <div class="empty-icon-circle">
            <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"></path>
              <circle cx="9" cy="7" r="4"></circle>
            </svg>
          </div>
          <h4>No Contacts Found</h4>
          <p>${state.contactsFilter === 'active' ? 'No other team members are currently active online.' : 'No contacts matching your search query.'}</p>
        </div>
      `;
      return;
    }

    gridEl.innerHTML = items.map(c => {
      const initial = (c.username || 'U').charAt(0).toUpperCase();
      const isOnline = !!c.is_online;
      const statusText = isOnline ? 'Active Now' : 'Offline';

      return `
        <div class="contact-card" data-contact-id="${escapeHtml(c.id)}">
          <div class="contact-card-header">
            <div class="contact-avatar-wrapper">
              <div class="contact-avatar">${escapeHtml(initial)}</div>
              <span class="presence-dot ${isOnline ? 'online' : 'offline'}" title="${statusText}"></span>
            </div>
            <div class="contact-status-chip ${isOnline ? 'online' : 'offline'}">
              <span class="status-dot-mini"></span>
              ${statusText}
            </div>
          </div>

          <div class="contact-card-info">
            <h4 class="contact-card-name">${escapeHtml(c.username)}</h4>
            <p class="contact-card-email">${escapeHtml(c.email || 'Registered User')}</p>
          </div>

          <div class="contact-card-actions">
            <button type="button" class="btn btn-secondary btn-sm contact-btn-chat" title="Send Direct Message">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"></path></svg>
              Chat
            </button>

            <button type="button" class="btn btn-primary btn-sm contact-btn-meet" title="Invite to Instant Meeting">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polygon points="23 7 16 12 23 17 23 7"></polygon><rect x="1" y="5" width="15" height="14" rx="2" ry="2"></rect></svg>
              Invite
            </button>
          </div>
        </div>
      `;
    }).join('');

    // Bind card actions
    gridEl.querySelectorAll('.contact-card').forEach(card => {
      const contactId = card.getAttribute('data-contact-id');
      const contact = state.contacts.find(c => c.id === contactId);
      if (!contact) return;

      const btnChat = card.querySelector('.contact-btn-chat');
      if (btnChat) {
        btnChat.addEventListener('click', () => {
          switchTab('chat');
          selectConversation(contact);
        });
      }

      const btnMeet = card.querySelector('.contact-btn-meet');
      if (btnMeet) {
        btnMeet.addEventListener('click', async () => {
          try {
            showToast(`Generating meeting invite for ${contact.username}...`, 'info', 2000);
            const res = await fetch(apiUrl('api/meetings.php?action=create_instant'), {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                title: `Meeting with ${contact.username}`
              })
            });
            const data = await res.json();
            if (data.success) {
              const fullLink = getShareableMeetingUrl(data.joinUrl);

              // Send link via chat
              fetch(apiUrl('api/chat.php?action=send'), {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                  receiver_id: contact.id,
                  message_text: `I've started a video meeting. Click here to join: ${fullLink}`
                })
              });

              copyToClipboard(fullLink, `Invite link copied & sent to ${contact.username}!`);
              setTimeout(() => {
                window.location.href = apiUrl(data.joinUrl);
              }, 700);
            } else {
              showToast(data.error || 'Failed to create meeting', 'error');
            }
          } catch (err) {
            showToast('Error inviting contact to meeting', 'error');
          }
        });
      }
    });
  }

  function initPeopleFilters() {
    const searchInput = document.getElementById('contactsSearchInput');
    if (searchInput) {
      searchInput.addEventListener('input', (e) => {
        state.contactsSearchQuery = e.target.value.trim();
        renderContactsGrid();
      });
    }

    const tabAll = document.getElementById('tabFilterAllContacts');
    const tabActive = document.getElementById('tabFilterActiveContacts');

    if (tabAll && tabActive) {
      tabAll.addEventListener('click', () => {
        state.contactsFilter = 'all';
        tabAll.classList.add('active');
        tabActive.classList.remove('active');
        renderContactsGrid();
      });

      tabActive.addEventListener('click', () => {
        state.contactsFilter = 'active';
        tabActive.classList.add('active');
        tabAll.classList.remove('active');
        renderContactsGrid();
      });
    }
  }

  // ------------------------------------------------------------------------
  // 13. Meeting History Module (Persistent MySQL Logs & CSV Export)
  // ------------------------------------------------------------------------
  async function loadMeetingHistory() {
    const tableBody = document.getElementById('historyTableBody');
    if (!tableBody) return;

    const params = new URLSearchParams({
      action: 'history',
      page: state.historyPage,
      perPage: state.historyPerPage,
      search: state.filters.search,
      status: state.filters.status,
      date: state.filters.date
    });

    if (state.filters.myMeetings) {
      params.append('my_meetings', '1');
    }

    try {
      const res = await fetch(apiUrl('api/meetings.php?' + params.toString()));
      const data = await res.json();

      if (data.success && Array.isArray(data.meetings)) {
        state.historyMeetings = data.meetings;
        state.historyTotal = data.total;
        state.historyTotalPages = data.totalPages;

        renderHistoryTable(data.meetings);
        renderPagination();
      } else {
        tableBody.innerHTML = `<tr><td colspan="7" style="text-align:center; padding:32px; color:#64748b;">${escapeHtml(data.error || 'Failed to load history')}</td></tr>`;
      }
    } catch (err) {
      tableBody.innerHTML = `<tr><td colspan="7" style="text-align:center; padding:32px; color:#64748b;">Error fetching history data</td></tr>`;
    }
  }

  function renderHistoryTable(meetings) {
    const tableBody = document.getElementById('historyTableBody');
    if (!tableBody) return;

    if (!meetings || meetings.length === 0) {
      tableBody.innerHTML = `
        <tr>
          <td colspan="7" style="text-align:center; padding:56px 20px;">
            <div style="display:inline-flex; align-items:center; justify-content:center; width:52px; height:52px; border-radius:50%; background:#f1f5f9; color:#94a3b8; margin-bottom:12px;">
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"></circle><polyline points="12 6 12 12 16 14"></polyline></svg>
            </div>
            <div style="color:#475569; font-weight:600; font-size:0.95rem; margin-bottom:4px;">No meeting records found</div>
            <span style="font-size:0.83rem; color:#94a3b8;">Meetings you host or join will appear here.</span>
          </td>
        </tr>
      `;
      return;
    }

    tableBody.innerHTML = meetings.map(m => {
      const statusClass = `status-${m.status || 'active'}`;
      const statusLabel = capitalize(m.status || 'active');

      const dateStr = m.actual_start || m.scheduled_start || m.created_at;
      let formattedDate = '-';
      if (dateStr) {
        try {
          const d = new Date(dateStr.replace(' ', 'T'));
          formattedDate = isNaN(d.getTime()) ? dateStr : d.toLocaleString([], {
            month: 'short',
            day: 'numeric',
            year: 'numeric',
            hour: 'numeric',
            minute: '2-digit'
          });
        } catch (e) {
          formattedDate = dateStr;
        }
      }

      let durSec = Math.max(0, parseInt(m.calculated_duration_seconds || 0, 10));
      if (!durSec && m.actual_start) {
        const sTime = new Date(typeof m.actual_start === 'string' && !m.actual_start.includes('T') ? m.actual_start.replace(' ', 'T') : m.actual_start).getTime();
        if (!isNaN(sTime)) {
          if (m.actual_end) {
            const eTime = new Date(typeof m.actual_end === 'string' && !m.actual_end.includes('T') ? m.actual_end.replace(' ', 'T') : m.actual_end).getTime();
            if (!isNaN(eTime)) durSec = Math.max(0, Math.round((eTime - sTime) / 1000));
          } else if (m.status === 'active') {
            durSec = Math.max(0, Math.round((Date.now() - sTime) / 1000));
          }
        }
      }

      let durationDisplay = '-';
      if (m.status === 'active') {
        const mins = Math.floor(durSec / 60);
        const remSecs = durSec % 60;
        durationDisplay = mins > 0 ? `${mins}m ${remSecs}s (Live)` : `${durSec}s (Live)`;
      } else if (durSec > 0) {
        if (durSec < 60) {
          durationDisplay = `${durSec}s`;
        } else {
          const mins = Math.floor(durSec / 60);
          const hrs = Math.floor(mins / 60);
          const remMins = mins % 60;
          const remSecs = durSec % 60;
          if (hrs > 0) {
            durationDisplay = remSecs > 0 ? `${hrs}h ${remMins}m ${remSecs}s` : `${hrs}h ${remMins}m`;
          } else {
            durationDisplay = remSecs > 0 ? `${mins}m ${remSecs}s` : `${mins}m`;
          }
        }
      }
      const attendeesDisplay = `${m.total_attendees || 0}`;
      const fullJoinLink = getShareableMeetingUrl(m.join_url);

      return `
        <tr>
          <td>
            <div class="table-title-cell">
              <span class="table-meeting-title">${escapeHtml(m.display_title || m.room_name)}</span>
              <span class="table-meeting-id" onclick="window.vvaDashboard.copyLink('${escapeHtml(m.id)}', 'Meeting ID copied!')" style="cursor:pointer;" title="Click to copy ID">
                ${escapeHtml(m.id)}
                <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path></svg>
              </span>
            </div>
          </td>
          <td>${escapeHtml(m.host_name || 'Host')}</td>
          <td>${escapeHtml(formattedDate)}</td>
          <td>${escapeHtml(durationDisplay)}</td>
          <td>👥 ${escapeHtml(attendeesDisplay)}</td>
          <td>
            <span class="table-status-text ${statusClass}">${escapeHtml(statusLabel)}</span>
          </td>
          <td>
            <div class="table-actions-cell">
              <button type="button" class="btn-table-action" title="Copy Link" onclick="window.vvaDashboard.copyLink('${escapeHtml(fullJoinLink)}')">
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"></path><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"></path></svg>
                Copy
              </button>

              <button type="button" class="btn-table-action" title="View Meeting Details & Roster" onclick="window.vvaDashboard.viewDetails('${escapeHtml(m.id)}')">
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"></circle><line x1="12" y1="16" x2="12" y2="12"></line><line x1="12" y1="8" x2="12.01" y2="8"></line></svg>
                Details
              </button>

              <a href="${apiUrl(m.join_url)}" class="btn-table-action primary" title="Rejoin or Enter Meeting">
                Rejoin
              </a>

              <button type="button" class="btn-table-action danger" title="Delete from history" onclick="window.vvaDashboard.deleteMeeting('${escapeHtml(m.id)}')">
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path></svg>
                Delete
              </button>
            </div>
          </td>
        </tr>
      `;
    }).join('');
  }

  function renderPagination() {
    const container = document.getElementById('historyPagination');
    if (!container) return;

    if (!state.historyTotal || state.historyTotal === 0) {
      container.innerHTML = `
        <div id="historyPaginationInfo" class="pagination-info">Showing 0 meetings</div>
        <div class="pagination-buttons">
          <button type="button" class="btn btn-secondary btn-sm" disabled>Previous</button>
          <button type="button" class="btn btn-secondary btn-sm" disabled>Next</button>
        </div>
      `;
      return;
    }

    const start = (state.historyPage - 1) * state.historyPerPage + 1;
    const end = Math.min(state.historyTotal, state.historyPage * state.historyPerPage);

    let pagesHtml = '';
    const totalPages = state.historyTotalPages || 1;

    // Previous Button
    pagesHtml += `
      <button class="page-btn" ${state.historyPage <= 1 ? 'disabled' : ''} onclick="window.vvaDashboard.setPage(${state.historyPage - 1})" title="Previous Page">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="15 18 9 12 15 6"></polyline></svg>
      </button>
    `;

    for (let p = 1; p <= totalPages; p++) {
      if (p === 1 || p === totalPages || (p >= state.historyPage - 1 && p <= state.historyPage + 1)) {
        pagesHtml += `
          <button class="page-btn ${p === state.historyPage ? 'active' : ''}" onclick="window.vvaDashboard.setPage(${p})">
            ${p}
          </button>
        `;
      } else if (p === state.historyPage - 2 || p === state.historyPage + 2) {
        pagesHtml += `<span style="color:#94a3b8; padding:0 4px;">...</span>`;
      }
    }

    // Next Button
    pagesHtml += `
      <button class="page-btn" ${state.historyPage >= totalPages ? 'disabled' : ''} onclick="window.vvaDashboard.setPage(${state.historyPage + 1})" title="Next Page">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="9 18 15 12 9 6"></polyline></svg>
      </button>
    `;

    container.innerHTML = `
      <div id="historyPaginationInfo" class="pagination-info">Showing ${start} to ${end} of ${state.historyTotal} meetings</div>
      <div class="pagination-pages">${pagesHtml}</div>
    `;
  }

  function capitalize(str) {
    if (!str) return '';
    return str.charAt(0).toUpperCase() + str.slice(1);
  }

  function initHistoryFilters() {
    const searchInput = document.getElementById('historySearchInput');
    if (searchInput) {
      searchInput.addEventListener('input', (e) => {
        clearTimeout(state.historySearchDebounce);
        state.historySearchDebounce = setTimeout(() => {
          state.filters.search = e.target.value.trim();
          state.historyPage = 1;
          loadMeetingHistory();
        }, 300);
      });
    }

    const statusSelect = document.getElementById('historyStatusFilter');
    if (statusSelect) {
      statusSelect.addEventListener('change', (e) => {
        state.filters.status = e.target.value;
        state.historyPage = 1;
        loadMeetingHistory();
      });
    }

    const dateSelect = document.getElementById('historyDateFilter');
    if (dateSelect) {
      dateSelect.addEventListener('change', (e) => {
        state.filters.date = e.target.value;
        state.historyPage = 1;
        loadMeetingHistory();
      });
    }

    // CSV Export button
    const exportBtn = document.getElementById('btnExportCsv');
    if (exportBtn) {
      exportBtn.addEventListener('click', (e) => {
        e.preventDefault();
        showToast('Preparing CSV report for download...', 'info', 2000);

        const params = new URLSearchParams({
          action: 'export_csv',
          search: state.filters.search,
          status: state.filters.status,
          date: state.filters.date
        });
        if (state.filters.myMeetings) {
          params.append('my_meetings', '1');
        }

        window.location.href = apiUrl('api/meetings.php?' + params.toString());
      });
    }
  }

  // ------------------------------------------------------------------------
  // 14. Details Modal (Attendee Roster & Full Metrics)
  // ------------------------------------------------------------------------
  async function viewMeetingDetails(meetingId) {
    showToast('Loading meeting details...', 'info', 1500);

    try {
      const res = await fetch(apiUrl(`api/meetings.php?action=details&id=${encodeURIComponent(meetingId)}`));
      const data = await res.json();

      if (data.success && data.meeting) {
        const m = data.meeting;

        const formatDateTime = (ts) => {
          if (!ts || ts === '-' || ts === 'null') return '-';
          try {
            const d = new Date(typeof ts === 'string' && !ts.includes('T') ? ts.replace(' ', 'T') : ts);
            return isNaN(d.getTime()) ? ts : d.toLocaleString([], {
              month: 'short',
              day: 'numeric',
              year: 'numeric',
              hour: 'numeric',
              minute: '2-digit',
              second: '2-digit'
            });
          } catch (e) {
            return ts;
          }
        };

        const formatDuration = (sec, isActive = false) => {
          const s = Math.max(0, parseInt(sec || 0, 10));
          if (isActive) {
            if (s < 60) return `${s}s (Live)`;
            const mins = Math.floor(s / 60);
            const hrs = Math.floor(mins / 60);
            const remM = mins % 60;
            const remS = s % 60;
            return hrs > 0 ? `${hrs}h ${remM}m (Live)` : (remS > 0 ? `${mins}m ${remS}s (Live)` : `${mins}m (Live)`);
          }
          if (s === 0) return '0s';
          if (s < 60) return `${s}s`;
          const mins = Math.floor(s / 60);
          const hrs = Math.floor(mins / 60);
          const remMins = mins % 60;
          const remSecs = s % 60;
          if (hrs > 0) {
            return remSecs > 0 ? `${hrs}h ${remMins}m ${remSecs}s` : `${hrs}h ${remMins}m`;
          }
          return remSecs > 0 ? `${mins}m ${remSecs}s` : `${mins}m`;
        };

        const setElText = (id, text) => {
          const el = document.getElementById(id);
          if (el) el.textContent = text;
        };

        setElText('detailTitle', m.display_title || m.room_name);
        setElText('detailRoomId', m.id);
        setElText('detailHost', m.host_name || 'Host');
        setElText('detailStatus', capitalize(m.status));
        setElText('detailCreated', formatDateTime(m.created_at));
        setElText('detailStart', formatDateTime(m.actual_start || m.scheduled_start));
        
        let meetingDurSec = Math.max(0, parseInt(m.calculated_duration_seconds || 0, 10));
        if (!meetingDurSec && m.actual_start) {
          const sTime = new Date(typeof m.actual_start === 'string' && !m.actual_start.includes('T') ? m.actual_start.replace(' ', 'T') : m.actual_start).getTime();
          if (!isNaN(sTime)) {
            if (m.actual_end) {
              const eTime = new Date(typeof m.actual_end === 'string' && !m.actual_end.includes('T') ? m.actual_end.replace(' ', 'T') : m.actual_end).getTime();
              if (!isNaN(eTime)) meetingDurSec = Math.max(0, Math.round((eTime - sTime) / 1000));
            } else if (m.status === 'active') {
              meetingDurSec = Math.max(0, Math.round((Date.now() - sTime) / 1000));
            }
          }
        }
        setElText('detailDuration', formatDuration(meetingDurSec, m.status === 'active'));

        const isUnlimitedMeeting = !m.scheduled_end || m.is_unlimited || m.duration_minutes === 0;
        setElText('detailEnd', m.actual_end ? formatDateTime(m.actual_end) : (m.status === 'active' ? 'In Progress (Active)' : (isUnlimitedMeeting ? 'Unlimited (No Time Limit)' : (m.scheduled_end ? formatDateTime(m.scheduled_end) : '-'))));
        setElText('detailMessages', data.total_messages || 0);

        const fullJoinLink = getShareableMeetingUrl(m.join_url);
        const joinLinkEl = document.getElementById('detailJoinLink');
        if (joinLinkEl) joinLinkEl.value = fullJoinLink;
        const btnCopy = document.getElementById('btnCopyDetailLink');
        if (btnCopy) {
          btnCopy.onclick = () => {
            copyToClipboard(fullJoinLink, 'Meeting invite link copied!');
          };
        }

        // Render Attendees table
        const rosterBody = document.getElementById('detailAttendeesBody');
        if (rosterBody) {
          if (data.attendees && data.attendees.length > 0) {
            rosterBody.innerHTML = data.attendees.map(a => {
              const isStillActive = !a.left_at;
              let durSec = Math.max(0, parseInt(a.attendance_duration || a.duration_seconds || 0, 10));
              if (isStillActive && a.joined_at) {
                const jTime = new Date(typeof a.joined_at === 'string' && !a.joined_at.includes('T') ? a.joined_at.replace(' ', 'T') : a.joined_at).getTime();
                if (!isNaN(jTime)) {
                  durSec = Math.max(0, Math.round((Date.now() - jTime) / 1000));
                }
              }

              const durStr = formatDuration(durSec, isStillActive);

              const formatRosterTime = (ts) => {
                if (!ts || ts === '-' || ts === 'null') return '-';
                try {
                  const d = new Date(typeof ts === 'string' && !ts.includes('T') ? ts.replace(' ', 'T') : ts);
                  if (isNaN(d.getTime())) return ts;
                  return d.toLocaleTimeString([], {
                    hour: 'numeric',
                    minute: '2-digit',
                    second: '2-digit'
                  }) + ` (${d.toLocaleDateString([], { month: 'short', day: 'numeric' })})`;
                } catch (e) {
                  return ts;
                }
              };

              const joinedDisplay = formatRosterTime(a.joined_at);
              const leftDisplay = a.left_at 
                ? formatRosterTime(a.left_at) 
                : '<span style="display:inline-flex; align-items:center; gap:5px; font-size:0.75rem; font-weight:700; color:#10b981; background:rgba(16,185,129,0.12); padding:3px 9px; border-radius:999px;"><span style="width:6px; height:6px; border-radius:50%; background:#10b981; display:inline-block;"></span> Active</span>';

              return `
                <tr>
                  <td style="font-weight:600; color:#0f172a;">${escapeHtml(a.username || a.user_id || 'Participant')}</td>
                  <td style="font-size:0.8rem; color:#64748b;">${escapeHtml(a.email || '-')}</td>
                  <td style="font-size:0.82rem; color:#334155;">${escapeHtml(joinedDisplay)}</td>
                  <td style="font-size:0.82rem;">${leftDisplay}</td>
                  <td style="font-size:0.85rem; font-weight:700; color:#0f172a;">${escapeHtml(durStr)}</td>
                </tr>
              `;
            }).join('');
          } else {
            rosterBody.innerHTML = `<tr><td colspan="5" style="text-align:center; padding:18px; color:#64748b;">No attendee logs recorded for this meeting.</td></tr>`;
          }
        }

        openModal('meetingDetailsModal');
      } else {
        showToast(data.error || 'Failed to retrieve meeting details', 'error');
      }
    } catch (err) {
      showToast('Error loading details. Check server connection.', 'error');
    }
  }

  // ------------------------------------------------------------------------
  // 15. Edit & Cancel Meeting
  // ------------------------------------------------------------------------
  function initEditMeeting() {
    const form = document.getElementById('editMeetingForm');
    if (!form) return;

    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      const roomId = document.getElementById('editRoomIdHidden').value;
      const title = document.getElementById('editTitleInput').value.trim();
      const date = document.getElementById('editDateInput').value;
      const startTime = document.getElementById('editStartTimeInput').value;
      const durationSelect = document.getElementById('editDurationSelect');
      const duration = durationSelect ? durationSelect.value : '30';
      const isUnlimited = duration === 'unlimited' || duration === '0';
      const durationMinutes = isUnlimited ? 0 : parseInt(duration, 10);
      const description = document.getElementById('editDescInput').value.trim();
      const passcode = '';

      const submitBtn = form.querySelector('button[type="submit"]');
      submitBtn.disabled = true;

      try {
        const res = await fetch(apiUrl('api/meetings.php?action=update'), {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            meetingId: roomId,
            title,
            date,
            startTime,
            durationMinutes,
            isUnlimited,
            description,
            passcode
          })
        });

        const data = await res.json();
        if (data.success) {
          closeModal('editMeetingModal');
          showToast('Meeting updated successfully!', 'success');
          loadUpcomingMeetings();
          loadMeetingHistory();
        } else {
          showToast(data.error || 'Failed to update meeting', 'error');
        }
      } catch (err) {
        showToast('Error updating meeting.', 'error');
      } finally {
        submitBtn.disabled = false;
      }
    });
  }

  async function openEditModal(roomId) {
    try {
      const res = await fetch(apiUrl(`api/meetings.php?action=details&id=${encodeURIComponent(roomId)}`));
      const data = await res.json();
      if (data.success && data.meeting) {
        const m = data.meeting;
        document.getElementById('editRoomIdHidden').value = m.id;
        document.getElementById('editTitleInput').value = m.display_title || m.room_name || '';
        document.getElementById('editDescInput').value = m.description || '';

        const editDurEl = document.getElementById('editDurationSelect');
        if (editDurEl) {
          if (!m.scheduled_end || m.is_unlimited || m.duration_minutes === 0) {
            editDurEl.value = 'unlimited';
          } else {
            editDurEl.value = '30';
          }
        }

        if (m.scheduled_start) {
          const parts = m.scheduled_start.split(' ');
          document.getElementById('editDateInput').value = parts[0];
          document.getElementById('editStartTimeInput').value = parts[1].slice(0, 5);
        }

        openModal('editMeetingModal');
      } else {
        showToast('Could not load meeting details for editing', 'error');
      }
    } catch (err) {
      showToast('Failed to open editor', 'error');
    }
  }

  async function cancelMeeting(roomId) {
    if (!confirm('Are you sure you want to cancel this meeting? Participants will be notified.')) {
      return;
    }

    try {
      const res = await fetch(apiUrl('api/meetings.php?action=cancel'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ meetingId: roomId })
      });

      const data = await res.json();
      if (data.success) {
        showToast('Meeting cancelled successfully.', 'success');
        loadUpcomingMeetings();
        loadMeetingHistory();
      } else {
        showToast(data.error || 'Failed to cancel meeting', 'error');
      }
    } catch (err) {
      showToast('Error cancelling meeting.', 'error');
    }
  }

  async function deleteMeeting(roomId) {
    if (!confirm('Are you sure you want to remove this meeting record from history?')) {
      return;
    }

    try {
      const res = await fetch(apiUrl('api/meetings.php?action=delete'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ meetingId: roomId })
      });

      const data = await res.json();
      if (data.success) {
        showToast('Meeting record removed from history.', 'success');
        loadUpcomingMeetings();
        loadMeetingHistory();
      } else {
        showToast(data.error || 'Failed to delete meeting', 'error');
      }
    } catch (err) {
      showToast('Error deleting meeting record.', 'error');
    }
  }

  async function clearHistory() {
    if (!confirm('Are you sure you want to clear cancelled and past meetings from history?')) {
      return;
    }

    try {
      const res = await fetch(apiUrl('api/meetings.php?action=clear_history'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' }
      });

      const data = await res.json();
      if (data.success) {
        showToast('Meeting history cleared.', 'success');
        loadMeetingHistory();
      } else {
        showToast(data.error || 'Failed to clear history', 'error');
      }
    } catch (err) {
      showToast('Error clearing meeting history.', 'error');
    }
  }

  // ------------------------------------------------------------------------
  // 16. Profile & Password Forms
  // ------------------------------------------------------------------------
  function initProfileModals() {
    const profileForm = document.getElementById('editProfileForm');
    if (profileForm) {
      profileForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const username = document.getElementById('profileUsernameInput').value.trim();
        const avatarUrl = document.getElementById('profileAvatarInput').value.trim();

        try {
          const res = await fetch(apiUrl('api/profile.php?action=update'), {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ username, avatar_url: avatarUrl })
          });
          const data = await res.json();
          if (data.success) {
            showToast('Profile updated!', 'success');
            closeModal('profileModal');
            document.querySelectorAll('.sidebar-user-name, .dropdown-user-name').forEach(el => el.textContent = username);
            document.querySelectorAll('.sidebar-avatar').forEach(el => el.textContent = username.charAt(0).toUpperCase());
          } else {
            showToast(data.error || 'Failed to update profile', 'error');
          }
        } catch (err) {
          showToast('Failed to update profile.', 'error');
        }
      });
    }

    const passwordForm = document.getElementById('changePasswordForm');
    if (passwordForm) {
      passwordForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const currentPassword = document.getElementById('pwdCurrentInput').value;
        const newPassword = document.getElementById('pwdNewInput').value;
        const confirmPassword = document.getElementById('pwdConfirmInput').value;

        if (newPassword !== confirmPassword) {
          showToast('New passwords do not match.', 'error');
          return;
        }

        try {
          const res = await fetch(apiUrl('api/profile.php?action=change_password'), {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ currentPassword, newPassword, confirmPassword })
          });
          const data = await res.json();
          if (data.success) {
            showToast('Password changed successfully!', 'success');
            closeModal('changePasswordModal');
            passwordForm.reset();
          } else {
            showToast(data.error || 'Failed to change password', 'error');
          }
        } catch (err) {
          showToast('Error changing password.', 'error');
        }
      });
    }
  }

  // ------------------------------------------------------------------------
  // 17. Background Heartbeat & Periodic Polling
  // ------------------------------------------------------------------------
  function initPresenceHeartbeat() {
    // 1. Touch presence every 45 seconds
    setInterval(() => {
      fetch(apiUrl('api/contacts.php?action=heartbeat'), { method: 'POST' }).catch(() => {});
    }, 45000);

    // Initial heartbeat
    fetch(apiUrl('api/contacts.php?action=heartbeat'), { method: 'POST' }).catch(() => {});

    // 2. Chat polling (Every 4s when on chat view, or 12s on other views for badge)
    setInterval(() => {
      if (state.activeTab === 'chat') {
        loadConversations();
        if (state.activeContact) {
          loadDirectMessages(state.activeContact.id);
        }
      } else {
        // Poll unread count for sidebar badge
        fetch(apiUrl('api/chat.php?action=unread_count'))
          .then(res => res.json())
          .then(data => {
            if (data.success) {
              updateUnreadBadges(data.total_unread || 0);
            }
          })
          .catch(() => {});
      }
    }, 6500);

    // 3. Meet upcoming refresh every 30s
    setInterval(() => {
      if (state.activeTab === 'meet') {
        loadUpcomingMeetings();
      }
    }, 30000);
  }

  // ------------------------------------------------------------------------
  // 18. Public Global Dashboard API (accessible by inline onclick handlers)
  // ------------------------------------------------------------------------
  window.vvaDashboard = {
    copyLink: copyToClipboard,
    setPage: (page) => {
      state.historyPage = page;
      loadMeetingHistory();
    },
    switchTab: switchTab,
    openJoinModal: openJoinModal,
    openNewChatModal: openNewChatModal,
    loadUpcomingMeetings: loadUpcomingMeetings,
    viewDetails: viewMeetingDetails,
    openEditModal: openEditModal,
    cancelMeeting: cancelMeeting,
    deleteMeeting: deleteMeeting,
    clearHistory: clearHistory,
    openProfileModal: () => openModal('profileModal'),
    openPasswordModal: () => openModal('changePasswordModal'),
    openAddAccountModal: openAddAccountModal,
    switchAccount: switchAccount
  };

  // ------------------------------------------------------------------------
  // 19. Initialize on DOM Ready
  // ------------------------------------------------------------------------
  document.addEventListener('DOMContentLoaded', () => {
    initClock();
    initProfileDropdown();
    initModals();
    initSidebarNavigation();
    initActionCards();
    initScheduleForm();
    initJoinForm();
    initChatComposer();
    initNewChatSearch();
    initPeopleFilters();
    initHistoryFilters();
    initEditMeeting();
    initProfileModals();
    initAddAccountForm();
    initPresenceHeartbeat();

    // Initial data fetch
    loadUpcomingMeetings();
    loadMeetingHistory();
    loadAuthenticatedAccounts();

    // Synchronize active session user to localStorage to ensure complete isolation
    if (state.user) {
      try {
        localStorage.setItem('meet_username', state.user.username);
        localStorage.setItem('meet_user_id', state.user.id);
        if (state.user.email) localStorage.setItem('meet_email', state.user.email);
      } catch (e) {}
    }
  });

})();
