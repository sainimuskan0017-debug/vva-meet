<?php
/**
 * Vortex Meet - Room Summary API Endpoint
 */

header('Content-Type: application/json; charset=UTF-8');
header('Access-Control-Allow-Origin: *');

require_once __DIR__ . '/../database.php';

$roomId = $_GET['roomId'] ?? $_GET['room'] ?? null;

if (!$roomId) {
    // Check if passed via PATH_INFO or URL rewrite
    $path = trim($_SERVER['PATH_INFO'] ?? '', '/');
    if ($path) {
        $parts = explode('/', $path);
        $roomId = $parts[0] ?? null;
    }
}

if (!$roomId) {
    http_response_code(400);
    echo json_encode(['error' => 'Room ID is required']);
    exit;
}

try {
    $summary = Database::getRoomSummary($roomId);
    if (!$summary) {
        http_response_code(404);
        echo json_encode(['error' => 'Room not found']);
        exit;
    }

    echo json_encode($summary);
} catch (Exception $e) {
    http_response_code(500);
    echo json_encode(['error' => 'Internal server error', 'message' => $e->getMessage()]);
}
