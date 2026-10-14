<?php
/**
 * Vortex Meet - Media Status Toggle Endpoint
 * Updates microphone, camera, or screen sharing status in MySQL
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

$peerId = trim($data['peerId'] ?? '');
$type = trim($data['type'] ?? '');
$enabled = !empty($data['enabled']);

if (!$peerId || !in_array($type, ['audio', 'video', 'screen'])) {
    http_response_code(400);
    echo json_encode(['error' => 'Invalid peerId or media type']);
    exit;
}

try {
    Database::updateParticipantMedia($peerId, $type, $enabled);
    echo json_encode([
        'success' => true,
        'peerId' => $peerId,
        'type' => $type,
        'enabled' => $enabled
    ]);
} catch (Exception $e) {
    http_response_code(500);
    echo json_encode(['error' => 'Failed to update media status', 'message' => $e->getMessage()]);
}
