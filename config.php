<?php
/**
 * VVA Meet - Configuration File for BigRock Hosting
 * 
 * Instructions for BigRock cPanel:
 * 1. Log into your BigRock cPanel account (from your client dashboard).
 * 2. Go to "MySQL Database Wizard" or "MySQL Databases".
 * 3. Create a new Database (e.g. youruser_vortexmeet).
 * 4. Create a new Database User and secure password.
 * 5. Add the User to the Database with "ALL PRIVILEGES".
 * 6. Enter those database details below.
 */

// Database Host (BigRock cPanel almost always uses 'localhost' or '127.0.0.1')
define('DB_HOST', getenv('DB_HOST') ?: 'localhost');

// Database Port (Default MySQL port is 3306)
define('DB_PORT', getenv('DB_PORT') ?: 3306);

// Database Name (In cPanel, usually prefixed with your username: e.g. cpuser_vvameet)
define('DB_NAME', getenv('DB_NAME') ?: 'vva_meet');

// Database Username
define('DB_USER', getenv('DB_USER') ?: 'root');

// Database Password
define('DB_PASS', getenv('DB_PASS') !== false ? getenv('DB_PASS') : '');

// Database Charset
define('DB_CHARSET', 'utf8mb4');

// Default Timezone
date_default_timezone_set('UTC');

// Jitsi Meet Server Domain
// Default: 'meet.jit.si' (public free Jitsi service for development/testing)
// For Production with zero limits: Set to your self-hosted Jitsi domain (e.g. 'meet.yourcompany.com') or 8x8 JaaS domain
define('JITSI_DOMAIN', getenv('JITSI_DOMAIN') ?: 'meet.jit.si');

// Video Conference Engine:
// 'webrtc' = Built-in Native WebRTC Mesh (Unlimited Meeting Duration - 100% Free, Zero BigRock Server Load, No 8x8 login or 5-min timeout)
// 'jitsi'  = Jitsi Meet External API (Enterprise Cloud SFU video bridge via meet.jit.si)
define('CONFERENCE_ENGINE', getenv('CONFERENCE_ENGINE') ?: 'webrtc');

// Session configuration: Ensure sessions never time out during long video conferences
ini_set('session.gc_maxlifetime', 604800);
ini_set('session.cookie_lifetime', 604800);

// Environment ('development' displays error messages; 'production' suppresses them)
define('APP_ENV', 'development');

if (APP_ENV === 'development') {
    ini_set('display_errors', 1);
    ini_set('display_startup_errors', 1);
    error_reporting(E_ALL);
} else {
    ini_set('display_errors', 0);
    error_reporting(0);
}
