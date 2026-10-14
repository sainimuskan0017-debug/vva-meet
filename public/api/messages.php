<?php
/**
 * Vortex Meet - Messages API Endpoint
 * Handles fetching chat history and saving new messages
 */

header('Content-Type: application/json; charset=UTF-8');
header('Access-Control-Allow-Origin: *');
header('Access-Control-Allow-Methods: GET, POST, OPTIONS');
header('Access-Control-Allow-Headers: Content-Type');

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    http_response_code(200);
    exit;
}

require_once __DIR__ . '/../database.php';

$method = $_SERVER['REQUEST_METHOD'];

if ($method === 'GET') {
    $roomId = $_GET['roomId'] ?? $_GET['room'] ?? null;
    $limit = isset($_GET['limit']) ? (int)$_GET['limit'] : 100;
    $sinceId = $_GET['sinceId'] ?? null;

    if (!$roomId) {
        http_response_code(400);
        echo json_encode(['error' => 'roomId parameter is required']);
        exit;
    }

    try {
        $messages = Database::getRoomMessages($roomId, $limit, $sinceId);
        echo json_encode([
            'roomId' => $roomId,
            'count' => count($messages),
            'messages' => $messages
        ]);
    } catch (Exception $e) {
        http_response_code(500);
        echo json_encode(['error' => 'Failed to fetch messages', 'message' => $e->getMessage()]);
    }
} elseif ($method === 'POST') {
    $raw = file_get_contents('php://input');
    $data = json_decode($raw, true) ?: $_POST;

    $roomId = trim($data['roomId'] ?? '');
    $senderName = trim($data['senderName'] ?? '');
    $messageText = trim($data['messageText'] ?? '');
    $messageId = trim($data['id'] ?? '') ?: bin2hex(random_bytes(16));

    if (!$roomId || !$senderName || !$messageText) {
        http_response_code(400);
        echo json_encode(['error' => 'roomId, senderName, and messageText are required']);
        exit;
    }

    try {
        Database::getOrCreateRoom($roomId);
        $saved = Database::saveMessage($messageId, $roomId, $senderName, $messageText);
        echo json_encode([
            'success' => true,
            'message' => $saved
        ]);
    } catch (Exception $e) {
        http_response_code(500);
        echo json_encode(['error' => 'Failed to save message', 'message' => $e->getMessage()]);
    }
} else {
    http_response_code(405);
    echo json_encode(['error' => 'Method not allowed']);
}
