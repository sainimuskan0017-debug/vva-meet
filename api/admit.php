<?php
/**
 * VVA Meet - Admit or Deny Participant from Waiting Room
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
$peerId = trim($data['peerId'] ?? '');
$action = trim($data['action'] ?? 'admit');

if (!$roomId || !$peerId) {
    http_response_code(400);
    echo json_encode(['error' => 'roomId and peerId are required']);
    exit;
}

try {
    if ($action === 'admit') {
        Database::admitParticipant($peerId);
        // Relay a signal so waiting peer unlocks immediately
        Database::saveSignal($roomId, 'host', 'Host', $peerId, 'lobby:admit', json_encode(['admitted' => true]));
    } else {
        Database::denyParticipant($peerId);
        Database::saveSignal($roomId, 'host', 'Host', $peerId, 'lobby:deny', json_encode(['denied' => true]));
    }
    echo json_encode(['success' => true, 'action' => $action, 'peerId' => $peerId]);
} catch (Exception $e) {
    http_response_code(500);
    echo json_encode(['error' => 'Failed to process admission', 'message' => $e->getMessage()]);
}
