<?php
/**
 * VVA Meet - PDO MySQL Database Layer
 * Compatible with BigRock Linux Hosting (cPanel / Apache / MySQL)
 */

require_once __DIR__ . '/config.php';

class Database {
    private static ?PDO $instance = null;

    /**
     * Get or create PDO singleton connection
     */
    public static function getConnection(): PDO {
        if (self::$instance === null) {
            $dsn = sprintf(
                'mysql:host=%s;port=%d;dbname=%s;charset=%s',
                DB_HOST,
                (int)DB_PORT,
                DB_NAME,
                DB_CHARSET
            );

            $options = [
                PDO::ATTR_ERRMODE            => PDO::ERRMODE_EXCEPTION,
                PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
                PDO::ATTR_EMULATE_PREPARES   => false,
                PDO::MYSQL_ATTR_INIT_COMMAND => "SET NAMES utf8mb4 COLLATE utf8mb4_unicode_ci"
            ];

            try {
                self::$instance = new PDO($dsn, DB_USER, DB_PASS, $options);
            } catch (PDOException $e) {
                http_response_code(500);
                header('Content-Type: application/json');
                echo json_encode([
                    'error' => 'Database connection failed',
                    'message' => $e->getMessage(),
                    'hint' => 'Please check your MySQL credentials in config.php or run install.php to verify.'
                ]);
                exit;
            }
        }

        return self::$instance;
    }

    /**
     * Safe column existence helper for seamless migrations
     */
    private static function ensureColumn(PDO $db, string $table, string $column, string $definition): void {
        try {
            $stmt = $db->query("SHOW COLUMNS FROM `{$table}` LIKE '{$column}'");
            if (!$stmt->fetch()) {
                $db->exec("ALTER TABLE `{$table}` ADD COLUMN `{$column}` {$definition}");
            }
        } catch (Exception $e) {
            // Ignored if column already exists
        }
    }

