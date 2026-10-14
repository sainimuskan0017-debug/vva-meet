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
                `host_id` VARCHAR(64) NULL,
                `passcode` VARCHAR(64) NULL,
                `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
                PRIMARY KEY (`id`),
                INDEX `idx_rooms_host` (`host_id`)
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
                PRIMARY KEY (`id`),
                INDEX `idx_sessions_room_left` (`room_id`, `left_at`),
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
        self::ensureColumn($db, 'rooms', 'host_id', 'VARCHAR(64) NULL');
        self::ensureColumn($db, 'rooms', 'passcode', 'VARCHAR(64) NULL');

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
            $insert = $db->prepare('INSERT INTO `rooms` (`id`, `room_name`, `host_id`, `passcode`, `created_at`) VALUES (?, ?, ?, ?, CURRENT_TIMESTAMP)');
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
    public static function recordSessionLeave(string $sessionId): void {
        if (empty($sessionId)) return;
        $db = self::getConnection();
        $stmt = $db->prepare('UPDATE `sessions` SET `left_at` = CURRENT_TIMESTAMP WHERE `id` = ? AND `left_at` IS NULL');
        $stmt->execute([$sessionId]);
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
        bool $isScreenSharing = false
    ): void {
        $db = self::getConnection();
        $stmt = $db->prepare('INSERT INTO `participants` 
            (`peer_id`, `room_id`, `user_id`, `username`, `audio_muted`, `video_off`, `is_screen_sharing`, `joined_at`, `last_seen`)
            VALUES (?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
            ON DUPLICATE KEY UPDATE
            `username` = VALUES(`username`),
            `audio_muted` = VALUES(`audio_muted`),
            `video_off` = VALUES(`video_off`),
            `is_screen_sharing` = VALUES(`is_screen_sharing`),
            `last_seen` = CURRENT_TIMESTAMP');
        $stmt->execute([
            $peerId,
            $roomId,
            $userId,
            $username,
            $audioMuted ? 1 : 0,
            $videoOff ? 1 : 0,
            $isScreenSharing ? 1 : 0
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
            $stmt = $db->prepare('UPDATE `participants` SET `is_screen_sharing` = ?, `last_seen` = CURRENT_TIMESTAMP WHERE `peer_id` = ?');
            $stmt->execute([$enabled ? 1 : 0, $peerId]);
        }
    }

    /**
     * Refresh participant heartbeat
     */
    public static function touchParticipant(string $peerId): void {
        $db = self::getConnection();
        $stmt = $db->prepare('UPDATE `participants` SET `last_seen` = CURRENT_TIMESTAMP WHERE `peer_id` = ?');
        $stmt->execute([$peerId]);
    }

    /**
     * Remove participant on exit
     */
    public static function removeParticipant(string $peerId): void {
        $db = self::getConnection();
        $stmt = $db->prepare('DELETE FROM `participants` WHERE `peer_id` = ?');
        $stmt->execute([$peerId]);
    }

    /**
     * Get active participants in a room (seen within last N seconds)
     */
    public static function getActiveParticipants(string $roomId, int $thresholdSeconds = 20): array {
        $db = self::getConnection();
        $stmt = $db->prepare('SELECT `peer_id` as peerId, `user_id` as userId, `username`, 
            `audio_muted` as audioMuted, `video_off` as videoOff, `is_screen_sharing` as isScreenSharing, `joined_at` as joinedAt
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
     * Purge stale participants whose heartbeats expired
     */
    public static function purgeStaleParticipants(int $thresholdSeconds = 25): void {
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
            WHERE `target_id` = ? AND `id` > ? AND `created_at` >= (NOW() - INTERVAL 30 SECOND)
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
}
