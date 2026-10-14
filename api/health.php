<?php
/**
 * Vortex Meet - Health Check API Endpoint
 */

header('Content-Type: application/json; charset=UTF-8');
header('Access-Control-Allow-Origin: *');

require_once __DIR__ . '/../database.php';

$startTime = microtime(true);
$dbHealthy = false;
$dbError = null;

try {
    $db = Database::getConnection();
    $stmt = $db->query('SELECT 1');
    $dbHealthy = (bool)$stmt->fetch();
} catch (Exception $e) {
    $dbError = $e->getMessage();
}

$responseTime = round((microtime(true) - $startTime) * 1000, 2);

http_response_code($dbHealthy ? 200 : 503);
echo json_encode([
    'status' => $dbHealthy ? 'healthy' : 'degraded',
    'timestamp' => gmdate('Y-m-d\TH:i:s\Z'),
    'php_version' => PHP_VERSION,
    'server_software' => $_SERVER['SERVER_SOFTWARE'] ?? 'Apache/PHP',
    'database' => [
        'connected' => $dbHealthy,
        'driver' => 'mysql (PDO)',
        'error' => $dbError
    ],
    'latency_ms' => $responseTime
], JSON_PRETTY_PRINT);
