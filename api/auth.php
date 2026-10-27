<?php
/**
 * Vortex Meet - Authentication API Endpoint
 * Handles Sign In, Sign Up, and Google/Gmail Authentication
 * Compatible with BigRock Hosting (PHP Session & MySQL)
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

$raw = file_get_contents('php://input');
$data = json_decode($raw, true) ?: $_POST;

$action = $_GET['action'] ?? $data['action'] ?? 'me';

switch ($action) {
    case 'signup':
        $username = trim($data['username'] ?? '');
        $email = strtolower(trim($data['email'] ?? ''));
        $password = $data['password'] ?? '';
        $customUserId = trim($data['userId'] ?? '');

        if (!$username || !$email || !$password) {
            http_response_code(400);
            echo json_encode(['error' => 'Please provide full name, email, and password.']);
            exit;
        }

        if (!filter_var($email, FILTER_VALIDATE_EMAIL)) {
            http_response_code(400);
            echo json_encode(['error' => 'Please provide a valid email or Gmail address.']);
            exit;
        }

        if (strlen($password) < 6) {
            http_response_code(400);
            echo json_encode(['error' => 'Password must be at least 6 characters long.']);
            exit;
        }

        try {
            $user = Database::registerUser($username, $email, $password, 'email', $customUserId ?: null);

            // Set session
            $_SESSION['user_id'] = $user['id'];
            $_SESSION['user_name'] = $user['username'];
            $_SESSION['user_email'] = $user['email'];
            $_SESSION['auth_provider'] = 'email';

            if (!isset($_SESSION['authenticated_accounts']) || !is_array($_SESSION['authenticated_accounts'])) {
                $_SESSION['authenticated_accounts'] = [];
            }
            $_SESSION['authenticated_accounts'][$user['id']] = [
                'id' => $user['id'],
                'username' => $user['username'],
                'email' => $user['email'],
                'auth_provider' => 'email',
                'avatar_url' => '',
                'token' => bin2hex(random_bytes(32))
            ];

            echo json_encode([
                'success' => true,
                'message' => 'Registration successful',
                'user' => [
                    'id' => $user['id'],
                    'username' => $user['username'],
                    'email' => $user['email']
                ]
            ]);
        } catch (Exception $e) {
            http_response_code(400);
            echo json_encode(['error' => $e->getMessage()]);
        }
        break;

    case 'signin':
        $emailOrUsername = trim($data['email'] ?? $data['username'] ?? '');
        $password = $data['password'] ?? '';

        if (!$emailOrUsername || !$password) {
            http_response_code(400);
            echo json_encode(['error' => 'Please enter your email and password.']);
            exit;
        }

        try {
            $user = Database::authenticateUser($emailOrUsername, $password);

            if (!$user) {
                http_response_code(401);
                echo json_encode(['error' => 'Invalid email or password. Please try again.']);
                exit;
            }

            // Set session
            $_SESSION['user_id'] = $user['id'];
            $_SESSION['user_name'] = $user['username'];
            $_SESSION['user_email'] = $user['email'];
            $_SESSION['auth_provider'] = $user['auth_provider'];

            if (!isset($_SESSION['authenticated_accounts']) || !is_array($_SESSION['authenticated_accounts'])) {
                $_SESSION['authenticated_accounts'] = [];
            }
            $_SESSION['authenticated_accounts'][$user['id']] = [
                'id' => $user['id'],
                'username' => $user['username'],
                'email' => $user['email'],
                'auth_provider' => $user['auth_provider'] ?? 'email',
                'avatar_url' => $user['avatar_url'] ?? '',
                'token' => bin2hex(random_bytes(32))
            ];

            echo json_encode([
                'success' => true,
                'message' => 'Signed in successfully',
                'user' => [
                    'id' => $user['id'],
                    'username' => $user['username'],
                    'email' => $user['email'],
                    'auth_provider' => $user['auth_provider'],
                    'avatar_url' => $user['avatar_url']
                ]
            ]);
        } catch (Exception $e) {
            http_response_code(500);
            echo json_encode(['error' => 'Sign in error', 'message' => $e->getMessage()]);
        }
        break;

    case 'google':
        $email = strtolower(trim($data['email'] ?? ''));
        $name = trim($data['name'] ?? '');
        $avatar = trim($data['avatar'] ?? '');

        if (!$email) {
            http_response_code(400);
            echo json_encode(['error' => 'Gmail address is required for Google sign in.']);
            exit;
        }

        if (!filter_var($email, FILTER_VALIDATE_EMAIL)) {
            http_response_code(400);
            echo json_encode(['error' => 'Invalid email address provided.']);
            exit;
        }

        try {
            $user = Database::authenticateGoogleUser($email, $name, $avatar ?: null);

            $_SESSION['user_id'] = $user['id'];
            $_SESSION['user_name'] = $user['username'];
            $_SESSION['user_email'] = $user['email'];
            $_SESSION['auth_provider'] = 'google';

            if (!isset($_SESSION['authenticated_accounts']) || !is_array($_SESSION['authenticated_accounts'])) {
                $_SESSION['authenticated_accounts'] = [];
            }
            $_SESSION['authenticated_accounts'][$user['id']] = [
                'id' => $user['id'],
                'username' => $user['username'],
                'email' => $user['email'],
                'auth_provider' => 'google',
                'avatar_url' => $user['avatar_url'] ?? '',
                'token' => bin2hex(random_bytes(32))
            ];

            echo json_encode([
                'success' => true,
                'message' => 'Signed in with Google successfully',
                'user' => [
                    'id' => $user['id'],
                    'username' => $user['username'],
                    'email' => $user['email'],
                    'auth_provider' => 'google',
                    'avatar_url' => $user['avatar_url']
                ]
            ]);
        } catch (Exception $e) {
            http_response_code(500);
            echo json_encode(['error' => 'Google authentication failed', 'message' => $e->getMessage()]);
        }
        break;

    case 'me':
        if (!empty($_SESSION['user_id'])) {
            echo json_encode([
                'authenticated' => true,
                'user' => [
                    'id' => $_SESSION['user_id'],
                    'username' => $_SESSION['user_name'] ?? 'User',
                    'email' => $_SESSION['user_email'] ?? '',
                    'auth_provider' => $_SESSION['auth_provider'] ?? 'email'
                ]
            ]);
        } else {
            echo json_encode([
                'authenticated' => false,
                'user' => null
            ]);
        }
        break;

    case 'logout':
        $_SESSION = [];
        if (ini_get("session.use_cookies")) {
            $params = session_get_cookie_params();
            setcookie(session_name(), '', time() - 42000,
                $params["path"], $params["domain"],
                $params["secure"], $params["httponly"]
            );
        }
        session_destroy();

        echo json_encode(['success' => true, 'message' => 'Logged out successfully']);
        break;

    case 'add_account':
        $emailOrUsername = trim($data['email'] ?? $data['username'] ?? '');
        $password = $data['password'] ?? '';

        if (!$emailOrUsername || !$password) {
            http_response_code(400);
            echo json_encode(['error' => 'Please enter email/username and password.']);
            exit;
        }

        try {
            $user = Database::authenticateUser($emailOrUsername, $password);

            if (!$user) {
                http_response_code(401);
                echo json_encode(['error' => 'Invalid email or password. Please try again.']);
                exit;
            }

            if (!isset($_SESSION['authenticated_accounts']) || !is_array($_SESSION['authenticated_accounts'])) {
                $_SESSION['authenticated_accounts'] = [];
            }

            // Ensure current account is preserved in authenticated_accounts
            if (!empty($_SESSION['user_id']) && !isset($_SESSION['authenticated_accounts'][$_SESSION['user_id']])) {
                $_SESSION['authenticated_accounts'][$_SESSION['user_id']] = [
                    'id' => $_SESSION['user_id'],
                    'username' => $_SESSION['user_name'] ?? 'User',
                    'email' => $_SESSION['user_email'] ?? '',
                    'auth_provider' => $_SESSION['auth_provider'] ?? 'email',
                    'avatar_url' => $_SESSION['avatar_url'] ?? '',
                    'token' => bin2hex(random_bytes(32))
                ];
            }

            // Prevent duplicate accounts
            if (isset($_SESSION['authenticated_accounts'][$user['id']])) {
                http_response_code(400);
                echo json_encode(['error' => 'This account has already been added to your account switcher.']);
                exit;
            }

            $token = bin2hex(random_bytes(32));
            $_SESSION['authenticated_accounts'][$user['id']] = [
                'id' => $user['id'],
                'username' => $user['username'],
                'email' => $user['email'],
                'auth_provider' => $user['auth_provider'] ?? 'email',
                'avatar_url' => $user['avatar_url'] ?? '',
                'token' => $token
            ];

            // Switch active session to this newly authenticated account
            $_SESSION['user_id'] = $user['id'];
            $_SESSION['user_name'] = $user['username'];
            $_SESSION['user_email'] = $user['email'];
            $_SESSION['auth_provider'] = $user['auth_provider'] ?? 'email';

            $accountList = [];
            foreach ($_SESSION['authenticated_accounts'] as $acc) {
                $accountList[] = [
                    'id' => $acc['id'],
                    'username' => $acc['username'],
                    'email' => $acc['email'],
                    'avatar_url' => $acc['avatar_url'] ?? '',
                    'isActive' => ($acc['id'] === $_SESSION['user_id'])
                ];
            }

            echo json_encode([
                'success' => true,
                'message' => 'Account added and switched successfully',
                'activeUser' => [
                    'id' => $user['id'],
                    'username' => $user['username'],
                    'email' => $user['email']
                ],
                'accounts' => $accountList
            ]);
        } catch (Exception $e) {
            http_response_code(500);
            echo json_encode(['error' => 'Authentication failed: ' . $e->getMessage()]);
        }
        break;

    case 'switch_account':
        $targetUserId = trim($data['targetUserId'] ?? $data['userId'] ?? '');

        if (!$targetUserId) {
            http_response_code(400);
            echo json_encode(['error' => 'Target user ID is required.']);
            exit;
        }

        if (!isset($_SESSION['authenticated_accounts']) || !is_array($_SESSION['authenticated_accounts'])) {
            $_SESSION['authenticated_accounts'] = [];
        }

        if (!isset($_SESSION['authenticated_accounts'][$targetUserId])) {
            $dbUser = Database::getUserById($targetUserId);
            if (!$dbUser) {
                http_response_code(403);
                echo json_encode(['error' => 'Account session not found. Please sign in again.']);
                exit;
            }
            $_SESSION['authenticated_accounts'][$targetUserId] = [
                'id' => $dbUser['id'],
                'username' => $dbUser['username'],
                'email' => $dbUser['email'],
                'auth_provider' => $dbUser['auth_provider'] ?? 'email',
                'avatar_url' => $dbUser['avatar_url'] ?? '',
                'token' => bin2hex(random_bytes(32))
            ];
        }

        $target = $_SESSION['authenticated_accounts'][$targetUserId];
        $_SESSION['user_id'] = $target['id'];
        $_SESSION['user_name'] = $target['username'];
        $_SESSION['user_email'] = $target['email'];
        $_SESSION['auth_provider'] = $target['auth_provider'] ?? 'email';

        $accountList = [];
        foreach ($_SESSION['authenticated_accounts'] as $acc) {
            $accountList[] = [
                'id' => $acc['id'],
                'username' => $acc['username'],
                'email' => $acc['email'],
                'avatar_url' => $acc['avatar_url'] ?? '',
                'isActive' => ($acc['id'] === $_SESSION['user_id'])
            ];
        }

        echo json_encode([
            'success' => true,
            'message' => 'Switched to ' . $target['username'],
            'activeUser' => [
                'id' => $target['id'],
                'username' => $target['username'],
                'email' => $target['email']
            ],
            'accounts' => $accountList
        ]);
        break;

    case 'list_accounts':
        if (!isset($_SESSION['authenticated_accounts']) || !is_array($_SESSION['authenticated_accounts'])) {
            $_SESSION['authenticated_accounts'] = [];
        }
        unset($_SESSION['authenticated_accounts']['user_admin']);
        unset($_SESSION['authenticated_accounts']['user_sarah']);
        unset($_SESSION['authenticated_accounts']['user_david']);
        if (!empty($_SESSION['user_id']) && !isset($_SESSION['authenticated_accounts'][$_SESSION['user_id']])) {
            $_SESSION['authenticated_accounts'][$_SESSION['user_id']] = [
                'id' => $_SESSION['user_id'],
                'username' => $_SESSION['user_name'] ?? 'User',
                'email' => $_SESSION['user_email'] ?? '',
                'auth_provider' => $_SESSION['auth_provider'] ?? 'email',
                'avatar_url' => $_SESSION['avatar_url'] ?? '',
                'token' => bin2hex(random_bytes(32))
            ];
        }

        $accountList = [];
        foreach ($_SESSION['authenticated_accounts'] as $acc) {
            $accountList[] = [
                'id' => $acc['id'],
                'username' => $acc['username'],
                'email' => $acc['email'],
                'avatar_url' => $acc['avatar_url'] ?? '',
                'isActive' => ($acc['id'] === ($_SESSION['user_id'] ?? ''))
            ];
        }

        echo json_encode([
            'success' => true,
            'accounts' => $accountList
        ]);
        break;

    case 'remove_account':
        $targetUserId = trim($data['targetUserId'] ?? $data['userId'] ?? '');
        if (isset($_SESSION['authenticated_accounts'][$targetUserId])) {
            unset($_SESSION['authenticated_accounts'][$targetUserId]);
        }
        if ($targetUserId === ($_SESSION['user_id'] ?? '') && !empty($_SESSION['authenticated_accounts'])) {
            $next = reset($_SESSION['authenticated_accounts']);
            $_SESSION['user_id'] = $next['id'];
            $_SESSION['user_name'] = $next['username'];
            $_SESSION['user_email'] = $next['email'];
            $_SESSION['auth_provider'] = $next['auth_provider'] ?? 'email';
        }

        $accountList = [];
        foreach ($_SESSION['authenticated_accounts'] as $acc) {
            $accountList[] = [
                'id' => $acc['id'],
                'username' => $acc['username'],
                'email' => $acc['email'],
                'avatar_url' => $acc['avatar_url'] ?? '',
                'isActive' => ($acc['id'] === ($_SESSION['user_id'] ?? ''))
            ];
        }

        echo json_encode([
            'success' => true,
            'accounts' => $accountList
        ]);
        break;

    default:
        http_response_code(400);
        echo json_encode(['error' => 'Unknown auth action']);
}
