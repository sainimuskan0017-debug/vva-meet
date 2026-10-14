<?php
/**
 * Vortex Meet - Send Reaction Endpoint
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
$senderId = trim($data['senderId'] ?? '') ?: 'anon';
$senderName = trim($data['senderName'] ?? '') ?: 'Participant';
$emoji = trim($data['emoji'] ?? '');

if (!$roomId || !$emoji) {
    http_response_code(400);
    echo json_encode(['error' => 'roomId and emoji are required']);
    exit;
}

try {
    $reactionId = Database::saveReaction($roomId, $senderId, $senderName, $emoji);
    echo json_encode([
        'success' => true,
        'reactionId' => $reactionId,
        'emoji' => $emoji,
        'senderName' => $senderName
    ]);
} catch (Exception $e) {
    http_response_code(500);
    echo json_encode(['error' => 'Failed to save reaction', 'message' => $e->getMessage()]);
}
