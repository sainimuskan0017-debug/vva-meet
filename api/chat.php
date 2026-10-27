<?php
/**
 * VVA Meet - Direct 1-on-1 Chat API
 * Provides endpoints for private conversations, message exchange,
 * unread badges, and conversation history.
 * BigRock Hosting Compatible (PHP + MySQL PDO)
 */

if (session_status() === PHP_SESSION_NONE) {
    session_start();
}

header('Access-Control-Allow-Origin: *');
header('Access-Control-Allow-Methods: GET, POST, OPTIONS');
header('Access-Control-Allow-Headers: Content-Type');

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    http_response_code(200);
    exit;
}

require_once __DIR__ . '/../database.php';
require_once __DIR__ . '/../config.php';

// Authentication check: users must be logged in to chat
if (empty($_SESSION['user_id'])) {
    http_response_code(401);
    header('Content-Type: application/json; charset=UTF-8');
    echo json_encode(['error' => 'Authentication required. Please sign in first.']);
    exit;
}

$currentUserId = $_SESSION['user_id'];
$currentUserName = $_SESSION['user_name'] ?? 'User';

// Touch presence
Database::touchUserPresence($currentUserId);

$raw = file_get_contents('php://input');
$data = json_decode($raw, true) ?: $_POST;
$action = $_GET['action'] ?? $data['action'] ?? 'conversations';

header('Content-Type: application/json; charset=UTF-8');

switch ($action) {
    // 1. Get List of Conversations
    case 'conversations':
        try {
            $conversations = Database::getConversations($currentUserId);
            $totalUnread = Database::getUnreadDirectMessageCount($currentUserId);
            echo json_encode([
                'success' => true,
                'conversations' => $conversations,
                'total_unread' => $totalUnread
            ]);
        } catch (Exception $e) {
            http_response_code(500);
            echo json_encode(['error' => 'Failed to load conversations', 'message' => $e->getMessage()]);
        }
        break;

    // 2. Get Messages in a Conversation
    case 'messages':
        try {
            $contactId = trim($_GET['contact_id'] ?? $_GET['contactId'] ?? $data['contact_id'] ?? $data['contactId'] ?? '');
            if (!$contactId) {
                http_response_code(400);
                echo json_encode(['error' => 'contact_id parameter is required.']);
                exit;
            }

            // Mark received messages from this contact as read
            Database::markDirectMessagesAsRead($currentUserId, $contactId);

            $messages = Database::getDirectMessages($currentUserId, $contactId, 150);
            $contact = Database::getUserById($contactId);

            echo json_encode([
                'success' => true,
                'contact' => $contact ? [
                    'id' => $contact['id'],
                    'username' => $contact['username'],
                    'email' => $contact['email'],
                    'avatar_url' => $contact['avatar_url'] ?? '',
                    'is_online' => !empty($contact['last_seen']) && (strtotime($contact['last_seen']) >= time() - 90)
                ] : null,
                'messages' => $messages
            ]);
        } catch (Exception $e) {
            http_response_code(500);
            echo json_encode(['error' => 'Failed to load messages', 'message' => $e->getMessage()]);
        }
        break;

    // 3. Send Direct Message
    case 'send':
        try {
            $receiverId = trim($data['receiver_id'] ?? $data['receiverId'] ?? '');
            $messageText = trim($data['message_text'] ?? $data['messageText'] ?? '');

            if (!$receiverId || $messageText === '') {
                http_response_code(400);
                echo json_encode(['error' => 'Receiver ID and non-empty message text are required.']);
                exit;
            }

            if ($receiverId === $currentUserId) {
                http_response_code(400);
                echo json_encode(['error' => 'You cannot send a message to yourself.']);
                exit;
            }

            $message = Database::sendDirectMessage($currentUserId, $receiverId, $messageText);
            echo json_encode([
                'success' => true,
                'message' => $message
            ]);
        } catch (Exception $e) {
            http_response_code(500);
            echo json_encode(['error' => 'Failed to send message', 'message' => $e->getMessage()]);
        }
        break;

    // 4. Mark Conversation as Read
    case 'mark_read':
        try {
            $contactId = trim($data['contact_id'] ?? $data['contactId'] ?? $_GET['contact_id'] ?? $_GET['contactId'] ?? '');
            if ($contactId) {
                Database::markDirectMessagesAsRead($currentUserId, $contactId);
            }
            $totalUnread = Database::getUnreadDirectMessageCount($currentUserId);
            echo json_encode([
                'success' => true,
                'total_unread' => $totalUnread
            ]);
        } catch (Exception $e) {
            http_response_code(500);
            echo json_encode(['error' => 'Failed to mark read', 'message' => $e->getMessage()]);
        }
        break;

    // 5. Total Unread Badge Count
    case 'unread_count':
        try {
            $count = Database::getUnreadDirectMessageCount($currentUserId);
            echo json_encode([
                'success' => true,
                'unread_count' => $count
            ]);
        } catch (Exception $e) {
            echo json_encode(['success' => true, 'unread_count' => 0]);
        }
        break;

    default:
        http_response_code(400);
        echo json_encode(['error' => 'Unknown chat action']);
        break;
}
