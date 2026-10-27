<?php
/**
 * Vortex Meet - Leave Room API Endpoint
 * Performs graceful session termination and participant cleanup
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
$sessionId = trim($data['sessionId'] ?? '');
$roomId = trim($data['roomId'] ?? '');
$userId = trim($data['userId'] ?? '');

try {
    if ($sessionId) {
        Database::recordSessionLeave($sessionId);
    } elseif ($userId && $roomId) {
        Database::recordSessionLeave(null, $userId, $roomId);
    }
    if ($peerId) {
        Database::removeParticipant($peerId);
        if ($roomId) {
            try {
                Database::saveSignal($roomId, $peerId, 'Participant', 'all', 'user-left', json_encode(['peerId' => $peerId]));
            } catch (Exception $sigErr) {}
        }
    }
    if ($roomId) {
        $remaining = Database::getActiveParticipants($roomId, 20);
        if (count($remaining) === 0) {
            Database::markMeetingActualEnd($roomId);
        }
    }

    echo json_encode(['success' => true]);
} catch (Exception $e) {
    http_response_code(500);
    echo json_encode(['error' => 'Failed to process departure', 'message' => $e->getMessage()]);
}
