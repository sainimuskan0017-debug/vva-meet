<?php
/**
 * VVA Meet - Meetings Management API
 * Provides endpoints for creating instant meetings, scheduling meetings,
 * managing upcoming meetings, viewing and filtering persistent history,
 * exporting CSV reports, and verifying join permissions.
 * Compatible with BigRock Hosting (PHP + MySQL)
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

// Authentication check
if (empty($_SESSION['user_id'])) {
    http_response_code(401);
    header('Content-Type: application/json; charset=UTF-8');
    echo json_encode(['error' => 'Authentication required. Please sign in first.']);
    exit;
}

$currentUserId = $_SESSION['user_id'];
$currentUserName = $_SESSION['user_name'] ?? 'User';

$baseDir = rtrim(dirname($_SERVER['SCRIPT_NAME']), '/\\');
// If script is in /api, baseDir is / or /subdir
$parentDir = rtrim(dirname($baseDir), '/\\');
$appBaseUrl = ($parentDir === '' || $parentDir === '/') ? '/' : $parentDir . '/';

$raw = file_get_contents('php://input');
$data = json_decode($raw, true) ?: $_POST;
$action = $_GET['action'] ?? $data['action'] ?? 'upcoming';

function generateCleanMeetingId(string $prefix = 'meet'): string {
    $words = ['sync', 'huddle', 'nexus', 'pulse', 'orbit', 'focus', 'talk', 'connect', 'vision', 'stream'];
    $randWord = $words[array_rand($words)];
    $suffix = strtolower(bin2hex(random_bytes(3)));
    return "{$prefix}-{$randWord}-{$suffix}";
}

switch ($action) {
    // 1. List Upcoming & Active Meetings
    case 'upcoming':
        header('Content-Type: application/json; charset=UTF-8');
        try {
            $rawMeetings = Database::getUpcomingMeetings($currentUserId, 30);
            $meetings = array_values(array_filter($rawMeetings, function($m) {
                $id = $m['id'] ?? '';
                $title = $m['title'] ?? '';
                if (str_starts_with($id, 'room-') || str_starts_with($id, 'test_room') || str_starts_with($id, 'sync101')) return false;
                if ($title === 'Meeting Room' || empty($title)) return false;
                return true;
            }));
            
            // Format meeting link for each
            foreach ($meetings as &$m) {
                $m['join_url'] = 'room.php?room=' . urlencode($m['id']) . (!empty($m['passcode']) ? '&passcode=' . urlencode($m['passcode']) : '');
                $m['is_host'] = ($m['host_id'] === $currentUserId);
            }

            echo json_encode([
                'success' => true,
                'meetings' => $meetings
            ]);
        } catch (Exception $e) {
            http_response_code(500);
            echo json_encode(['error' => 'Failed to fetch upcoming meetings', 'message' => $e->getMessage()]);
        }
        break;

    // 2. List Paginated Meeting History with Filters
    case 'history':
        header('Content-Type: application/json; charset=UTF-8');
        try {
            $filters = [
                'search' => trim($_GET['search'] ?? ''),
                'status' => trim($_GET['status'] ?? 'all'),
                'date' => trim($_GET['date'] ?? 'all'),
                'my_meetings' => !empty($_GET['my_meetings'])
            ];
            $page = max(1, (int)($_GET['page'] ?? 1));
            $perPage = max(1, min(50, (int)($_GET['perPage'] ?? 10)));

            $result = Database::getMeetingHistory($currentUserId, $filters, $page, $perPage);

            foreach ($result['meetings'] as &$m) {
                $m['join_url'] = 'room.php?room=' . urlencode($m['id']) . (!empty($m['passcode']) ? '&passcode=' . urlencode($m['passcode']) : '');
                $m['is_host'] = ($m['host_id'] === $currentUserId);
            }

            echo json_encode(array_merge(['success' => true], $result));
        } catch (Exception $e) {
            http_response_code(500);
            echo json_encode(['error' => 'Failed to fetch meeting history', 'message' => $e->getMessage()]);
        }
        break;

    // 3. Meeting Details & Attendee Roster
    case 'details':
        header('Content-Type: application/json; charset=UTF-8');
        $roomId = trim($_GET['id'] ?? $data['id'] ?? '');
        if (!$roomId) {
            http_response_code(400);
            echo json_encode(['error' => 'Meeting ID is required']);
            exit;
        }

        try {
            $details = Database::getMeetingDetails($roomId);
            if (!$details) {
                http_response_code(404);
                echo json_encode(['error' => 'Meeting not found']);
                exit;
            }

            $details['meeting']['join_url'] = 'room.php?room=' . urlencode($details['meeting']['id']) . (!empty($details['meeting']['passcode']) ? '&passcode=' . urlencode($details['meeting']['passcode']) : '');
            $details['meeting']['is_host'] = ($details['meeting']['host_id'] === $currentUserId);

            echo json_encode(array_merge(['success' => true], $details));
        } catch (Exception $e) {
            http_response_code(500);
            echo json_encode(['error' => 'Failed to retrieve meeting details', 'message' => $e->getMessage()]);
        }
        break;

    // 4. Create Instant Meeting
    case 'create_instant':
        header('Content-Type: application/json; charset=UTF-8');
        try {
            $title = trim($data['title'] ?? '') ?: ('Meeting ' . date('M j, g:i A'));
            $passcode = trim($data['passcode'] ?? '') ?: null;
            $rawRoomId = trim($data['roomId'] ?? '');
            $roomId = $rawRoomId ? preg_replace('/[^a-zA-Z0-9_\-]/', '', $rawRoomId) : generateCleanMeetingId('meet');

            $meeting = Database::createInstantMeeting($roomId, $title, $currentUserId, $passcode);
            $joinUrl = 'room.php?room=' . urlencode($roomId) . ($passcode ? '&passcode=' . urlencode($passcode) : '');

            echo json_encode([
                'success' => true,
                'meeting' => $meeting,
                'roomId' => $roomId,
                'passcode' => $passcode,
                'joinUrl' => $joinUrl,
                'message' => 'Instant meeting created successfully'
            ]);
        } catch (Exception $e) {
            http_response_code(500);
            echo json_encode(['error' => 'Failed to create instant meeting', 'message' => $e->getMessage()]);
        }
        break;

    // 5. Schedule a Future Meeting
    case 'schedule':
        header('Content-Type: application/json; charset=UTF-8');
        try {
            $title = trim($data['title'] ?? '');
            $date = trim($data['date'] ?? '');
            $startTime = trim($data['startTime'] ?? '');
            $endTime = trim($data['endTime'] ?? '');
            $rawDuration = $data['durationMinutes'] ?? $data['duration'] ?? 30;
            $isUnlimited = ($rawDuration === 'unlimited' || (int)$rawDuration === 0 || !empty($data['isUnlimited']));
            $durationMinutes = $isUnlimited ? 0 : (int)$rawDuration;
            $description = trim($data['description'] ?? '');
            $passcode = trim($data['passcode'] ?? '') ?: null;

            if (!$title) {
                http_response_code(400);
                echo json_encode(['error' => 'Please enter a meeting title.']);
                exit;
            }

            if (!$date || !$startTime) {
                http_response_code(400);
                echo json_encode(['error' => 'Please select a meeting date and start time.']);
                exit;
            }

            $scheduledStart = "{$date} {$startTime}:00";
            if (strtotime($scheduledStart) < time() - 300) {
                http_response_code(400);
                echo json_encode(['error' => 'Scheduled time cannot be in the past.']);
                exit;
            }

            if ($isUnlimited) {
                // Unlimited meeting: runs continuously without an application-imposed end time or cutoff
                $scheduledEnd = null;
            } else if ($endTime) {
                $scheduledEnd = "{$date} {$endTime}:00";
                if (strtotime($scheduledEnd) <= strtotime($scheduledStart)) {
                    // Try next day if endTime is before startTime (overnight meeting)
                    $scheduledEnd = date('Y-m-d H:i:s', strtotime("{$scheduledEnd} +1 day"));
                }
            } else {
                $scheduledEnd = date('Y-m-d H:i:s', strtotime("{$scheduledStart} +{$durationMinutes} minutes"));
            }

            $roomId = generateCleanMeetingId('plan');
            $meeting = Database::scheduleMeeting($roomId, $title, $description, $currentUserId, $scheduledStart, $scheduledEnd, $passcode);
            $joinUrl = 'room.php?room=' . urlencode($roomId) . ($passcode ? '&passcode=' . urlencode($passcode) : '');

            echo json_encode([
                'success' => true,
                'meeting' => $meeting,
                'roomId' => $roomId,
                'isUnlimited' => $isUnlimited,
                'joinUrl' => $joinUrl,
                'message' => 'Meeting scheduled successfully'
            ]);
        } catch (Exception $e) {
            http_response_code(500);
            echo json_encode(['error' => 'Failed to schedule meeting', 'message' => $e->getMessage()]);
        }
        break;

    // 6. Update Meeting (Host only)
    case 'update':
        header('Content-Type: application/json; charset=UTF-8');
        try {
            $roomId = trim($data['meetingId'] ?? $data['roomId'] ?? '');
            $title = trim($data['title'] ?? '');
            $date = trim($data['date'] ?? '');
            $startTime = trim($data['startTime'] ?? '');
            $endTime = trim($data['endTime'] ?? '');
            $description = trim($data['description'] ?? '');
            $passcode = array_key_exists('passcode', $data) ? trim($data['passcode']) : null;

            if (!$roomId) {
                http_response_code(400);
                echo json_encode(['error' => 'Meeting ID is required.']);
                exit;
            }

            $updatePayload = [];
            if ($title) $updatePayload['title'] = $title;
            $updatePayload['description'] = $description;
            if (array_key_exists('passcode', $data)) {
                $updatePayload['passcode'] = $passcode ?: null;
            }

            $hasDurationField = isset($data['durationMinutes']) || isset($data['duration']) || isset($data['isUnlimited']);
            $isUnlimitedUpdate = false;
            if ($hasDurationField) {
                $rawDur = $data['durationMinutes'] ?? $data['duration'] ?? null;
                $isUnlimitedUpdate = ($rawDur === 'unlimited' || (int)$rawDur === 0 || !empty($data['isUnlimited']));
            }

            if ($date && $startTime) {
                $scheduledStart = "{$date} {$startTime}:00";
                $updatePayload['scheduled_start'] = $scheduledStart;
                if ($isUnlimitedUpdate) {
                    $updatePayload['scheduled_end'] = null;
                } else if ($endTime) {
                    $scheduledEnd = "{$date} {$endTime}:00";
                    if (strtotime($scheduledEnd) <= strtotime($scheduledStart)) {
                        $scheduledEnd = date('Y-m-d H:i:s', strtotime("{$scheduledEnd} +1 day"));
                    }
                    $updatePayload['scheduled_end'] = $scheduledEnd;
                } else if ($hasDurationField && !empty($rawDur)) {
                    $durMins = (int)$rawDur;
                    $updatePayload['scheduled_end'] = date('Y-m-d H:i:s', strtotime("{$scheduledStart} +{$durMins} minutes"));
                }
            } else if ($hasDurationField && $isUnlimitedUpdate) {
                $updatePayload['scheduled_end'] = null;
            }

            Database::updateMeeting($roomId, $currentUserId, $updatePayload);

            echo json_encode([
                'success' => true,
                'message' => 'Meeting updated successfully.'
            ]);
        } catch (Exception $e) {
            http_response_code(400);
            echo json_encode(['error' => $e->getMessage()]);
        }
        break;

    // 7. Cancel Meeting (Host only)
    case 'cancel':
        header('Content-Type: application/json; charset=UTF-8');
        try {
            $roomId = trim($data['meetingId'] ?? '');
            if (!$roomId) {
                http_response_code(400);
                echo json_encode(['error' => 'Meeting ID is required.']);
                exit;
            }

            Database::cancelMeeting($roomId, $currentUserId);

            echo json_encode([
                'success' => true,
                'message' => 'Meeting cancelled successfully.'
            ]);
        } catch (Exception $e) {
            http_response_code(400);
            echo json_encode(['error' => $e->getMessage()]);
        }
        break;

    // 8. Delete Meeting Record Permanently (Host only)
    case 'delete':
        header('Content-Type: application/json; charset=UTF-8');
        try {
            $roomId = trim($data['meetingId'] ?? $data['id'] ?? $_GET['id'] ?? '');
            if (!$roomId) {
                http_response_code(400);
                echo json_encode(['error' => 'Meeting ID is required.']);
                exit;
            }

            Database::deleteMeeting($roomId, $currentUserId);

            echo json_encode([
                'success' => true,
                'message' => 'Meeting record deleted successfully.'
            ]);
        } catch (Exception $e) {
            http_response_code(400);
            echo json_encode(['error' => $e->getMessage()]);
        }
        break;

    // 9. Clear Cancelled and Completed Meetings
    case 'clear_history':
        header('Content-Type: application/json; charset=UTF-8');
        try {
            Database::clearMeetingHistory($currentUserId);
            echo json_encode([
                'success' => true,
                'message' => 'Meeting history cleared successfully.'
            ]);
        } catch (Exception $e) {
            http_response_code(400);
            echo json_encode(['error' => $e->getMessage()]);
        }
        break;

    // 10. Verify & Resolve Join Input (Meeting ID or Full URL)
    case 'verify_join':
        header('Content-Type: application/json; charset=UTF-8');
        try {
            $input = trim($data['meetingInput'] ?? '');
            $passcode = trim($data['passcode'] ?? '');

            if (!$input) {
                http_response_code(400);
                echo json_encode(['error' => 'Please enter a valid Meeting ID or Invite URL.']);
                exit;
            }

            // Extract room and passcode if full URL provided
            $extractedRoom = '';
            $extractedPasscode = $passcode;

            if (preg_match('#[?&]room=([^&#]+)#', $input, $m)) {
                $extractedRoom = urldecode($m[1]);
            } elseif (preg_match('#/room/([^/?#]+)#', $input, $m)) {
                $extractedRoom = urldecode($m[1]);
            } else {
                // Remove any leading slashes or full domain if typed as domain/room-id
                $cleanInput = preg_replace('#^https?://[^/]+/#', '', $input);
                $extractedRoom = trim($cleanInput, '/');
            }

            if (preg_match('#[?&]passcode=([^&#]+)#', $input, $m)) {
                $extractedPasscode = urldecode($m[1]);
            }

            $extractedRoom = preg_replace('/[^a-zA-Z0-9_\-]/', '', $extractedRoom);
            if (empty($extractedRoom)) {
                http_response_code(400);
                echo json_encode(['error' => 'Invalid Meeting ID format. Only letters, numbers, and hyphens are supported.']);
                exit;
            }

            // Check database record
            $db = Database::getConnection();
            $stmt = $db->prepare('SELECT * FROM `rooms` WHERE `id` = ?');
            $stmt->execute([$extractedRoom]);
            $room = $stmt->fetch();

            // Target URL (no passcode required)
            $targetUrl = 'room.php?room=' . urlencode($extractedRoom);

            echo json_encode([
                'success' => true,
                'roomId' => $extractedRoom,
                'targetUrl' => $targetUrl,
                'roomTitle' => $room['title'] ?? $extractedRoom
            ]);
        } catch (Exception $e) {
            http_response_code(500);
            echo json_encode(['error' => 'Failed to verify meeting', 'message' => $e->getMessage()]);
        }
        break;

    // 9. Export Meeting History as CSV
    case 'export_csv':
        try {
            $filters = [
                'search' => trim($_GET['search'] ?? ''),
                'status' => trim($_GET['status'] ?? 'all'),
                'date' => trim($_GET['date'] ?? 'all'),
                'my_meetings' => !empty($_GET['my_meetings'])
            ];

            // Fetch up to 1000 history records for export
            $result = Database::getMeetingHistory($currentUserId, $filters, 1, 1000);
            $meetings = $result['meetings'];

            $filename = 'vva_meet_history_' . date('Ymd_His') . '.csv';

            header('Content-Type: text/csv; charset=utf-8');
            header('Content-Disposition: attachment; filename="' . $filename . '"');
            header('Pragma: no-cache');
            header('Expires: 0');

            $output = fopen('php://output', 'w');
            // Write UTF-8 BOM for Excel compatibility
            fprintf($output, chr(0xEF).chr(0xBB).chr(0xBF));

            // CSV Header Row
            fputcsv($output, [
                'Meeting ID',
                'Title',
                'Host Name',
                'Status',
                'Scheduled Start',
                'Scheduled End',
                'Actual Start',
                'Actual End',
                'Duration (Minutes)',
                'Total Attendees',
                'Meeting Link',
                'Created At'
            ]);

            // Determine host domain for absolute join link
            $proto = (!empty($_SERVER['HTTPS']) && $_SERVER['HTTPS'] !== 'off') ? 'https://' : 'http://';
            $host = $_SERVER['HTTP_HOST'] ?? 'localhost';
            $fullBase = $proto . $host . $appBaseUrl;

            foreach ($meetings as $row) {
                $durationMins = round(($row['calculated_duration_seconds'] ?? 0) / 60, 1);
                $fullLink = $fullBase . 'room.php?room=' . urlencode($row['id']);

                fputcsv($output, [
                    $row['id'],
                    $row['display_title'],
                    $row['host_name'] ?? 'Host',
                    ucfirst($row['status'] ?? 'active'),
                    $row['scheduled_start'] ?? '-',
                    $row['scheduled_end'] ?? '-',
                    $row['actual_start'] ?? '-',
                    $row['actual_end'] ?? '-',
                    $durationMins > 0 ? $durationMins : '0',
                    $row['total_attendees'] ?? 0,
                    $fullLink,
                    $row['created_at'] ?? '-'
                ]);
            }

            fclose($output);
            exit;
        } catch (Exception $e) {
            http_response_code(500);
            echo 'Failed to export CSV: ' . $e->getMessage();
            exit;
        }
        break;

    default:
        http_response_code(400);
        header('Content-Type: application/json; charset=UTF-8');
        echo json_encode(['error' => 'Unknown action']);
        break;
}
