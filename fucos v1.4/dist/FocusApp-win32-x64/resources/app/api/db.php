<?php
header('Content-Type: application/json');
require_once __DIR__ . '/db_config.php';

if (defined('USE_MYSQL') && USE_MYSQL) {
    db_init_tables();
}

$baseDir = dirname(__DIR__);
$databasePath = $baseDir . '/database.json';
$usersDir = $baseDir . '/users';

if (!is_dir($usersDir)) {
    mkdir($usersDir, 0755, true);
}

function saveDatabaseToMySQL($user, $data) {
    $pdo = db_connect();
    if (!$pdo) {
        return false;
    }

    $payload = json_encode($data, JSON_PRETTY_PRINT | JSON_UNESCAPED_SLASHES);
    if ($payload === false) {
        return false;
    }

    $stmt = $pdo->prepare('SELECT id FROM ' . DB_TABLE_USER_DATA . ' WHERE username = :username');
    $stmt->execute([':username' => $user]);
    $existing = $stmt->fetch();

    if ($existing) {
        $stmt = $pdo->prepare('UPDATE ' . DB_TABLE_USER_DATA . ' SET data = :data, updated_at = CURRENT_TIMESTAMP WHERE username = :username');
        return $stmt->execute([':data' => $payload, ':username' => $user]);
    }

    $stmt = $pdo->prepare('INSERT INTO ' . DB_TABLE_USER_DATA . ' (username, data) VALUES (:username, :data)');
    return $stmt->execute([':username' => $user, ':data' => $payload]);
}

$user = isset($_GET['user']) ? preg_replace('/[^a-z0-9_-]+/i', '-', strtolower($_GET['user'])) : '';
$targetPath = $user ? $usersDir . '/' . $user . '.json' : $databasePath;

if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    http_response_code(405);
    echo json_encode(['error' => 'Method not allowed']);
    exit;
}

$input = file_get_contents('php://input');
$data = json_decode($input, true);

if (!is_array($data) || !isset($data['items']) || !isset($data['history']) || !isset($data['dayLogs'])) {
    http_response_code(400);
    echo json_encode(['error' => 'Invalid database payload']);
    exit;
}

if (!is_array($data['items']) || !is_array($data['history']) || !is_array($data['dayLogs'])) {
    http_response_code(400);
    echo json_encode(['error' => 'Payload arrays are required']);
    exit;
}

$json = json_encode($data, JSON_PRETTY_PRINT | JSON_UNESCAPED_SLASHES);
if ($json === false) {
    http_response_code(500);
    echo json_encode(['error' => 'Failed to encode JSON']);
    exit;
}

if (defined('USE_MYSQL') && USE_MYSQL && $user) {
    if (saveDatabaseToMySQL($user, $data)) {
        echo json_encode(['status' => 'ok']);
        exit;
    }
    http_response_code(500);
    echo json_encode(['error' => 'Failed to save database to MySQL']);
    exit;
}

$json .= "\n";

if (file_put_contents($targetPath, $json) === false) {
    http_response_code(500);
    echo json_encode(['error' => 'Failed to save database file']);
    exit;
}

echo json_encode(['status' => 'ok']);
