-- ==============================================================
-- VVA Meet - MySQL Database Schema for BigRock Hosting
-- Compatible with MySQL 5.7+, MySQL 8.0+, MariaDB 10.3+
-- Charset: utf8mb4 (Supports all languages & full Unicode emojis)
-- ==============================================================

SET FOREIGN_KEY_CHECKS = 0;

-- 1. Users Table: Registered users, Gmail/Email auth, and guest profiles
CREATE TABLE IF NOT EXISTS `users` (
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
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 2. Rooms Table: Conference rooms with host tracking and passcode security
CREATE TABLE IF NOT EXISTS `rooms` (
  `id` VARCHAR(64) NOT NULL,
  `room_name` VARCHAR(150) NOT NULL,
  `host_id` VARCHAR(64) NULL,
  `passcode` VARCHAR(64) NULL,
  `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  INDEX `idx_rooms_host` (`host_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 3. Messages Table: Persistent chat messages for each room
CREATE TABLE IF NOT EXISTS `messages` (
  `id` VARCHAR(64) NOT NULL,
  `room_id` VARCHAR(64) NOT NULL,
  `sender_name` VARCHAR(100) NOT NULL,
  `message_text` TEXT NOT NULL,
  `sent_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  INDEX `idx_messages_room_sent` (`room_id`, `sent_at`),
  CONSTRAINT `fk_messages_room` FOREIGN KEY (`room_id`) REFERENCES `rooms` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 4. Sessions Table: User attendance history & duration logs
CREATE TABLE IF NOT EXISTS `sessions` (
  `id` VARCHAR(64) NOT NULL,
  `room_id` VARCHAR(64) NOT NULL,
  `user_id` VARCHAR(64) NOT NULL,
  `joined_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `left_at` DATETIME NULL DEFAULT NULL,
  PRIMARY KEY (`id`),
  INDEX `idx_sessions_room_left` (`room_id`, `left_at`),
  CONSTRAINT `fk_sessions_room` FOREIGN KEY (`room_id`) REFERENCES `rooms` (`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_sessions_user` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 5. Active Participants Table: Live presence, mute status, and heartbeat
CREATE TABLE IF NOT EXISTS `participants` (
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
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 6. Reactions Table: Real-time emoji bursts broadcasted across peers
CREATE TABLE IF NOT EXISTS `reactions` (
  `id` BIGINT AUTO_INCREMENT NOT NULL,
  `room_id` VARCHAR(64) NOT NULL,
  `sender_id` VARCHAR(64) NOT NULL,
  `sender_name` VARCHAR(100) NOT NULL,
  `emoji` VARCHAR(16) NOT NULL,
  `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  INDEX `idx_reactions_room_created` (`room_id`, `created_at`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 7. Signals Table: WebRTC Mesh signaling relay (Offer/Answer/ICE Candidates)
CREATE TABLE IF NOT EXISTS `signals` (
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
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

SET FOREIGN_KEY_CHECKS = 1;
