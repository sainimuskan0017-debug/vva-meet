# VVA Meet - BigRock Linux Hosting Deployment Guide 🚀

> **100% PHP & MySQL Compatible — No Node.js Required!**  
> Specially re-engineered for **BigRock Multi Domain Linux Hosting (cPanel / Apache / PHP / MySQL)**.

---

## 📋 Overview of Changes

BigRock shared Linux hosting is built on standard **Apache**, **PHP (7.4 / 8.x)**, and **MySQL / MariaDB**. It does **not** provide a persistent background Node.js daemon or open custom server ports (e.g. `:3000`).

To make VVA Meet work seamlessly on BigRock:
1. **Replaced Node.js & Express** with a clean, high-performance **PHP PDO backend** (`api/`).
2. **Replaced SQLite & Socket.io daemon** with **MySQL Database persistence** and a resilient, ultra-fast real-time synchronization engine (`js/realtime.js` + `api/sync.php`).
3. **Preserved HD Video Conferencing**: The **Jitsi Meet External API** handles audio/video streams on global media bridges, preventing server lag and bandwidth overuse on your shared hosting account.
4. **Added 1-Click Setup Wizard**: An automated browser-based diagnostic & table installer (`install.php`).

---

## 🗂️ Project Structure

```
d:/jitsi/
├── .htaccess             # Apache mod_rewrite rules (clean URLs & API routes)
├── config.php            # MySQL connection credentials
├── database.php          # PDO MySQL database layer & helper methods
├── schema.sql            # MySQL schema file for phpMyAdmin import
├── install.php           # 1-Click web installer & diagnostic checker
├── login.php             # Authentication portal (Sign In, Sign Up, Google Auth, Passcode Direct Join)
├── index.php             # Meeting lobby & media pre-check page (Protected - shows login first)
├── room.php              # Conference room with Jitsi, passcode lock & persistent chat
├── api/
│   ├── auth.php          # Sign in, sign up, Google/Gmail auth, session & logout
│   ├── health.php        # Service health & database connectivity
│   ├── join.php          # User registration, passcode verification & session join
│   ├── leave.php         # Clean departure & session closure
│   ├── sync.php          # Real-time heartbeat, chat & reaction sync
│   ├── messages.php      # Persistent chat GET/POST
│   ├── send_reaction.php # Real-time emoji bursts
│   ├── media_toggle.php  # Mic, camera & screen share state sync
│   ├── signal.php        # WebRTC mesh signaling fallback
│   ├── participants.php  # Active participants list
│   └── room_summary.php  # Room metadata & attendance stats
├── css/
│   ├── main.css          # Design system & tokens
│   ├── landing.css       # Lobby styles
│   └── room.css          # Meeting room & dock styles
└── js/
    ├── landing.js        # Lobby audio visualizer & pre-join controls
    ├── room.js           # Room controller & Jitsi sync
    ├── realtime.js       # Zero-dependency Socket.io replacement
    ├── sound.js          # Web Audio sound generator
    └── webrtc.js         # WebRTC mesh fallback
```

---

## 🚀 Step-by-Step BigRock Deployment

### Step 1: Create MySQL Database in BigRock cPanel

1. Log into your **BigRock Account Dashboard**.
2. Go to **Orders** &rarr; Select your **Multi Domain Linux Hosting**.
3. Click the **cPanel** icon (marked `cp` in your dashboard).
4. In cPanel, navigate to the **Databases** section and click **MySQL Database Wizard**.
5. **Step 1: Create A Database**  
   - Enter a name, e.g., `vortexmeet` (full name will look like `youruser_vortexmeet`).  
   - Click **Next Step**.
6. **Step 2: Create Database Users**  
   - Enter a username, e.g., `meetuser` (full username will look like `youruser_meetuser`).  
   - Enter and confirm a strong password (keep this safe!).  
   - Click **Create User**.
7. **Step 3: Add User to the Database**  
   - Check the box **ALL PRIVILEGES**.  
   - Click **Make Changes**.

---

### Step 2: Upload Files to BigRock

