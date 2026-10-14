<?php
/**
 * Vortex Meet - Active Participants Endpoint
 */

header('Content-Type: application/json; charset=UTF-8');
header('Access-Control-Allow-Origin: *');

require_once __DIR__ . '/../database.php';

$roomId = $_GET['roomId'] ?? $_GET['room'] ?? null;

if (!$roomId) {
    http_response_code(400);
    echo json_encode(['error' => 'roomId parameter is required']);
    exit;
}

try {
    Database::purgeStaleParticipants(25);
    $participants = Database::getActiveParticipants($roomId, 20);

    echo json_encode([
        'roomId' => $roomId,
        'count' => count($participants),
        'participants' => $participants
    ]);
} catch (Exception $e) {
    http_response_code(500);
    echo json_encode(['error' => 'Failed to fetch participants', 'message' => $e->getMessage()]);
}
