<?php
/**
 * VVA Meet - Network Info API Endpoint
 * Resolves reachable server host so participants can join
 */

header('Content-Type: application/json; charset=UTF-8');
header('Access-Control-Allow-Origin: *');

$httpHost = $_SERVER['HTTP_HOST'] ?? 'localhost:3000';
$isLocal = strpos($httpHost, 'localhost') !== false || strpos($httpHost, '127.0.0.1') !== false;

// Attempt to detect host IP on local servers
$serverIp = $_SERVER['SERVER_ADDR'] ?? gethostbyname(gethostname());
$port = $_SERVER['SERVER_PORT'] ?? 80;

$networkHost = $httpHost;
if ($isLocal && !empty($serverIp) && $serverIp !== '127.0.0.1' && $serverIp !== '::1') {
    $networkHost = ($port == 80 || $port == 443) ? $serverIp : ($serverIp . ':' . $port);
}

echo json_encode([
    'success' => true,
    'currentHost' => $httpHost,
    'networkHost' => $networkHost,
    'isLocal' => $isLocal,
    'protocol' => (!empty($_SERVER['HTTPS']) && $_SERVER['HTTPS'] !== 'off') ? 'https://' : 'http://'
]);
