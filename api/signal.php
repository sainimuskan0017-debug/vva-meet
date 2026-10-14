<?php
/**
 * Vortex Meet - WebRTC Mesh Signaling Relay
 * Stores Offer, Answer, and ICE Candidates in MySQL for fallback mesh mode
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
$senderId = trim($data['senderId'] ?? '');
$senderName = trim($data['senderName'] ?? '');
$targetId = trim($data['targetId'] ?? '');
$type = trim($data['type'] ?? '');
$payload = is_string($data['payload'] ?? null) ? $data['payload'] : json_encode($data['payload'] ?? []);

if (!$roomId || !$senderId || !$targetId || !$type) {
    http_response_code(400);
    echo json_encode(['error' => 'Missing required signaling parameters']);
    exit;
}

try {
    $signalId = Database::saveSignal($roomId, $senderId, $senderName, $targetId, $type, $payload);
    echo json_encode(['success' => true, 'signalId' => $signalId]);
} catch (Exception $e) {
    http_response_code(500);
    echo json_encode(['error' => 'Failed to relay signal', 'message' => $e->getMessage()]);
}