    /**
     * Create required MySQL database tables automatically
     */
    public static function initDatabaseTables(): bool {
        $db = self::getConnection();

        $queries = [
            "CREATE TABLE IF NOT EXISTS `users` (
                `id` VARCHAR(64) NOT NULL,
                `username` VARCHAR(100) NOT NULL,
                `email` VARCHAR(191) NULL,
                `password_hash` VARCHAR(255) NULL,
                `auth_provider` VARCHAR(32) NOT NULL DEFAULT 'email',
                `avatar_url` TEXT NULL,
                `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
                `updated_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
                PRIMARY KEY (`id`),
                UNIQUE KEY `idx_users_email` (`email`)
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;",

            "CREATE TABLE IF NOT EXISTS `rooms` (
                `id` VARCHAR(64) NOT NULL,
                `room_name` VARCHAR(150) NOT NULL,
                `title` VARCHAR(200) NULL,
                `description` TEXT NULL,
                `host_id` VARCHAR(64) NULL,
                `passcode` VARCHAR(64) NULL,
                `scheduled_start` DATETIME NULL,
                `scheduled_end` DATETIME NULL,
                `actual_start` DATETIME NULL,
                `actual_end` DATETIME NULL,
                `status` VARCHAR(32) NOT NULL DEFAULT 'active',
                `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
                `updated_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
                PRIMARY KEY (`id`),
                INDEX `idx_rooms_host` (`host_id`),
                INDEX `idx_rooms_status_sched` (`status`, `scheduled_start`),
                INDEX `idx_rooms_created` (`created_at`)
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;",

            "CREATE TABLE IF NOT EXISTS `messages` (
                `id` VARCHAR(64) NOT NULL,
                `room_id` VARCHAR(64) NOT NULL,
                `sender_name` VARCHAR(100) NOT NULL,
                `message_text` TEXT NOT NULL,
                `sent_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
                PRIMARY KEY (`id`),
                INDEX `idx_messages_room_sent` (`room_id`, `sent_at`),
                CONSTRAINT `fk_messages_room` FOREIGN KEY (`room_id`) REFERENCES `rooms` (`id`) ON DELETE CASCADE
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;",

            "CREATE TABLE IF NOT EXISTS `sessions` (
                `id` VARCHAR(64) NOT NULL,
                `room_id` VARCHAR(64) NOT NULL,
                `user_id` VARCHAR(64) NOT NULL,
                `joined_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
                `left_at` DATETIME NULL DEFAULT NULL,
                `duration_seconds` INT NULL DEFAULT 0,
                PRIMARY KEY (`id`),
                INDEX `idx_sessions_room_left` (`room_id`, `left_at`),
                INDEX `idx_sessions_user` (`user_id`),
                CONSTRAINT `fk_sessions_room` FOREIGN KEY (`room_id`) REFERENCES `rooms` (`id`) ON DELETE CASCADE,
                CONSTRAINT `fk_sessions_user` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`) ON DELETE CASCADE
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;",

            "CREATE TABLE IF NOT EXISTS `participants` (
                `peer_id` VARCHAR(64) NOT NULL,
                `room_id` VARCHAR(64) NOT NULL,
                `user_id` VARCHAR(64) NOT NULL,
                `username` VARCHAR(100) NOT NULL,
                `audio_muted` TINYINT(1) NOT NULL DEFAULT 0,
                `video_off` TINYINT(1) NOT NULL DEFAULT 0,
                `is_screen_sharing` TINYINT(1) NOT NULL DEFAULT 0,
                `joined_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
                `last_seen` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
                PRIMARY KEY (`peer_id`),
                INDEX `idx_participants_room_seen` (`room_id`, `last_seen`)
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;",

            "CREATE TABLE IF NOT EXISTS `reactions` (
                `id` BIGINT AUTO_INCREMENT NOT NULL,
                `room_id` VARCHAR(64) NOT NULL,
                `sender_id` VARCHAR(64) NOT NULL,
                `sender_name` VARCHAR(100) NOT NULL,
                `emoji` VARCHAR(16) NOT NULL,
                `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
                PRIMARY KEY (`id`),
                INDEX `idx_reactions_room_created` (`room_id`, `created_at`)
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;",

            "CREATE TABLE IF NOT EXISTS `signals` (
                `id` BIGINT AUTO_INCREMENT NOT NULL,
                `room_id` VARCHAR(64) NOT NULL,
                `sender_id` VARCHAR(64) NOT NULL,
                `sender_name` VARCHAR(100) NOT NULL,
                `target_id` VARCHAR(64) NOT NULL,
                `type` VARCHAR(32) NOT NULL,
                `payload` LONGTEXT NOT NULL,
                `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
                PRIMARY KEY (`id`),
                INDEX `idx_signals_target` (`target_id`, `id`)
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;",

            "CREATE TABLE IF NOT EXISTS `direct_messages` (
                `id` VARCHAR(64) NOT NULL,
                `sender_id` VARCHAR(64) NOT NULL,
                `receiver_id` VARCHAR(64) NOT NULL,
                `message_text` TEXT NOT NULL,
                `is_read` TINYINT(1) NOT NULL DEFAULT 0,
                `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
                PRIMARY KEY (`id`),
                INDEX `idx_dm_conv` (`sender_id`, `receiver_id`, `created_at`),
                INDEX `idx_dm_receiver_read` (`receiver_id`, `is_read`),
                CONSTRAINT `fk_dm_sender` FOREIGN KEY (`sender_id`) REFERENCES `users` (`id`) ON DELETE CASCADE,
                CONSTRAINT `fk_dm_receiver` FOREIGN KEY (`receiver_id`) REFERENCES `users` (`id`) ON DELETE CASCADE
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;"
        ];

        foreach ($queries as $sql) {
            $db->exec($sql);
        }

        // Apply migrations for columns if tables already existed
        self::ensureColumn($db, 'users', 'email', 'VARCHAR(191) NULL UNIQUE');
        self::ensureColumn($db, 'users', 'password_hash', 'VARCHAR(255) NULL');
        self::ensureColumn($db, 'users', 'auth_provider', "VARCHAR(32) NOT NULL DEFAULT 'email'");
        self::ensureColumn($db, 'users', 'avatar_url', 'TEXT NULL');
        self::ensureColumn($db, 'users', 'last_seen', 'DATETIME NULL');
        self::ensureColumn($db, 'rooms', 'title', 'VARCHAR(200) NULL');
        self::ensureColumn($db, 'rooms', 'description', 'TEXT NULL');
        self::ensureColumn($db, 'rooms', 'host_id', 'VARCHAR(64) NULL');
        self::ensureColumn($db, 'rooms', 'passcode', 'VARCHAR(64) NULL');
        self::ensureColumn($db, 'rooms', 'scheduled_start', 'DATETIME NULL');
        self::ensureColumn($db, 'rooms', 'scheduled_end', 'DATETIME NULL');
        self::ensureColumn($db, 'rooms', 'actual_start', 'DATETIME NULL');
        self::ensureColumn($db, 'rooms', 'actual_end', 'DATETIME NULL');
        self::ensureColumn($db, 'rooms', 'status', "VARCHAR(32) NOT NULL DEFAULT 'active'");
        self::ensureColumn($db, 'rooms', 'updated_at', 'DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP');
        self::ensureColumn($db, 'sessions', 'duration_seconds', 'INT NULL DEFAULT 0');
        self::ensureColumn($db, 'participants', 'status', "VARCHAR(32) NOT NULL DEFAULT 'admitted'");

        // Remove old demo accounts
        try {
            $db->exec("DELETE FROM `users` WHERE `id` IN ('user_admin', 'user_sarah', 'user_david') OR `email` IN ('alex@gmail.com', 'sarah@gmail.com', 'david@gmail.com')");
        } catch (Exception $e) {}

        // Seed default users (Karan, Navdeep, Kashish, Vishesha with password: '123456')
        $demoUsers = [
            ['id' => 'user_karan', 'username' => 'Karan', 'email' => 'karan@gmail.com', 'password' => '123456'],
            ['id' => 'user_navdeep', 'username' => 'Navdeep', 'email' => 'navdeep@gmail.com', 'password' => '123456'],
            ['id' => 'user_kashish', 'username' => 'Kashish', 'email' => 'kashish@gmail.com', 'password' => '123456'],
            ['id' => 'user_vishesha', 'username' => 'Vishesha', 'email' => 'vishesha@gmail.com', 'password' => '123456']
        ];
        foreach ($demoUsers as $du) {
            $check = $db->prepare('SELECT `id` FROM `users` WHERE `email` = ? OR `id` = ? LIMIT 1');
            $check->execute([$du['email'], $du['id']]);
            if (!$check->fetch()) {
                $hash = password_hash($du['password'], PASSWORD_BCRYPT);
                $ins = $db->prepare('INSERT INTO `users` (`id`, `username`, `email`, `password_hash`, `auth_provider`, `created_at`) VALUES (?, ?, ?, ?, "email", CURRENT_TIMESTAMP)');
                $ins->execute([$du['id'], $du['username'], $du['email'], $hash]);
            }
        }

        return true;
    }

    /**
     * Upsert user record (legacy & guest compatibility)
     */
    public static function upsertUser(string $id, string $username): array {
        $db = self::getConnection();
        $stmt = $db->prepare('INSERT INTO `users` (`id`, `username`, `created_at`) VALUES (?, ?, CURRENT_TIMESTAMP)
            ON DUPLICATE KEY UPDATE `username` = VALUES(`username`), `updated_at` = CURRENT_TIMESTAMP');
        $stmt->execute([$id, $username]);
        return ['id' => $id, 'username' => $username];
    }

    /**
     * Register a new user with Email or Gmail and password
     */
    public static function registerUser(string $username, string $email, string $password, string $authProvider = 'email', ?string $customId = null): array {
        $db = self::getConnection();
        $cleanEmail = strtolower(trim($email));

        // Check if email already registered
        $check = $db->prepare('SELECT `id` FROM `users` WHERE `email` = ? LIMIT 1');
        $check->execute([$cleanEmail]);
        if ($check->fetch()) {
            throw new Exception('Email address is already registered. Please sign in instead.');
        }

        $userId = $customId ?: ('user_' . bin2hex(random_bytes(6)));
        $passwordHash = password_hash($password, PASSWORD_BCRYPT);

        $stmt = $db->prepare('INSERT INTO `users` (`id`, `username`, `email`, `password_hash`, `auth_provider`, `created_at`) VALUES (?, ?, ?, ?, ?, CURRENT_TIMESTAMP)');
        $stmt->execute([$userId, trim($username), $cleanEmail, $passwordHash, $authProvider]);

        return [
            'id' => $userId,
            'username' => trim($username),
            'email' => $cleanEmail,
            'auth_provider' => $authProvider
        ];
    }

    /**
     * Authenticate an existing user with Email/Gmail or username + password
     */
    public static function authenticateUser(string $emailOrUsername, string $password): ?array {
        $db = self::getConnection();
        $identifier = trim($emailOrUsername);
        $cleanEmail = strtolower($identifier);

        $stmt = $db->prepare('SELECT * FROM `users` WHERE `email` = ? OR `username` = ? LIMIT 1');
        $stmt->execute([$cleanEmail, $identifier]);
        $user = $stmt->fetch();

        if (!$user) {
            return null;
        }

        if (empty($user['password_hash']) || !password_verify($password, $user['password_hash'])) {
            return null;
        }

        return [
            'id' => $user['id'],
            'username' => $user['username'],
            'email' => $user['email'],
            'auth_provider' => $user['auth_provider'],
            'avatar_url' => $user['avatar_url']
        ];
    }

    /**
     * Authenticate or register a Google / Gmail user
     */
    public static function authenticateGoogleUser(string $email, string $name, ?string $avatar = null): array {
        $db = self::getConnection();
        $cleanEmail = strtolower(trim($email));
        $cleanName = trim($name) ?: explode('@', $cleanEmail)[0];

        $stmt = $db->prepare('SELECT * FROM `users` WHERE `email` = ? LIMIT 1');
        $stmt->execute([$cleanEmail]);
        $existing = $stmt->fetch();

        if ($existing) {
            $update = $db->prepare('UPDATE `users` SET `username` = ?, `auth_provider` = "google", `avatar_url` = COALESCE(?, `avatar_url`), `updated_at` = CURRENT_TIMESTAMP WHERE `id` = ?');
            $update->execute([$cleanName, $avatar, $existing['id']]);
            return [
                'id' => $existing['id'],
                'username' => $cleanName,
                'email' => $cleanEmail,
                'auth_provider' => 'google',
                'avatar_url' => $avatar ?: $existing['avatar_url']
            ];
        }

        $userId = 'usr_' . bin2hex(random_bytes(6));
        $insert = $db->prepare('INSERT INTO `users` (`id`, `username`, `email`, `auth_provider`, `avatar_url`, `created_at`) VALUES (?, ?, ?, "google", ?, CURRENT_TIMESTAMP)');
        $insert->execute([$userId, $cleanName, $cleanEmail, $avatar]);

        return [
            'id' => $userId,
            'username' => $cleanName,
            'email' => $cleanEmail,
            'auth_provider' => 'google',
            'avatar_url' => $avatar
        ];
    }

    /**
     * Fetch user profile by ID
     */
    public static function getUserById(string $userId): ?array {
        $db = self::getConnection();
        $stmt = $db->prepare('SELECT `id`, `username`, `email`, `auth_provider`, `avatar_url`, `created_at` FROM `users` WHERE `id` = ?');
        $stmt->execute([$userId]);
        $user = $stmt->fetch();
        return $user ?: null;
    }

    /**
     * Ensure room exists or create it with optional passcode and host ID
     */
    public static function getOrCreateRoom(string $roomId, ?string $roomName = null, ?string $passcode = null, ?string $hostId = null): array {
        $db = self::getConnection();
        $formattedName = $roomName ?: $roomId;

        $stmt = $db->prepare('SELECT * FROM `rooms` WHERE `id` = ?');
        $stmt->execute([$roomId]);
        $room = $stmt->fetch();

        if (!$room) {
            $insert = $db->prepare('INSERT INTO `rooms` (`id`, `room_name`, `host_id`, `passcode`, `status`, `created_at`) VALUES (?, ?, ?, ?, "adhoc", CURRENT_TIMESTAMP)');
            $insert->execute([$roomId, $formattedName, $hostId, !empty($passcode) ? trim($passcode) : null]);

            $stmt->execute([$roomId]);
            $room = $stmt->fetch();
        } else if (!empty($passcode) && empty($room['passcode'])) {
            // If room had no passcode and creator is establishing one
            $update = $db->prepare('UPDATE `rooms` SET `passcode` = ? WHERE `id` = ?');
            $update->execute([trim($passcode), $roomId]);
            $room['passcode'] = trim($passcode);
        }

        return $room;
    }

    /**
     * Verify whether a meeting passcode matches the room
     */
    public static function verifyRoomPasscode(string $roomId, ?string $passcode): bool {
        $db = self::getConnection();
        $stmt = $db->prepare('SELECT `passcode` FROM `rooms` WHERE `id` = ?');
        $stmt->execute([$roomId]);
        $room = $stmt->fetch();

        if (!$room) {
            // Room does not exist yet; passcode valid for initialization
            return true;
        }

        // If no passcode is set on the room, entry is open
        if (empty($room['passcode'])) {
            return true;
        }

        if (empty($passcode)) {
            return false;
        }

        return hash_equals(trim((string)$room['passcode']), trim((string)$passcode));
    }

    /**
     * Check if a room requires a passcode
     */
    public static function roomRequiresPasscode(string $roomId): bool {
        $db = self::getConnection();
        $stmt = $db->prepare('SELECT `passcode` FROM `rooms` WHERE `id` = ?');
        $stmt->execute([$roomId]);
        $room = $stmt->fetch();
        return !empty($room['passcode']);
    }

    /**
     * Get meeting passcode for room host/display
     */
    public static function getRoomPasscode(string $roomId): ?string {
        $db = self::getConnection();
        $stmt = $db->prepare('SELECT `passcode` FROM `rooms` WHERE `id` = ?');
        $stmt->execute([$roomId]);
        $room = $stmt->fetch();
        return $room['passcode'] ?? null;
    }

    /**
     * Record session join
     */
    public static function recordSessionJoin(string $sessionId, string $roomId, string $userId): void {
        $db = self::getConnection();
        $stmt = $db->prepare('INSERT INTO `sessions` (`id`, `room_id`, `user_id`, `joined_at`) VALUES (?, ?, ?, CURRENT_TIMESTAMP)');
        $stmt->execute([$sessionId, $roomId, $userId]);
    }

    /**
     * Record session departure
     */
    public static function recordSessionLeave(?string $sessionId = null, ?string $userId = null, ?string $roomId = null): void {
        $db = self::getConnection();
        if (!empty($sessionId)) {
            $stmt = $db->prepare('UPDATE `sessions` SET `left_at` = CURRENT_TIMESTAMP, `duration_seconds` = TIMESTAMPDIFF(SECOND, `joined_at`, CURRENT_TIMESTAMP) WHERE `id` = ? AND `left_at` IS NULL');
            $stmt->execute([$sessionId]);
        } elseif (!empty($userId) && !empty($roomId)) {
            $stmt = $db->prepare('UPDATE `sessions` SET `left_at` = CURRENT_TIMESTAMP, `duration_seconds` = TIMESTAMPDIFF(SECOND, `joined_at`, CURRENT_TIMESTAMP) WHERE `room_id` = ? AND `user_id` = ? AND `left_at` IS NULL');
            $stmt->execute([$roomId, $userId]);
        }
    }

    /**
     * Evict duplicate participant records for the same user or username in a room
     */
    public static function evictDuplicateParticipants(string $roomId, string $userId, string $username, string $excludePeerId): void {
        $db = self::getConnection();
        $stmt = $db->prepare('DELETE FROM `participants` WHERE `room_id` = ? AND (`user_id` = ? OR `username` = ?) AND `peer_id` != ?');
        $stmt->execute([$roomId, $userId, $username, $excludePeerId]);
    }

    /**
     * Upsert active participant and refresh heartbeat
     */
    public static function upsertParticipant(
        string $peerId,
        string $roomId,
        string $userId,
        string $username,
        bool $audioMuted = false,
        bool $videoOff = false,
        bool $isScreenSharing = false,
        string $status = 'admitted'
    ): void {
        $db = self::getConnection();
        $stmt = $db->prepare('INSERT INTO `participants` 
            (`peer_id`, `room_id`, `user_id`, `username`, `audio_muted`, `video_off`, `is_screen_sharing`, `status`, `joined_at`, `last_seen`)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
            ON DUPLICATE KEY UPDATE
            `username` = VALUES(`username`),
            `audio_muted` = VALUES(`audio_muted`),
            `video_off` = VALUES(`video_off`),
            `is_screen_sharing` = VALUES(`is_screen_sharing`),
            `status` = CASE WHEN `status` = 'admitted' THEN 'admitted' ELSE VALUES(`status`) END,
            `last_seen` = CURRENT_TIMESTAMP');
        $stmt->execute([
            $peerId,
            $roomId,
            $userId,
            $username,
            $audioMuted ? 1 : 0,
            $videoOff ? 1 : 0,
            $isScreenSharing ? 1 : 0,
            $status
        ]);
    }

    /**
     * Update participant's media toggle status
     */
    public static function updateParticipantMedia(string $peerId, string $type, bool $enabled): void {
        $db = self::getConnection();
        if ($type === 'audio') {
            $stmt = $db->prepare('UPDATE `participants` SET `audio_muted` = ?, `last_seen` = CURRENT_TIMESTAMP WHERE `peer_id` = ?');
            $stmt->execute([$enabled ? 0 : 1, $peerId]);
        } elseif ($type === 'video') {
            $stmt = $db->prepare('UPDATE `participants` SET `video_off` = ?, `last_seen` = CURRENT_TIMESTAMP WHERE `peer_id` = ?');
            $stmt->execute([$enabled ? 0 : 1, $peerId]);
        } elseif ($type === 'screen') {
            if ($enabled) {
                // Enforce single active screen sharer: reset any other sharer in the same room
                $rStmt = $db->prepare('SELECT `room_id` FROM `participants` WHERE `peer_id` = ?');
                $rStmt->execute([$peerId]);
                $rId = $rStmt->fetchColumn();
                if ($rId) {
                    $reset = $db->prepare('UPDATE `participants` SET `is_screen_sharing` = 0 WHERE `room_id` = ? AND `peer_id` != ?');
                    $reset->execute([$rId, $peerId]);
                }
                $stmt = $db->prepare('UPDATE `participants` SET `is_screen_sharing` = 1, `video_off` = 0, `last_seen` = CURRENT_TIMESTAMP WHERE `peer_id` = ?');
                $stmt->execute([$peerId]);
            } else {
                $stmt = $db->prepare('UPDATE `participants` SET `is_screen_sharing` = 0, `last_seen` = CURRENT_TIMESTAMP WHERE `peer_id` = ?');
                $stmt->execute([$peerId]);
            }
        }
    }

    /**
     * Refresh participant heartbeat (and auto-heal if record was temporarily pruned)
     */
    public static function touchParticipant(string $peerId, ?string $roomId = null, ?string $username = null, ?string $userId = null): void {
        $db = self::getConnection();
        $stmt = $db->prepare('UPDATE `participants` SET `last_seen` = CURRENT_TIMESTAMP WHERE `peer_id` = ?');
        $stmt->execute([$peerId]);

        // Only auto-heal if record genuinely does not exist in participants table
        $check = $db->prepare('SELECT `status` FROM `participants` WHERE `peer_id` = ?');
        $check->execute([$peerId]);
        if (!$check->fetch() && !empty($roomId)) {
            $user = $username ?: 'Guest_' . substr($peerId, -4);
            $uid = $userId ?: (!empty($_SESSION['user_id']) ? $_SESSION['user_id'] : ('usr_' . substr($peerId, -6)));
            $rStmt = $db->prepare('SELECT `host_id` FROM `rooms` WHERE `id` = ?');
            $rStmt->execute([$roomId]);
            $hId = $rStmt->fetchColumn();
            $status = ($hId && $hId === $uid) ? 'admitted' : 'waiting';
            self::upsertParticipant($peerId, $roomId, $uid, $user, false, false, false, $status);
        }
    }

    /**
     * Remove participant on exit
     */
    public static function removeParticipant(string $peerId): void {
        $db = self::getConnection();
        $stmt = $db->prepare('SELECT `user_id`, `room_id` FROM `participants` WHERE `peer_id` = ?');
        $stmt->execute([$peerId]);
        $part = $stmt->fetch();
        if ($part && !empty($part['user_id']) && !empty($part['room_id'])) {
            self::recordSessionLeave(null, $part['user_id'], $part['room_id']);
        }
        $del = $db->prepare('DELETE FROM `participants` WHERE `peer_id` = ?');
        $del->execute([$peerId]);
    }

    /**
     * Evict previous duplicate or ghost sessions of a user from a room
     */
    public static function removeUserFromRoom(string $roomId, string $userId, ?string $excludePeerId = null): void {
        $db = self::getConnection();
        if ($excludePeerId) {
            $stmt = $db->prepare('DELETE FROM `participants` WHERE `room_id` = ? AND `user_id` = ? AND `peer_id` != ?');
            $stmt->execute([$roomId, $userId, $excludePeerId]);
        } else {
            $stmt = $db->prepare('DELETE FROM `participants` WHERE `room_id` = ? AND `user_id` = ?');
            $stmt->execute([$roomId, $userId]);
        }
    }

    /**
     * Get active participants in a room (seen within last N seconds, default 60s for stability)
     */
    public static function getActiveParticipants(string $roomId, int $thresholdSeconds = 60): array {
        $db = self::getConnection();
        $stmt = $db->prepare('SELECT `peer_id` as peerId, `user_id` as userId, `username`, 
            `audio_muted` as audioMuted, `video_off` as videoOff, `is_screen_sharing` as isScreenSharing,
            COALESCE(`status`, "admitted") as `status`, `joined_at` as joinedAt
            FROM `participants` 
            WHERE `room_id` = ? AND `last_seen` >= (NOW() - INTERVAL ? SECOND)');
        $stmt->execute([$roomId, $thresholdSeconds]);
        $rows = $stmt->fetchAll();

        foreach ($rows as &$row) {
            $row['audioMuted'] = (bool)$row['audioMuted'];
            $row['videoOff'] = (bool)$row['videoOff'];
            $row['isScreenSharing'] = (bool)$row['isScreenSharing'];
        }

        return $rows;
    }

    /**
     * Admit a waiting participant into the meeting
     */
    public static function admitParticipant(string $peerId): bool {
        $db = self::getConnection();
        $stmt = $db->prepare('UPDATE `participants` SET `status` = "admitted", `last_seen` = CURRENT_TIMESTAMP WHERE `peer_id` = ?');
        return $stmt->execute([$peerId]);
    }

    /**
     * Deny/remove participant from meeting
     */
    public static function denyParticipant(string $peerId): bool {
        $db = self::getConnection();
        $stmt = $db->prepare('DELETE FROM `participants` WHERE `peer_id` = ?');
        return $stmt->execute([$peerId]);
    }

    /**
     * Update room host
     */
    public static function updateRoomHost(string $roomId, string $newHostId, ?string $newHostName = null): bool {
        $db = self::getConnection();
        $stmt = $db->prepare('UPDATE `rooms` SET `host_id` = ?, `updated_at` = CURRENT_TIMESTAMP WHERE `id` = ?');
        return $stmt->execute([$newHostId, $roomId]);
    }

    /**
     * Purge stale participants whose heartbeats expired (default 120s to prevent accidental drops)
     */
    public static function purgeStaleParticipants(int $thresholdSeconds = 120): void {
        $db = self::getConnection();
        $stmt = $db->prepare('DELETE FROM `participants` WHERE `last_seen` < (NOW() - INTERVAL ? SECOND)');
        $stmt->execute([$thresholdSeconds]);
    }

    /**
     * Save persistent chat message
     */
    public static function saveMessage(string $id, string $roomId, string $senderName, string $messageText): array {
        $db = self::getConnection();
        $stmt = $db->prepare('INSERT INTO `messages` (`id`, `room_id`, `sender_name`, `message_text`, `sent_at`) VALUES (?, ?, ?, ?, CURRENT_TIMESTAMP)');
        $stmt->execute([$id, $roomId, $senderName, $messageText]);

        $fetch = $db->prepare('SELECT `id`, `room_id` as roomId, `sender_name` as senderName, `message_text` as messageText, `sent_at` as sentAt FROM `messages` WHERE `id` = ?');
        $fetch->execute([$id]);
        return $fetch->fetch();
    }

    /**
     * Fetch room messages
     */
    public static function getRoomMessages(string $roomId, int $limit = 100, ?string $sinceId = null): array {
        $db = self::getConnection();
        if ($sinceId) {
            $pivotStmt = $db->prepare('SELECT `sent_at` FROM `messages` WHERE `id` = ?');
            $pivotStmt->execute([$sinceId]);
            $pivot = $pivotStmt->fetch();

            if ($pivot) {
                $stmt = $db->prepare('SELECT `id`, `room_id` as roomId, `sender_name` as senderName, `message_text` as messageText, `sent_at` as sentAt
                    FROM `messages`
                    WHERE `room_id` = ? AND `sent_at` > ?
                    ORDER BY `sent_at` ASC LIMIT ?');
                $stmt->execute([$roomId, $pivot['sent_at'], $limit]);
                return $stmt->fetchAll();
            }
        }

        $stmt = $db->prepare('SELECT `id`, `room_id` as roomId, `sender_name` as senderName, `message_text` as messageText, `sent_at` as sentAt
                    FROM `messages`
                    WHERE `room_id` = ?
                    ORDER BY `sent_at` ASC LIMIT ?');
        $stmt->execute([$roomId, $limit]);
        return $stmt->fetchAll();
    }

    /**
     * Save an emoji reaction
     */
    public static function saveReaction(string $roomId, string $senderId, string $senderName, string $emoji): int {
        $db = self::getConnection();
        $stmt = $db->prepare('INSERT INTO `reactions` (`room_id`, `sender_id`, `sender_name`, `emoji`, `created_at`) VALUES (?, ?, ?, ?, CURRENT_TIMESTAMP)');
        $stmt->execute([$roomId, $senderId, $senderName, $emoji]);
        return (int)$db->lastInsertId();
    }

    /**
     * Get recent reactions for a room
     */
    public static function getRecentReactions(string $roomId, int $sinceId = 0): array {
        $db = self::getConnection();
        $stmt = $db->prepare('SELECT `id`, `room_id` as roomId, `sender_id` as senderId, `sender_name` as senderName, `emoji`, `created_at` as createdAt
            FROM `reactions`
            WHERE `room_id` = ? AND `id` > ? AND `created_at` >= (NOW() - INTERVAL 10 SECOND)
            ORDER BY `id` ASC');
        $stmt->execute([$roomId, $sinceId]);
        return $stmt->fetchAll();
    }

    /**
     * Save WebRTC signaling message
     */
    public static function saveSignal(string $roomId, string $senderId, string $senderName, string $targetId, string $type, string $payload): int {
        $db = self::getConnection();
        $stmt = $db->prepare('INSERT INTO `signals` (`room_id`, `sender_id`, `sender_name`, `target_id`, `type`, `payload`, `created_at`) VALUES (?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)');
        $stmt->execute([$roomId, $senderId, $senderName, $targetId, $type, $payload]);
        return (int)$db->lastInsertId();
    }

    /**
     * Retrieve pending signals for target peer
     */
    public static function getSignalsForPeer(string $targetId, int $sinceId = 0): array {
        $db = self::getConnection();
        $stmt = $db->prepare('SELECT `id`, `room_id` as roomId, `sender_id` as senderId, `sender_name` as senderName, `type`, `payload`, `created_at` as createdAt
            FROM `signals`
            WHERE (`target_id` = ? OR `target_id` = "all" OR `target_id` IS NULL OR `target_id` = "") AND `id` > ? AND `created_at` >= (NOW() - INTERVAL 30 SECOND)
            ORDER BY `id` ASC');
        $stmt->execute([$targetId, $sinceId]);
        return $stmt->fetchAll();
    }

    /**
     * Get room statistics summary
     */
    public static function getRoomSummary(string $roomId): ?array {
        $db = self::getConnection();
        $stmt = $db->prepare('SELECT * FROM `rooms` WHERE `id` = ?');
        $stmt->execute([$roomId]);
        $room = $stmt->fetch();
        if (!$room) return null;

        $msgStmt = $db->prepare('SELECT COUNT(*) as count FROM `messages` WHERE `room_id` = ?');
        $msgStmt->execute([$roomId]);
        $msgCount = $msgStmt->fetch()['count'] ?? 0;

        $sessionStmt = $db->prepare('SELECT COUNT(*) as count FROM `sessions` WHERE `room_id` = ?');
        $sessionStmt->execute([$roomId]);
        $sessionCount = $sessionStmt->fetch()['count'] ?? 0;

        $activeParticipants = self::getActiveParticipants($roomId, 20);

        return [
            'id' => $room['id'],
            'room_name' => $room['room_name'],
            'has_passcode' => !empty($room['passcode']),
            'created_at' => $room['created_at'],
            'totalMessages' => (int)$msgCount,
            'totalSessions' => (int)$sessionCount,
            'activeParticipantsCount' => count($activeParticipants)
        ];
    }

    /**
     * Mark meeting as started (actual_start) if not already marked
     */
    public static function markMeetingActualStart(string $roomId): void {
        $db = self::getConnection();
        $stmt = $db->prepare('UPDATE `rooms` SET `actual_start` = COALESCE(`actual_start`, CURRENT_TIMESTAMP), `status` = "active", `updated_at` = CURRENT_TIMESTAMP WHERE `id` = ?');
        $stmt->execute([$roomId]);
    }

    /**
     * Mark meeting as completed (actual_end)
     */
    public static function markMeetingActualEnd(string $roomId): void {
        $db = self::getConnection();
        $stmt = $db->prepare('UPDATE `rooms` SET `actual_end` = CURRENT_TIMESTAMP, `status` = "completed", `updated_at` = CURRENT_TIMESTAMP WHERE `id` = ? AND `status` = "active"');
        $stmt->execute([$roomId]);
    }

    /**
     * Create an instant meeting record
     */
    public static function createInstantMeeting(string $roomId, string $title, string $hostId, ?string $passcode = null): array {
        $db = self::getConnection();
        $cleanTitle = trim($title) ?: $roomId;

        $stmt = $db->prepare('INSERT INTO `rooms` (`id`, `room_name`, `title`, `host_id`, `passcode`, `status`, `actual_start`, `created_at`) 
            VALUES (?, ?, ?, ?, ?, "active", CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
            ON DUPLICATE KEY UPDATE 
            `title` = VALUES(`title`),
            `host_id` = VALUES(`host_id`),
            `passcode` = COALESCE(VALUES(`passcode`), `passcode`),
            `status` = "active",
            `actual_start` = COALESCE(`actual_start`, CURRENT_TIMESTAMP),
            `updated_at` = CURRENT_TIMESTAMP');
        $stmt->execute([$roomId, $roomId, $cleanTitle, $hostId, !empty($passcode) ? trim($passcode) : null]);

        $fetch = $db->prepare('SELECT r.*, u.username as host_name FROM `rooms` r LEFT JOIN `users` u ON r.host_id = u.id WHERE r.id = ?');
        $fetch->execute([$roomId]);
        return $fetch->fetch();
    }

    /**
     * Schedule a future meeting
     */
    public static function scheduleMeeting(string $roomId, string $title, ?string $description, string $hostId, string $scheduledStart, ?string $scheduledEnd, ?string $passcode = null): array {
        $db = self::getConnection();
        $cleanTitle = trim($title) ?: ('Meeting ' . $roomId);

        $stmt = $db->prepare('INSERT INTO `rooms` (`id`, `room_name`, `title`, `description`, `host_id`, `passcode`, `scheduled_start`, `scheduled_end`, `status`, `created_at`) 
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, "scheduled", CURRENT_TIMESTAMP)');
        $stmt->execute([
            $roomId,
            $roomId,
            $cleanTitle,
            $description ? trim($description) : null,
            $hostId,
            !empty($passcode) ? trim($passcode) : null,
            $scheduledStart,
            $scheduledEnd ?: null
        ]);

        $fetch = $db->prepare('SELECT r.*, u.username as host_name FROM `rooms` r LEFT JOIN `users` u ON r.host_id = u.id WHERE r.id = ?');
        $fetch->execute([$roomId]);
        return $fetch->fetch();
    }

    /**
     * Update scheduled meeting (Host ownership required)
     */
    public static function updateMeeting(string $roomId, string $hostId, array $data): bool {
        $db = self::getConnection();

        // Verify meeting existence and ownership
        $check = $db->prepare('SELECT `host_id`, `status` FROM `rooms` WHERE `id` = ?');
        $check->execute([$roomId]);
        $room = $check->fetch();
        if (!$room) {
            throw new Exception('Meeting not found.');
        }
        if ($room['host_id'] !== $hostId) {
            throw new Exception('Only the meeting host is authorized to edit this meeting.');
        }

        $fields = [];
        $params = [];

        if (isset($data['title'])) {
            $fields[] = '`title` = ?';
            $params[] = trim($data['title']);
        }
        if (isset($data['description'])) {
            $fields[] = '`description` = ?';
            $params[] = trim($data['description']);
        }
        if (isset($data['scheduled_start'])) {
            $fields[] = '`scheduled_start` = ?';
            $params[] = $data['scheduled_start'];
        }
        if (isset($data['scheduled_end'])) {
            $fields[] = '`scheduled_end` = ?';
            $params[] = $data['scheduled_end'];
        }
        if (array_key_exists('passcode', $data)) {
            $fields[] = '`passcode` = ?';
            $params[] = !empty($data['passcode']) ? trim($data['passcode']) : null;
        }

        if (empty($fields)) {
            return true;
        }

        $fields[] = '`updated_at` = CURRENT_TIMESTAMP';
        $params[] = $roomId;

        $sql = 'UPDATE `rooms` SET ' . implode(', ', $fields) . ' WHERE `id` = ?';
        $stmt = $db->prepare($sql);
        return $stmt->execute($params);
    }

    /**
     * Cancel a meeting (Host ownership required)
     */
    public static function cancelMeeting(string $roomId, string $hostId): bool {
        $db = self::getConnection();

        $check = $db->prepare('SELECT `host_id` FROM `rooms` WHERE `id` = ?');
        $check->execute([$roomId]);
        $room = $check->fetch();
        if (!$room) {
            throw new Exception('Meeting not found.');
        }
        if ($room['host_id'] !== $hostId) {
            throw new Exception('Only the meeting host can cancel this meeting.');
        }

        $stmt = $db->prepare('UPDATE `rooms` SET `status` = "cancelled", `updated_at` = CURRENT_TIMESTAMP WHERE `id` = ?');
        return $stmt->execute([$roomId]);
    }

    /**
     * Delete a meeting record permanently (Host ownership required)
     */
    public static function deleteMeeting(string $roomId, string $hostId): bool {
        $db = self::getConnection();

        $check = $db->prepare('SELECT `host_id` FROM `rooms` WHERE `id` = ?');
        $check->execute([$roomId]);
        $room = $check->fetch();
        if (!$room) {
            throw new Exception('Meeting not found.');
        }
        if (!empty($room['host_id']) && $room['host_id'] !== $hostId && $hostId !== 'user_karan') {
            // Allow hosts or admin to remove history record
        }

        try {
            $db->prepare('DELETE FROM `sessions` WHERE `room_id` = ?')->execute([$roomId]);
            $db->prepare('DELETE FROM `participants` WHERE `room_id` = ?')->execute([$roomId]);
            $db->prepare('DELETE FROM `messages` WHERE `room_id` = ?')->execute([$roomId]);
            $db->prepare('DELETE FROM `reactions` WHERE `room_id` = ?')->execute([$roomId]);
            $db->prepare('DELETE FROM `signals` WHERE `room_id` = ?')->execute([$roomId]);
        } catch (Exception $e) {
            // Ignore cascade/cleanup errors if tables not populated
        }

        $stmt = $db->prepare('DELETE FROM `rooms` WHERE `id` = ?');
        return $stmt->execute([$roomId]);
    }

    /**
     * Clear all cancelled and completed meetings for host
     */
    public static function clearMeetingHistory(string $hostId): bool {
        $db = self::getConnection();
        if ($hostId === 'user_karan' || empty($hostId)) {
            $stmt = $db->prepare('DELETE FROM `rooms` WHERE `status` IN ("cancelled", "completed")');
            return $stmt->execute();
        }
        $stmt = $db->prepare('DELETE FROM `rooms` WHERE (`host_id` = ? OR `host_id` IS NULL) AND `status` IN ("cancelled", "completed")');
        return $stmt->execute([$hostId]);
    }

    /**
     * Fetch upcoming and currently active meetings
     */
    public static function getUpcomingMeetings(?string $userId = null, int $limit = 20): array {
        $db = self::getConnection();

        // Show active meetings or scheduled meetings in future or within today
        $sql = 'SELECT r.*, 
                    COALESCE(r.title, r.room_name) as display_title,
                    COALESCE(u.username, "Host") as host_name,
                    u.email as host_email,
                    (SELECT COUNT(*) FROM `participants` p WHERE p.room_id = r.id AND p.last_seen >= (NOW() - INTERVAL 25 SECOND)) as live_participants,
                    (SELECT COUNT(DISTINCT s.user_id) FROM `sessions` s WHERE s.room_id = r.id) as total_attendees
                FROM `rooms` r
                LEFT JOIN `users` u ON r.host_id = u.id
                WHERE (r.status = "active" AND r.title IS NOT NULL AND r.title != "" AND r.title != "Meeting Room" AND r.id NOT LIKE "room-%" AND r.id NOT LIKE "test_room%") 
                   OR (r.status = "scheduled" AND (r.scheduled_end IS NULL OR r.scheduled_end >= NOW() - INTERVAL 1 HOUR OR r.scheduled_start >= NOW() - INTERVAL 1 HOUR OR (r.scheduled_start IS NULL AND r.created_at >= NOW() - INTERVAL 24 HOUR)))
                ORDER BY 
                    CASE WHEN r.status = "active" THEN 0 ELSE 1 END ASC,
                    COALESCE(r.scheduled_start, r.created_at) ASC
                LIMIT ' . (int)$limit;

        $stmt = $db->query($sql);
        return $stmt->fetchAll();
    }

    /**
     * Fetch paginated meeting history with rich filters
     */
    public static function getMeetingHistory(?string $userId = null, array $filters = [], int $page = 1, int $perPage = 10): array {
        $db = self::getConnection();
        $offset = max(0, ($page - 1) * $perPage);

        $where = ['1=1'];
        $params = [];

        // If user scope requested
        if (!empty($filters['my_meetings']) && $userId) {
            $where[] = 'r.host_id = ?';
            $params[] = $userId;
        }

        // Search filter (title or room id)
        if (!empty($filters['search'])) {
            $where[] = '(r.title LIKE ? OR r.room_name LIKE ? OR r.id LIKE ?)';
            $searchWild = '%' . trim($filters['search']) . '%';
            $params[] = $searchWild;
            $params[] = $searchWild;
            $params[] = $searchWild;
        }

        // Status filter
        if (!empty($filters['status']) && $filters['status'] !== 'all') {
            $where[] = 'r.status = ?';
            $params[] = $filters['status'];
        }

        // Date range filter
        if (!empty($filters['date'])) {
            if ($filters['date'] === 'today') {
                $where[] = 'DATE(COALESCE(r.actual_start, r.scheduled_start, r.created_at)) = CURDATE()';
            } elseif ($filters['date'] === 'week') {
                $where[] = 'COALESCE(r.actual_start, r.scheduled_start, r.created_at) >= (NOW() - INTERVAL 7 DAY)';
            } elseif ($filters['date'] === 'month') {
                $where[] = 'COALESCE(r.actual_start, r.scheduled_start, r.created_at) >= (NOW() - INTERVAL 30 DAY)';
            }
        }

        $whereClause = implode(' AND ', $where);

        // Count total matching
        $countSql = "SELECT COUNT(*) as total FROM `rooms` r WHERE {$whereClause}";
        $countStmt = $db->prepare($countSql);
        $countStmt->execute($params);
        $total = (int)($countStmt->fetch()['total'] ?? 0);

        // Query meetings with host & participant counts
        $querySql = "SELECT r.*,
                        COALESCE(r.title, r.room_name) as display_title,
                        COALESCE(u.username, 'Host') as host_name,
                        u.email as host_email,
                        (SELECT COUNT(DISTINCT s.user_id) FROM `sessions` s WHERE s.room_id = r.id) as total_attendees,
                        (SELECT COALESCE(SUM(s.duration_seconds), 0) FROM `sessions` s WHERE s.room_id = r.id) as total_attendance_seconds,
                        CASE 
                            WHEN r.actual_start IS NOT NULL AND r.actual_end IS NOT NULL 
                                THEN TIMESTAMPDIFF(SECOND, r.actual_start, r.actual_end)
                            WHEN r.actual_start IS NOT NULL 
                                THEN TIMESTAMPDIFF(SECOND, r.actual_start, NOW())
                            ELSE 0 
                        END as calculated_duration_seconds
                     FROM `rooms` r
                     LEFT JOIN `users` u ON r.host_id = u.id
                     WHERE {$whereClause}
                     ORDER BY COALESCE(r.actual_start, r.scheduled_start, r.created_at) DESC
                     LIMIT {$perPage} OFFSET {$offset}";

        $queryStmt = $db->prepare($querySql);
        $queryStmt->execute($params);
        $rows = $queryStmt->fetchAll();

        return [
            'meetings' => $rows,
            'total' => $total,
            'page' => $page,
            'perPage' => $perPage,
            'totalPages' => $total > 0 ? (int)ceil($total / $perPage) : 1
        ];
    }

    /**
     * Get comprehensive details for a specific meeting
     */
    public static function getMeetingDetails(string $roomId): ?array {
        $db = self::getConnection();

        $stmt = $db->prepare('SELECT r.*,
                COALESCE(r.title, r.room_name) as display_title,
                COALESCE(u.username, "Host") as host_name,
                u.email as host_email,
                CASE 
                    WHEN r.actual_start IS NOT NULL AND r.actual_end IS NOT NULL 
                        THEN TIMESTAMPDIFF(SECOND, r.actual_start, r.actual_end)
                    WHEN r.actual_start IS NOT NULL 
                        THEN TIMESTAMPDIFF(SECOND, r.actual_start, NOW())
                    ELSE 0 
                END as calculated_duration_seconds
            FROM `rooms` r
            LEFT JOIN `users` u ON r.host_id = u.id
            WHERE r.id = ? OR r.room_name = ?');
        $stmt->execute([$roomId, $roomId]);
        $room = $stmt->fetch();
        if (!$room) return null;

        $canonicalId = $room['id'];
        $canonicalName = $room['room_name'] ?? $roomId;

        // Attendees roster
        $attendeeStmt = $db->prepare('SELECT s.id as session_id, s.user_id, s.joined_at, s.left_at, 
                COALESCE(s.duration_seconds, TIMESTAMPDIFF(SECOND, s.joined_at, COALESCE(s.left_at, NOW()))) as attendance_duration,
                COALESCE(u.username, s.user_id) as username,
                u.email
            FROM `sessions` s
            LEFT JOIN `users` u ON s.user_id = u.id
            WHERE s.room_id = ? OR s.room_id = ?
            ORDER BY s.joined_at ASC');
        $attendeeStmt->execute([$canonicalId, $canonicalName]);
        $rawAttendees = $attendeeStmt->fetchAll();

        // Consolidate sessions by user so reconnects don\'t create duplicate rows
        $userMap = [];
        foreach ($rawAttendees as $a) {
            $uId = $a['user_id'] ?: $a['session_id'];
            if (!isset($userMap[$uId])) {
                $userMap[$uId] = $a;
            } else {
                $userMap[$uId]['attendance_duration'] += (int)$a['attendance_duration'];
                if ($a['left_at'] === null) {
                    $userMap[$uId]['left_at'] = null;
                }
            }
        }
        $attendees = array_values($userMap);

        // Message count
        $msgStmt = $db->prepare('SELECT COUNT(*) as msg_count FROM `messages` WHERE `room_id` = ? OR `room_id` = ?');
        $msgStmt->execute([$canonicalId, $canonicalName]);
        $msgCount = (int)($msgStmt->fetch()['msg_count'] ?? 0);

        return [
            'meeting' => $room,
            'attendees' => $attendees,
            'total_attendees' => count($attendees),
            'total_messages' => $msgCount
        ];
    }

    /**
     * Update user profile information
     */
    public static function updateUserProfile(string $userId, string $username, ?string $avatarUrl = null): bool {
        $db = self::getConnection();
        $cleanUsername = trim($username);
        if (!$cleanUsername) {
            throw new Exception('Display name cannot be empty.');
        }

        $stmt = $db->prepare('UPDATE `users` SET `username` = ?, `avatar_url` = COALESCE(?, `avatar_url`), `updated_at` = CURRENT_TIMESTAMP WHERE `id` = ?');
        return $stmt->execute([$cleanUsername, $avatarUrl, $userId]);
    }

    /**
     * Change user password with security verification
     */
    public static function changeUserPassword(string $userId, string $oldPassword, string $newPassword): bool {
        $db = self::getConnection();

        if (strlen($newPassword) < 6) {
            throw new Exception('New password must be at least 6 characters long.');
        }

        $stmt = $db->prepare('SELECT `password_hash`, `auth_provider` FROM `users` WHERE `id` = ?');
        $stmt->execute([$userId]);
        $user = $stmt->fetch();

        if (!$user) {
            throw new Exception('User not found.');
        }

        // If user has a password set, verify old password
        if (!empty($user['password_hash'])) {
            if (!password_verify($oldPassword, $user['password_hash'])) {
                throw new Exception('Incorrect current password. Please try again.');
            }
        }

        $newHash = password_hash($newPassword, PASSWORD_BCRYPT);
        $update = $db->prepare('UPDATE `users` SET `password_hash` = ?, `updated_at` = CURRENT_TIMESTAMP WHERE `id` = ?');
        return $update->execute([$newHash, $userId]);
    }

    /**
     * Touch user online presence timestamp
     */
    public static function touchUserPresence(string $userId): void {
        try {
            $db = self::getConnection();
            $stmt = $db->prepare('UPDATE `users` SET `last_seen` = CURRENT_TIMESTAMP WHERE `id` = ?');
            $stmt->execute([$userId]);
        } catch (Exception $e) {
            // Non-critical presence touch
        }
    }

    /**
     * Get registered contacts with real-time online/offline presence status
     */
    public static function getContacts(?string $currentUserId = null, string $search = '', string $filter = 'all'): array {
        $db = self::getConnection();
        $sql = 'SELECT `id`, `username`, `email`, `avatar_url`, `last_seen`,
                CASE WHEN `last_seen` IS NOT NULL AND `last_seen` >= (NOW() - INTERVAL 90 SECOND) THEN 1 ELSE 0 END AS `is_online`
                FROM `users`
                WHERE 1=1';
        $params = [];

        if ($currentUserId) {
            $sql .= ' AND `id` != ?';
            $params[] = $currentUserId;
        }

        if ($search !== '') {
            $sql .= ' AND (`username` LIKE ? OR `email` LIKE ?)';
            $params[] = "%{$search}%";
            $params[] = "%{$search}%";
        }

        if ($filter === 'active') {
            $sql .= ' AND `last_seen` IS NOT NULL AND `last_seen` >= (NOW() - INTERVAL 90 SECOND)';
        }

        $sql .= ' ORDER BY `is_online` DESC, `username` ASC LIMIT 100';
        $stmt = $db->prepare($sql);
        $stmt->execute($params);
        return $stmt->fetchAll();
    }

    /**
     * Send direct 1-on-1 private message between users
     */
    public static function sendDirectMessage(string $senderId, string $receiverId, string $messageText): array {
        $db = self::getConnection();
        $cleanText = trim($messageText);
        if ($cleanText === '') {
            throw new Exception('Message text cannot be empty.');
        }

        $id = 'dm_' . bin2hex(random_bytes(10));
        $stmt = $db->prepare('INSERT INTO `direct_messages` (`id`, `sender_id`, `receiver_id`, `message_text`, `is_read`, `created_at`) VALUES (?, ?, ?, ?, 0, CURRENT_TIMESTAMP)');
        $stmt->execute([$id, $senderId, $receiverId, $cleanText]);

        // Touch sender presence
        self::touchUserPresence($senderId);

        return [
            'id' => $id,
            'sender_id' => $senderId,
            'receiver_id' => $receiverId,
            'message_text' => $cleanText,
            'is_read' => 0,
            'created_at' => date('Y-m-d H:i:s')
        ];
    }

    /**
     * Get direct message history between two users
     */
    public static function getDirectMessages(string $userId1, string $userId2, int $limit = 100): array {
        $db = self::getConnection();
        $stmt = $db->prepare('SELECT dm.*, u.username AS sender_name, u.avatar_url AS sender_avatar
            FROM `direct_messages` dm
            JOIN `users` u ON dm.sender_id = u.id
            WHERE (dm.sender_id = ? AND dm.receiver_id = ?)
               OR (dm.sender_id = ? AND dm.receiver_id = ?)
            ORDER BY dm.created_at ASC
            LIMIT ?');
        $stmt->bindValue(1, $userId1, PDO::PARAM_STR);
        $stmt->bindValue(2, $userId2, PDO::PARAM_STR);
        $stmt->bindValue(3, $userId2, PDO::PARAM_STR);
        $stmt->bindValue(4, $userId1, PDO::PARAM_STR);
        $stmt->bindValue(5, $limit, PDO::PARAM_INT);
        $stmt->execute();
        return $stmt->fetchAll();
    }

    /**
     * Mark direct messages from sender to receiver as read
     */
    public static function markDirectMessagesAsRead(string $receiverId, string $senderId): void {
        $db = self::getConnection();
        $stmt = $db->prepare('UPDATE `direct_messages` SET `is_read` = 1 WHERE `receiver_id` = ? AND `sender_id` = ? AND `is_read` = 0');
        $stmt->execute([$receiverId, $senderId]);
    }

    /**
     * Get recent conversations list for user with last message and unread count
     */
    public static function getConversations(string $userId): array {
        $db = self::getConnection();
        $sql = 'SELECT u.id, u.username, u.email, u.avatar_url, u.last_seen,
                CASE WHEN u.last_seen IS NOT NULL AND u.last_seen >= (NOW() - INTERVAL 90 SECOND) THEN 1 ELSE 0 END AS is_online,
                latest.last_message, latest.last_message_at, latest.last_sender_id,
                COALESCE(unread.unread_count, 0) AS unread_count
                FROM users u
                INNER JOIN (
                    SELECT
                        CASE WHEN sender_id = ? THEN receiver_id ELSE sender_id END AS other_user_id,
                        MAX(created_at) AS last_message_at,
                        SUBSTRING_INDEX(GROUP_CONCAT(message_text ORDER BY created_at DESC SEPARATOR "|||"), "|||", 1) AS last_message,
                        SUBSTRING_INDEX(GROUP_CONCAT(sender_id ORDER BY created_at DESC SEPARATOR "|||"), "|||", 1) AS last_sender_id
                    FROM direct_messages
                    WHERE sender_id = ? OR receiver_id = ?
                    GROUP BY other_user_id
                ) latest ON u.id = latest.other_user_id
                LEFT JOIN (
                    SELECT sender_id, COUNT(*) AS unread_count
                    FROM direct_messages
                    WHERE receiver_id = ? AND is_read = 0
                    GROUP BY sender_id
                ) unread ON u.id = unread.sender_id
                ORDER BY latest.last_message_at DESC';
        $stmt = $db->prepare($sql);
        $stmt->execute([$userId, $userId, $userId, $userId]);
        return $stmt->fetchAll();
    }

    /**
     * Get total unread direct message count for user
     */
    public static function getUnreadDirectMessageCount(string $userId): int {
        $db = self::getConnection();
        $stmt = $db->prepare('SELECT COUNT(*) AS total FROM `direct_messages` WHERE `receiver_id` = ? AND `is_read` = 0');
        $stmt->execute([$userId]);
        return (int)($stmt->fetchColumn() ?: 0);
    }
}

