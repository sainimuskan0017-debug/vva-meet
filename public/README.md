# VVA Meet 🎥

A production-ready, custom video conferencing platform powered by the **Jitsi Meet External API**, built with **vanilla HTML5, CSS3, modern JavaScript (ES6+), PHP (PDO)**, and **MySQL**.

Specifically engineered for **BigRock Linux Hosting (cPanel / Apache / PHP / MySQL)** — **100% pure PHP & MySQL with zero Node.js dependency**.

---

## 🌟 Key Features

### 1. Landing Page & Pre-Join Lobby (`/` or `index.php`)
- **Pre-Join Media Check**: Live video feed test and microphone volume meter driven by Web Audio API (`AnalyserNode`).
- **Pre-Mute Controls**: Toggle microphone and camera before entering the conference room.
- **Random Room Generator**: Generates human-friendly room slugs (e.g., `swift-falcon-428`, `cosmic-solaris-192`).
- **Instant Shareable Links**: One-click invite link copying.
- **Local Persistence**: Remembers display name and media preferences across sessions.
- **Database Status Badge**: Live link to diagnostic wizard (`install.php`).

### 2. Meeting Room Dashboard (`/room/:roomId` or `room.php?room=:roomId`)
- **Official Jitsi Meet Integration**:
  - Embedded enterprise-grade SFU conferencing powered by `JitsiMeetExternalAPI`.
  - Multi-party video & audio, adaptive resolution, tile view, and filmstrip.
  - Video streams run across Jitsi's global media network (zero server load on BigRock!).
- **Custom Floating Bottom Control Dock**:
  - 🎙️ **Microphone Toggle (`M`)**: Controls audio state with dock status badge.
  - 📹 **Camera Toggle (`V`)**: Controls video track state.
  - 🖥️ **Screen Sharing (`S`)**: Activates display sharing via Jitsi commands.
  - 👏 **Interactive Reactions**: Real-time emoji bursts (❤️, 👍, 👏, 🎉, 🔥, ✋) floating up on all screens.
  - 💬 **Persistent MySQL Chat Drawer (`C`)**: Persistent chat stored securely in MySQL with unread count badge.
  - 👥 **Participants Drawer**: Lists active attendees and session durations.
  - 🔗 **Copy Invite Link**: Instant clipboard copy with notification toast.
  - 🚪 **Leave Call**: Triggers clean departure, closes session in MySQL, and redirects home.
- **Native Web Audio Synthesizer**:
  - Chimes for user join, user leave, chat messages, and emoji reactions generated via Web Audio API.
- **Keyboard Shortcuts**: `M`, `V`, `S`, `C`, and `?`.

### 3. Backend & MySQL Relational Persistence (`api/`)
- **Relational Tables**:
  - `users`: `id`, `username`, `created_at`, `updated_at`
  - `rooms`: `id`, `room_name`, `created_at`
  - `messages`: `id`, `room_id`, `sender_name`, `message_text`, `sent_at`
  - `sessions`: `id`, `room_id`, `user_id`, `joined_at`, `left_at`
  - `participants`: `peer_id`, `room_id`, `user_id`, `username`, `audio_muted`, `video_off`, `is_screen_sharing`, `last_seen`
  - `reactions`: `id`, `room_id`, `sender_id`, `sender_name`, `emoji`, `created_at`
  - `signals`: `id`, `room_id`, `sender_id`, `sender_name`, `target_id`, `type`, `payload`, `created_at`
- **Real-Time Synchronization Engine**:
  - `js/realtime.js` + `api/sync.php`: Atomic, ultra-lightweight heartbeat polling (1.4s) and instant event delivery for chat, reactions, and presence.
- **REST & AJAX Endpoints**:
  - `GET /api/health.php`: Service health, PHP version, and database connectivity.
  - `POST /api/join.php`: User admission and session hydration.
  - `POST /api/leave.php`: Graceful exit and session cleanup.
  - `POST /api/sync.php`: Atomic heartbeat, chat polling, reactions, and presence.
  - `GET/POST /api/messages.php`: Chat history and persistent message sending.
  - `POST /api/send_reaction.php`: Emoji reactions broadcast.
  - `POST /api/media_toggle.php`: Microphone, camera, and screen sharing status sync.
  - `GET /api/participants.php`: Active in-room participants.
  - `GET /api/room_summary.php`: Room metadata, message count, and total sessions.
  - `POST /api/signal.php`: Fallback WebRTC mesh signaling exchange.

---

## 🚀 Quickstart for BigRock Hosting

### Step 1: Create Database in BigRock cPanel
1. In BigRock cPanel, go to **MySQL Database Wizard**.
2. Create a database (e.g. `youruser_vortexmeet`).
3. Create a user with password and grant **ALL PRIVILEGES**.

### Step 2: Upload Files to `public_html/`
Upload all project files to your cPanel `public_html/` directory:
- `index.php`, `room.php`, `config.php`, `database.php`, `install.php`, `schema.sql`, `.htaccess`, `api/`, `css/`, `js/`

### Step 3: Configure Database in `config.php`
Open `config.php` in cPanel File Manager and enter your database details:
```php
define('DB_HOST', 'localhost');
define('DB_PORT', 3306);
define('DB_NAME', 'youruser_vortexmeet');
define('DB_USER', 'youruser_meetuser');
define('DB_PASS', 'your_password');
```

### Step 4: 1-Click Database Setup
Open your browser and visit:
```
https://yourdomain.com/install.php
```
Click **"Initialize Database Tables (1-Click)"**.

### Step 5: Start Conferencing!
Go to `https://yourdomain.com/` and enjoy seamless HD video meetings!

---

## 🔒 Security
- All MySQL queries use **PDO Prepared Statements** for 100% SQL injection prevention.
- Apache `.htaccess` blocks direct browser access to `config.php`, `schema.sql`, and sensitive files.
