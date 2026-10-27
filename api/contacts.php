<?php
/**
 * VVA Meet - Contacts & People Directory API
 * Provides endpoints for searching users, viewing presence status (Active Now / Offline),
 * and updating real-time heartbeats.
 * BigRock Hosting Compatible (PHP + MySQL PDO)
 */

if (session_status() === PHP_SESSION_NONE) {
    session_start();
}

header('Access-Control-Allow-Origin: *');
header('Access-Control-Allow-Methods: GET, POST, OPTIONS');
header('Access-Control-Allow-Headers: Content-Type');

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    http_response_code(200);
    exit;
}

require_once __DIR__ . '/../database.php';
require_once __DIR__ . '/../config.php';

// Authentication check
if (empty($_SESSION['user_id'])) {
    http_response_code(401);
    header('Content-Type: application/json; charset=UTF-8');
    echo json_encode(['error' => 'Authentication required. Please sign in first.']);
    exit;
}

$currentUserId = $_SESSION['user_id'];

// Touch current user's presence
Database::touchUserPresence($currentUserId);

$raw = file_get_contents('php://input');
$data = json_decode($raw, true) ?: $_POST;
$action = $_GET['action'] ?? $data['action'] ?? 'list';

header('Content-Type: application/json; charset=UTF-8');

switch ($action) {
    // 1. List Contacts / Directory
    case 'list':
        try {
            $search = trim($_GET['search'] ?? $data['search'] ?? '');
            $filter = trim($_GET['filter'] ?? $data['filter'] ?? 'all'); // 'all' or 'active'

            $contacts = Database::getContacts($currentUserId, $search, $filter);

            // Sanitize contacts: never expose password_hash or internal keys
            $safeContacts = array_map(function ($c) {
                return [
                    'id' => $c['id'],
                    'username' => $c['username'],
                    'email' => $c['email'] ?: '',
                    'avatar_url' => $c['avatar_url'] ?? '',
                    'is_online' => (bool)$c['is_online'],
                    'last_seen' => $c['last_seen']
                ];
            }, $contacts);

            $activeCount = 0;
            foreach ($safeContacts as $c) {
                if ($c['is_online']) $activeCount++;
            }

            echo json_encode([
                'success' => true,
                'contacts' => $safeContacts,
                'total' => count($safeContacts),
                'active_count' => $activeCount
            ]);
        } catch (Exception $e) {
            http_response_code(500);
            echo json_encode(['error' => 'Failed to load contacts', 'message' => $e->getMessage()]);
        }
        break;

    // 2. Presence Heartbeat Ping
    case 'heartbeat':
        Database::touchUserPresence($currentUserId);
        echo json_encode([
            'success' => true,
            'timestamp' => date('Y-m-d H:i:s')
        ]);
        break;

    default:
        http_response_code(400);
        echo json_encode(['error' => 'Unknown contacts action']);
        break;
}
