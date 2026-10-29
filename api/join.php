<?php
/**
 * Vortex Meet - Join Room API Endpoint
 * Handles user admission, database session tracking, and passcode verification
 */

header('Content-Type: application/json; charset=UTF-8');
header('Access-Control-Allow-Origin: *');
header('Access-Control-Allow-Methods: POST, OPTIONS');
header('Access-Control-Allow-Headers: Content-Type, Bypass-Tunnel-Reminder, bypass-tunnel-reminder, ngrok-skip-browser-warning, X-Requested-With');

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
    // 1. Persist user & room in MySQL
    Database::upsertUser($userId, $username);
    $roomRecord = Database::getOrCreateRoom($roomId, $roomId, $passcode ?: null, $userId);
    Database::recordSessionJoin($sessionId, $roomId, $userId);
    Database::markMeetingActualStart($roomId);

    // 3. Purge stale participants (120s threshold to avoid dropping slow clients)
    Database::purgeStaleParticipants(120);

    $allParticipants = Database::getActiveParticipants($roomId, 60);
    $existingPeers = [];
    foreach ($allParticipants as $p) {
        if ($p['peerId'] !== $peerId && ($p['status'] ?? 'admitted') === 'admitted') {
            $existingPeers[] = $p;
        }
    }

    // 4. Determine host & admission status
    $hostId = $roomRecord['host_id'] ?? null;
    if (empty($hostId)) {
        $hostId = $userId;
        Database::updateRoomHost($roomId, $userId, $username);
    }
    $isHost = ($hostId === $userId);

    // Check if host is currently present in the meeting
    $hostIsPresent = false;
    foreach ($allParticipants as $p) {
        if ($p['userId'] === $hostId) {
            $hostIsPresent = true;
            break;
        }
    }

    // Host is immediately admitted. Any attendee waits in lobby until approved by host
    $participantStatus = $isHost ? 'admitted' : 'waiting';

    // Evict any existing/stale participant records for this user or name in this room
    Database::evictDuplicateParticipants($roomId, $userId, $username, $peerId);

    // Register newcomer in participants table
    Database::upsertParticipant($peerId, $roomId, $userId, $username, $audioMuted, $videoOff, false, $participantStatus);

    if ($participantStatus === 'waiting') {
        $existingPeers = [];
    }

    // 5. Fetch past chat message history
    $chatHistory = Database::getRoomMessages($roomId, 100);

    $meetingDetails = Database::getMeetingDetails($roomId);
    if (!empty($meetingDetails['host_username'])) {
        $hostName = $meetingDetails['host_username'];
    } else if (!empty($meetingDetails['username'])) {
        $hostName = $meetingDetails['username'];
    } else {
        $hostUser = Database::getUserById($hostId);
        $hostName = $hostUser['username'] ?? ($roomRecord['host_name'] ?? ($isHost ? $username : 'Host'));
    }

    echo json_encode([
        'success' => true,
        'myPeerId' => $peerId,
        'userId' => $userId,
        'sessionId' => $sessionId,
        'roomId' => $roomId,
        'roomName' => $roomRecord['room_name'],
        'hostId' => $hostId,
        'hostName' => $hostName,
        'isHost' => $isHost,
        'status' => $participantStatus,
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