1. In cPanel, open **File Manager**.
2. Navigate to `public_html/` (or your addon domain's directory).
3. Upload all the files from this folder (`index.php`, `room.php`, `config.php`, `database.php`, `install.php`, `schema.sql`, `.htaccess`, `api/`, `css/`, `js/`).
   > **Tip**: You can select all files, create a `.zip` on your computer, upload the `.zip` to `public_html`, and click **Extract** in cPanel File Manager.

---

### Step 3: Configure Database Credentials in `config.php`

1. In cPanel File Manager, right-click `config.php` and click **Edit**.
2. Update the database values with the details created in Step 1:

```php
// Database Host (BigRock cPanel uses 'localhost')
define('DB_HOST', 'localhost');

// Database Port
define('DB_PORT', 3306);

// Your full database name from cPanel
define('DB_NAME', 'youruser_vortexmeet');

// Your full database username from cPanel
define('DB_USER', 'youruser_meetuser');

// Your database user password
define('DB_PASS', 'your_secure_password_here');
```

3. Click **Save Changes**.

---

### Step 4: Initialize MySQL Database Tables

You have two simple ways to set up the database tables:

#### Option A: Automated Web Wizard (Recommended)
1. Open your browser and visit:  
   `https://yourdomain.com/install.php`
2. The wizard will automatically test your MySQL connection.
3. Click **"Initialize Database Tables (1-Click)"**.
4. The wizard will create all 7 MySQL tables with proper indexes:
   - `users`
   - `rooms`
   - `messages`
   - `sessions`
   - `participants`
   - `reactions`
   - `signals`
5. Click **"Launch VVA Meet Conference"**.

#### Option B: Manual Import via phpMyAdmin
1. In cPanel, click **phpMyAdmin**.
2. Click on your database (`youruser_vortexmeet`) in the left sidebar.
3. Click the **Import** tab at the top.
4. Click **Choose File** and select `schema.sql`.
5. Click **Import** at the bottom.

---

### Step 5: Test & Use Your Video Conferencing Platform

1. Navigate to:  
   `https://yourdomain.com/`
2. Test your camera and microphone in the pre-join lobby.
3. Enter your display name and click **Enter Meeting** (or generate a random room code).
4. Inside the meeting:
   - **Video/Audio**: Connects seamlessly via Jitsi Meet.
   - **Chat Drawer**: Messages persist in your BigRock MySQL database.
   - **Reactions**: Send emoji reactions (👏, ❤️, 👍, 🎉, 🔥, ✋) floating in real-time.
   - **Share**: Click the room title badge or control dock button to copy the invite link.

---

## ⏱️ Unlimited Video Conferencing (No Time Limit)

By default, VVA Meet runs on our **Native WebRTC Conferencing Engine**, engineered for **zero time limits**:
- **No 5-Minute Disconnect**: Avoids the 5-minute embedded iframe cutoff enforced on the public `meet.jit.si` service.
- **Runs Indefinitely**: Calls can run for 1 hour, 5 hours, or 24+ hours without interruption.
- **100% Peer-to-Peer & BigRock Hosted**: Media streams connect via Google STUN servers with signaling directly on your BigRock MySQL database.
- **Configurable in `config.php`**:
  ```php
  // 'webrtc' = 100% Unlimited Native Mode (No time limits, no 3rd party disconnects)
  // 'jitsi'  = Jitsi Meet External API (custom or self-hosted server)
  define('CONFERENCE_ENGINE', 'webrtc');
  ```
- **Live In-Call Switcher**: Click the **⚡ Engine** badge in the meeting room header at any time to toggle between Unlimited Mode and Jitsi Meet.
- **Persistent Sessions**: PHP sessions and heartbeat polling are configured to stay active for up to 7 days continuously while in a meeting.

---

## 🔒 Security Best Practices on BigRock

- Once setup is complete, you can optionally delete or rename `install.php`.
- The included `.htaccess` file prevents visitors from directly downloading `config.php`, `schema.sql`, or viewing raw directory listings.
- All database queries use **PDO Prepared Statements**, guaranteeing full protection against SQL injection attacks.
