<?php
/**
 * Vortex Meet - Join Room API Endpoint
 * Handles user admission, database session tracking, and passcode verification
 */

header('Content-Type: application/json; charset=UTF-8');
header('Access-Control-Allow-Origin: *');
header('Access-Control-Allow-Methods: POST, OPTIONS');
header('Access-Control-Allow-Headers: Content-Type');

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    http_response_code(200);
    exit;
}

require_once __DIR__ . '/../database.php';

$raw = file_get_contents('php://input');
$data = json_decode($raw, true) ?: $_POST;

$roomId = trim($data['roomId'] ?? '');
$username = trim($data['username'] ?? '');
$userId = trim($data['userId'] ?? '') ?: ('user_' . bin2hex(random_bytes(6)));
$peerId = trim($data['peerId'] ?? '') ?: ('peer_' . bin2hex(random_bytes(8)));
$sessionId = trim($data['sessionId'] ?? '') ?: ('sess_' . bin2hex(random_bytes(8)));
$passcode = trim($data['passcode'] ?? '');
$audioMuted = !empty($data['audioMuted']);
$videoOff = !empty($data['videoOff']);

if (!$roomId || !$username) {
    http_response_code(400);
    echo json_encode(['error' => 'Room ID and User ID / Name are required.']);
    exit;
}

try {
    // 1. Check Passcode Protection if room already exists
    if (Database::roomRequiresPasscode($roomId)) {
        if (!Database::verifyRoomPasscode($roomId, $passcode)) {
            http_response_code(403);
            echo json_encode([
                'success' => false,
                'passcodeRequired' => true,
                'error' => 'This meeting requires a valid passcode to enter. Please check your passcode and try again.'
            ]);
            exit;
        }
    }

    // 2. Persist user & room in MySQL
    Database::upsertUser($userId, $username);
    $roomRecord = Database::getOrCreateRoom($roomId, $roomId, $passcode ?: null, $userId);
    Database::recordSessionJoin($sessionId, $roomId, $userId);

    // 3. Fetch existing active peers before inserting newcomer
    Database::purgeStaleParticipants(25);
    $allParticipants = Database::getActiveParticipants($roomId, 20);
    $existingPeers = [];
    foreach ($allParticipants as $p) {
        if ($p['peerId'] !== $peerId) {
            $existingPeers[] = $p;
        }
    }

    // 4. Register newcomer in participants table
    Database::upsertParticipant($peerId, $roomId, $userId, $username, $audioMuted, $videoOff, false);

    // 5. Fetch past chat message history
    $chatHistory = Database::getRoomMessages($roomId, 100);

    echo json_encode([
        'success' => true,
        'myPeerId' => $peerId,
        'userId' => $userId,
        'sessionId' => $sessionId,
        'roomId' => $roomId,
        'roomName' => $roomRecord['room_name'],
        'hasPasscode' => !empty($roomRecord['passcode']),
        'existingPeers' => $existingPeers,
        'chatHistory' => $chatHistory
    ]);
} catch (Exception $e) {
    http_response_code(500);
    echo json_encode([
        'error' => 'Failed to join room',
        'message' => $e->getMessage()
    ]);
}
