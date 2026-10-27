<?php
header('Content-Type: application/json');
header('Access-Control-Allow-Origin: *');

echo json_encode([
    'success' => true,
    'iceServers' => [
        ['urls' => 'stun:stun.l.google.com:19302'],
        ['urls' => 'stun:stun1.l.google.com:19302'],
        ['urls' => 'stun:stun.cloudflare.com:3478'],
        [
            'urls' => [
                'turn:turn.evan-brass.net:3478',
                'turn:turn.evan-brass.net:3478?transport=tcp',
                'turns:turn.evan-brass.net:443?transport=tcp'
            ],
            'username' => 'user',
            'credential' => 'password'
        ]
    ]
]);
