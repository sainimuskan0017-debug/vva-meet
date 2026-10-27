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

-- 2. Rooms Table: Conference rooms with host tracking, scheduling, status, and passcode security
CREATE TABLE IF NOT EXISTS `rooms` (
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
  `duration_seconds` INT NULL DEFAULT 0,
  PRIMARY KEY (`id`),
  INDEX `idx_sessions_room_left` (`room_id`, `left_at`),
  INDEX `idx_sessions_user` (`user_id`),
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

-- 8. Direct Messages Table: Private 1-on-1 conversations between registered users
CREATE TABLE IF NOT EXISTS `direct_messages` (
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
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 9. Initial Seed Accounts (Karan, Navdeep, Kashish, Vishesha)
-- Password for all accounts: 123456 (Bcrypt Hash)
INSERT INTO `users` (`id`, `username`, `email`, `password_hash`, `auth_provider`, `created_at`) VALUES
('user_karan', 'Karan', 'karan@gmail.com', '$2y$10$e0MYzXyjpJS7Pd0RVvHwHeFjkn8WBPrGwARNe.GvdGQjtp.qRPmGa', 'email', CURRENT_TIMESTAMP),
('user_navdeep', 'Navdeep', 'navdeep@gmail.com', '$2y$10$e0MYzXyjpJS7Pd0RVvHwHeFjkn8WBPrGwARNe.GvdGQjtp.qRPmGa', 'email', CURRENT_TIMESTAMP),
('user_kashish', 'Kashish', 'kashish@gmail.com', '$2y$10$e0MYzXyjpJS7Pd0RVvHwHeFjkn8WBPrGwARNe.GvdGQjtp.qRPmGa', 'email', CURRENT_TIMESTAMP),
('user_vishesha', 'Vishesha', 'vishesha@gmail.com', '$2y$10$e0MYzXyjpJS7Pd0RVvHwHeFjkn8WBPrGwARNe.GvdGQjtp.qRPmGa', 'email', CURRENT_TIMESTAMP)
ON DUPLICATE KEY UPDATE `username` = VALUES(`username`), `password_hash` = VALUES(`password_hash`);

SET FOREIGN_KEY_CHECKS = 1;

-- ==============================================================
-- SAFE MIGRATION STATEMENTS FOR EXISTING INSTALLATIONS
-- Run these if your database was created before the Dashboard upgrade:
-- ==============================================================
-- ALTER TABLE `users` ADD COLUMN `last_seen` DATETIME NULL AFTER `avatar_url`;
-- ALTER TABLE `rooms` ADD COLUMN `title` VARCHAR(200) NULL AFTER `room_name`;
-- ALTER TABLE `rooms` ADD COLUMN `description` TEXT NULL AFTER `title`;
-- ALTER TABLE `rooms` ADD COLUMN `scheduled_start` DATETIME NULL AFTER `passcode`;
-- ALTER TABLE `rooms` ADD COLUMN `scheduled_end` DATETIME NULL AFTER `scheduled_start`;
-- ALTER TABLE `rooms` ADD COLUMN `actual_start` DATETIME NULL AFTER `scheduled_end`;
-- ALTER TABLE `rooms` ADD COLUMN `actual_end` DATETIME NULL AFTER `actual_start`;
-- ALTER TABLE `rooms` ADD COLUMN `status` VARCHAR(32) NOT NULL DEFAULT 'active' AFTER `actual_end`;
-- ALTER TABLE `rooms` ADD COLUMN `updated_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP AFTER `created_at`;
-- ALTER TABLE `sessions` ADD COLUMN `duration_seconds` INT NULL DEFAULT 0 AFTER `left_at`;
-- ALTER TABLE `rooms` ADD INDEX `idx_rooms_status_sched` (`status`, `scheduled_start`);
-- ALTER TABLE `rooms` ADD INDEX `idx_rooms_created` (`created_at`);


