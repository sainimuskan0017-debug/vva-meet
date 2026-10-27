<?php
/**
 * VVA Meet - Transfer Meeting Host
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
$newHostId = trim($data['newHostId'] ?? '');
$newHostName = trim($data['newHostName'] ?? '');

if (!$roomId || !$newHostId) {
    http_response_code(400);
    echo json_encode(['error' => 'roomId and newHostId are required']);
    exit;
}

try {
    Database::updateRoomHost($roomId, $newHostId, $newHostName);
    Database::saveSignal($roomId, 'system', 'System', 'all', 'host:make-host', json_encode([
        'newHostId' => $newHostId,
        'newHostName' => $newHostName
    ]));
    echo json_encode(['success' => true, 'newHostId' => $newHostId, 'newHostName' => $newHostName]);
} catch (Exception $e) {
    http_response_code(500);
    echo json_encode(['error' => 'Failed to transfer host', 'message' => $e->getMessage()]);
}
