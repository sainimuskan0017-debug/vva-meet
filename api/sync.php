<?php
/**
 * Vortex Meet - Real-time Polling & Heartbeat Synchronization Endpoint
 * Extremely fast, atomic check for chat, reactions, active peers, and WebRTC signals
 */

header('Content-Type: application/json; charset=UTF-8');
header('Access-Control-Allow-Origin: *');
header('Access-Control-Allow-Methods: POST, GET, OPTIONS');
header('Access-Control-Allow-Headers: Content-Type, Bypass-Tunnel-Reminder, bypass-tunnel-reminder, ngrok-skip-browser-warning, X-Requested-With');

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    http_response_code(200);
    exit;
}

require_once __DIR__ . '/../database.php';

if (session_status() === PHP_SESSION_NONE) {
    session_start();
}
if (!empty($_SESSION['user_id'])) {
    $_SESSION['last_touch'] = time();
}

$raw = file_get_contents('php://input');
$data = json_decode($raw, true) ?: $_REQUEST;

$peerId = trim($data['peerId'] ?? '');
$roomId = trim($data['roomId'] ?? '');
$username = trim($data['username'] ?? '') ?: (!empty($_SESSION['user_name']) ? $_SESSION['user_name'] : null);
$userId = trim($data['userId'] ?? '') ?: (!empty($_SESSION['user_id']) ? $_SESSION['user_id'] : null);
$lastMessageId = trim($data['lastMessageId'] ?? '') ?: null;
$lastReactionId = isset($data['lastReactionId']) ? (int)$data['lastReactionId'] : 0;
$lastSignalId = isset($data['lastSignalId']) ? (int)$data['lastSignalId'] : 0;

if (!$roomId) {
    http_response_code(400);
    echo json_encode(['error' => 'roomId is required']);
    exit;
}

try {
    // 1. Touch heartbeat for current participant (with auto-heal)
    if ($peerId) {
        Database::touchParticipant($peerId, $roomId, $username, $userId);
    }

    // 2. Fetch active participants (60s threshold for stable presence)
    $participants = Database::getActiveParticipants($roomId, 60);

    // 3. Fetch new messages since lastMessageId
    $newMessages = [];
    if ($lastMessageId) {
        $newMessages = Database::getRoomMessages($roomId, 50, $lastMessageId);
    }

    // 4. Fetch new reactions since lastReactionId
    $newReactions = Database::getRecentReactions($roomId, $lastReactionId);

    // 5. Fetch new WebRTC mesh signals for this peer
    $newSignals = [];
    if ($peerId) {
        $newSignals = Database::getSignalsForPeer($peerId, $lastSignalId);
    }

    echo json_encode([
        'success' => true,
        'serverTime' => gmdate('Y-m-d\TH:i:s\Z'),
        'participants' => $participants,
        'newMessages' => $newMessages,
        'newReactions' => $newReactions,
        'newSignals' => $newSignals
    ]);
} catch (Exception $e) {
    http_response_code(500);
    echo json_encode([
        'error' => 'Sync failed',
        'message' => $e->getMessage()
    ]);
}
