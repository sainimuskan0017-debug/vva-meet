<?php
/**
 * VVA Meet - User Profile API Endpoint
 * Handles profile fetching, updating display name/avatar, and password changes
 * Compatible with BigRock Hosting (PHP + MySQL)
 */

if (session_status() === PHP_SESSION_NONE) {
    session_start();
}

header('Content-Type: application/json; charset=UTF-8');
header('Access-Control-Allow-Origin: *');
header('Access-Control-Allow-Methods: GET, POST, OPTIONS');
header('Access-Control-Allow-Headers: Content-Type');

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    http_response_code(200);
    exit;
}

require_once __DIR__ . '/../database.php';

// Authentication verification
if (empty($_SESSION['user_id'])) {
    http_response_code(401);
    echo json_encode(['error' => 'Authentication required. Please sign in first.']);
    exit;
}

$currentUserId = $_SESSION['user_id'];
$raw = file_get_contents('php://input');
$data = json_decode($raw, true) ?: $_POST;
$action = $_GET['action'] ?? $data['action'] ?? 'get';

switch ($action) {
    case 'get':
        try {
            $user = Database::getUserById($currentUserId);
            if (!$user) {
                http_response_code(404);
                echo json_encode(['error' => 'User profile not found.']);
                exit;
            }

            echo json_encode([
                'success' => true,
                'user' => [
                    'id' => $user['id'],
                    'username' => $user['username'],
                    'email' => $user['email'] ?? '',
                    'auth_provider' => $user['auth_provider'] ?? 'email',
                    'avatar_url' => $user['avatar_url'] ?? '',
                    'created_at' => $user['created_at'] ?? ''
                ]
            ]);
        } catch (Exception $e) {
            http_response_code(500);
            echo json_encode(['error' => 'Failed to retrieve profile: ' . $e->getMessage()]);
        }
        break;

    case 'update':
        try {
            $username = trim($data['username'] ?? '');
            $avatarUrl = trim($data['avatar_url'] ?? '') ?: null;

            if (!$username) {
                http_response_code(400);
                echo json_encode(['error' => 'Display name cannot be empty.']);
                exit;
            }

            Database::updateUserProfile($currentUserId, $username, $avatarUrl);
            $_SESSION['user_name'] = $username;

            echo json_encode([
                'success' => true,
                'message' => 'Profile updated successfully!',
                'user' => [
                    'id' => $currentUserId,
                    'username' => $username,
                    'avatar_url' => $avatarUrl
                ]
            ]);
        } catch (Exception $e) {
            http_response_code(400);
            echo json_encode(['error' => $e->getMessage()]);
        }
        break;

    case 'change_password':
        try {
            $currentPassword = $data['currentPassword'] ?? '';
            $newPassword = $data['newPassword'] ?? '';
            $confirmPassword = $data['confirmPassword'] ?? '';

            if (!$newPassword) {
                http_response_code(400);
                echo json_encode(['error' => 'Please enter a new password.']);
                exit;
            }

            if (strlen($newPassword) < 6) {
                http_response_code(400);
                echo json_encode(['error' => 'New password must be at least 6 characters long.']);
                exit;
            }

            if ($newPassword !== $confirmPassword) {
                http_response_code(400);
                echo json_encode(['error' => 'New passwords do not match.']);
                exit;
            }

            Database::changeUserPassword($currentUserId, $currentPassword, $newPassword);

            echo json_encode([
                'success' => true,
                'message' => 'Password changed successfully.'
            ]);
        } catch (Exception $e) {
            http_response_code(400);
            echo json_encode(['error' => $e->getMessage()]);
        }
        break;

    default:
        http_response_code(400);
        echo json_encode(['error' => 'Unknown profile action']);
        break;
}
