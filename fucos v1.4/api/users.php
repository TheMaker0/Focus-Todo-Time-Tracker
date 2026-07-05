<?php
header('Content-Type: application/json');
require_once __DIR__ . '/db_config.php';

$baseDir = dirname(__DIR__);
$usersDir = $baseDir . '/users';
$accountsFile = $usersDir . '/accounts.json';

if (!is_dir($usersDir)) {
    mkdir($usersDir, 0755, true);
}

if (defined('USE_MYSQL') && USE_MYSQL) {
    db_init_tables();
}

$defaultUsers = [
    'gen' => '123',
    'mark' => '123',
    'it' => '123',
    'jinky' => '123',
    'romer' => '123',
    'ricky' => '123',
    'joy' => '123'
];
$accounts = loadAccounts($accountsFile);
$accountsChanged = false;
foreach ($defaultUsers as $defaultUser => $defaultPassword) {
    if (!isset($accounts[$defaultUser])) {
        $accounts[$defaultUser] = [
            'hash' => password_hash($defaultPassword, PASSWORD_DEFAULT),
            'display' => ucfirst($defaultUser),
            'role' => $defaultUser === 'it' ? 'admin' : 'user',
            'createdAt' => time(),
        ];
        $accountsChanged = true;
    }
    $userFile = $usersDir . '/' . $defaultUser . '.json';
    if (!file_exists($userFile)) {
        $payload = ['items' => [], 'history' => [], 'dayLogs' => []];
        file_put_contents($userFile, json_encode($payload, JSON_PRETTY_PRINT | JSON_UNESCAPED_SLASHES) . "\n");
    }
}
if ($accountsChanged) {
    saveAccounts($accountsFile, $accounts);
}

$action = isset($_GET['action']) ? $_GET['action'] : '';

function safeUserName($value) {
    $clean = preg_replace('/[^a-z0-9_-]+/i', '-', strtolower(trim($value)));
    return trim($clean, '-');
}

function getUserSchemaInfo($pdo) {
    static $schema = null;
    if ($schema !== null) {
        return $schema;
    }

    $schema = [
        'passwordColumn' => 'password_hash',
        'createdColumn' => 'created_at'
    ];

    try {
        $stmt = $pdo->prepare('SHOW COLUMNS FROM `' . DB_TABLE_USERS . '` LIKE :column');
        $stmt->execute([':column' => 'password_hash']);
        if (!$stmt->fetch()) {
            $schema['passwordColumn'] = 'password';
        }

        $stmt = $pdo->prepare('SHOW COLUMNS FROM `' . DB_TABLE_USERS . '` LIKE :column');
        $stmt->execute([':column' => 'created_at']);
        if (!$stmt->fetch()) {
            $schema['createdColumn'] = 'created';
        }
    } catch (PDOException $e) {
        // Keep defaults if schema detection fails.
    }

    return $schema;
}

function verifyPasswordValue($rawPassword, $stored) {
    if ($stored === null || $stored === '') {
        return false;
    }
    if (password_verify($rawPassword, $stored)) {
        return true;
    }
    return hash_equals((string)$stored, (string)$rawPassword);
}

function loadAccounts($file) {
    if (defined('USE_MYSQL') && USE_MYSQL) {
        $pdo = db_connect();
        if (!$pdo) {
            return [];
        }

        $schema = getUserSchemaInfo($pdo);
        $passwordCol = $schema['passwordColumn'];
        $createdCol = $schema['createdColumn'];

        $stmt = $pdo->query('SELECT username, display_name, role, `' . $passwordCol . '` AS password_value, `' . $createdCol . '` AS created_at FROM ' . DB_TABLE_USERS);
        $rows = $stmt->fetchAll();
        $accounts = [];
        foreach ($rows as $row) {
            $accounts[$row['username']] = [
                'hash' => isset($row['password_value']) ? $row['password_value'] : '',
                'display' => $row['display_name'],
                'role' => $row['role'],
                'createdAt' => isset($row['created_at']) ? strtotime($row['created_at']) : null,
            ];
        }
        return $accounts;
    }

    if (!file_exists($file)) return [];
    $contents = file_get_contents($file);
    if ($contents === false) return [];
    $data = json_decode($contents, true);
    return is_array($data) ? $data : [];
}

function saveAccounts($file, $accounts) {
    if (defined('USE_MYSQL') && USE_MYSQL) {
        $pdo = db_connect();
        if (!$pdo) {
            return;
        }

        $schema = getUserSchemaInfo($pdo);
        $passwordCol = $schema['passwordColumn'];

        foreach ($accounts as $username => $account) {
            $stmt = $pdo->prepare('SELECT id FROM ' . DB_TABLE_USERS . ' WHERE username = :username');
            $stmt->execute([':username' => $username]);
            $exists = $stmt->fetch();
            if ($exists) {
                $stmt = $pdo->prepare('UPDATE ' . DB_TABLE_USERS . ' SET display_name = :display, `' . $passwordCol . '` = :hash, role = :role WHERE username = :username');
                $stmt->execute([':display' => $account['display'], ':hash' => $account['hash'], ':role' => isset($account['role']) ? $account['role'] : 'user', ':username' => $username]);
            } else {
                $stmt = $pdo->prepare('INSERT INTO ' . DB_TABLE_USERS . ' (username, display_name, `' . $passwordCol . '`, role) VALUES (:username, :display, :hash, :role)');
                $stmt->execute([':username' => $username, ':display' => $account['display'], ':hash' => $account['hash'], ':role' => isset($account['role']) ? $account['role'] : 'user']);
            }
        }
        return;
    }

    file_put_contents($file, json_encode($accounts, JSON_PRETTY_PRINT | JSON_UNESCAPED_SLASHES) . "\n");
}

function loadUserData($user) {
    if (defined('USE_MYSQL') && USE_MYSQL) {
        $pdo = db_connect();
        if (!$pdo) {
            return false;
        }
        $stmt = $pdo->prepare('SELECT data FROM ' . DB_TABLE_USER_DATA . ' WHERE username = :username');
        $stmt->execute([':username' => $user]);
        $row = $stmt->fetch();
        return $row ? $row['data'] : false;
    }

    $userFile = __DIR__ . '/../users/' . $user . '.json';
    if (!file_exists($userFile)) {
        return false;
    }
    return file_get_contents($userFile);
}

function saveUserData($user, $json) {
    if (defined('USE_MYSQL') && USE_MYSQL) {
        $pdo = db_connect();
        if (!$pdo) {
            return false;
        }
        $stmt = $pdo->prepare('SELECT id FROM ' . DB_TABLE_USER_DATA . ' WHERE username = :username');
        $stmt->execute([':username' => $user]);
        $exists = $stmt->fetch();
        if ($exists) {
            $stmt = $pdo->prepare('UPDATE ' . DB_TABLE_USER_DATA . ' SET data = :data, updated_at = CURRENT_TIMESTAMP WHERE username = :username');
            return $stmt->execute([':data' => $json, ':username' => $user]);
        }
        $stmt = $pdo->prepare('INSERT INTO ' . DB_TABLE_USER_DATA . ' (username, data) VALUES (:username, :data)');
        return $stmt->execute([':username' => $user, ':data' => $json]);
    }

    $userFile = __DIR__ . '/../users/' . $user . '.json';
    return file_put_contents($userFile, $json) !== false;
}

function listMySqlUsers() {
    $pdo = db_connect();
    if (!$pdo) {
        return [];
    }
    $stmt = $pdo->query('SELECT username, display_name, role, created_at FROM ' . DB_TABLE_USERS . ' ORDER BY username');
    return $stmt->fetchAll();
}

if ($_SERVER['REQUEST_METHOD'] === 'POST' && ($action === 'register' || $action === 'login')) {
    $input = json_decode(file_get_contents('php://input'), true);
    $user = isset($input['user']) ? safeUserName($input['user']) : '';
    $display = isset($input['display']) ? trim($input['display']) : $user;
    $password = isset($input['password']) ? trim($input['password']) : '';
    $isAdmin = isset($input['admin']) && ($input['admin'] === true || $input['admin'] === '1' || $input['admin'] === 1 || $input['admin'] === 'true');

    if (!$user) {
        http_response_code(400);
        echo json_encode(['error' => 'Invalid username']);
        exit;
    }
    if (!$password) {
        http_response_code(400);
        echo json_encode(['error' => 'Password is required']);
        exit;
    }

    $accounts = loadAccounts($accountsFile);
    $userExists = isset($accounts[$user]);

    if ($action === 'login') {
        if (!$userExists) {
            http_response_code(404);
            echo json_encode(['error' => 'User not found']);
            exit;
        }
        if (!verifyPasswordValue($password, $accounts[$user]['hash'])) {
            http_response_code(403);
            echo json_encode(['error' => 'Incorrect password']);
            exit;
        }
    } else {
        if ($userExists) {
            if (!verifyPasswordValue($password, $accounts[$user]['hash'])) {
                http_response_code(403);
                echo json_encode(['error' => 'Incorrect password']);
                exit;
            }
        } else {
            $role = $user === 'it' ? 'admin' : ($isAdmin ? 'admin' : 'user');
            $accounts[$user] = ['hash' => password_hash($password, PASSWORD_DEFAULT), 'display' => $display, 'role' => $role, 'createdAt' => time()];
            saveAccounts($accountsFile, $accounts);
        }
    }

    $payload = ['items' => [], 'history' => [], 'dayLogs' => []];
    $json = json_encode($payload, JSON_PRETTY_PRINT | JSON_UNESCAPED_SLASHES);
    if ($json === false) {
        http_response_code(500);
        echo json_encode(['error' => 'Could not create user payload']);
        exit;
    }

    if (defined('USE_MYSQL') && USE_MYSQL) {
        if (loadUserData($user) === false) {
            saveUserData($user, $json);
        }
    } else {
        $userFile = $usersDir . '/' . $user . '.json';
        if (!file_exists($userFile)) {
            if (file_put_contents($userFile, $json . "\n") === false) {
                http_response_code(500);
                echo json_encode(['error' => 'Could not create user file']);
                exit;
            }
        }
    }

    $role = isset($accounts[$user]['role']) ? $accounts[$user]['role'] : ($user === 'it' ? 'admin' : 'user');
    echo json_encode(['status' => 'ok', 'user' => $user, 'display' => $display, 'role' => $role]);
    exit;
}

if ($_SERVER['REQUEST_METHOD'] === 'GET' && $action === 'list') {
    $accounts = loadAccounts($accountsFile);
    $users = [];
    foreach ($accounts as $username => $account) {
        $data = loadUserData($username);
        $payload = $data ? json_decode($data, true) : ['items' => [], 'history' => [], 'dayLogs' => []];
        $items = isset($payload['items']) && is_array($payload['items']) ? $payload['items'] : [];
        $history = isset($payload['history']) && is_array($payload['history']) ? $payload['history'] : [];
        $dayLogs = isset($payload['dayLogs']) && is_array($payload['dayLogs']) ? $payload['dayLogs'] : [];
        $entries = 0;
        foreach ($dayLogs as $day) {
            if (isset($day['entries']) && is_array($day['entries'])) {
                $entries += count($day['entries']);
            }
        }
        $users[] = [
            'user' => $username,
            'display' => $account['display'],
            'role' => isset($account['role']) ? $account['role'] : ($username === 'it' ? 'admin' : 'user'),
            'createdAt' => isset($account['createdAt']) ? $account['createdAt'] : null,
            'totalItems' => count($items),
            'doneCount' => count(array_filter($items, fn($i) => isset($i['done']) && $i['done'])),
            'outstandingCount' => count($items) - count(array_filter($items, fn($i) => isset($i['done']) && $i['done'])),
            'historyCount' => count($history),
            'dayLogCount' => $entries,
        ];
    }
    echo json_encode(array_values($users));
    exit;
}

if ($_SERVER['REQUEST_METHOD'] === 'GET' && $action === 'load') {
    $user = isset($_GET['user']) ? safeUserName($_GET['user']) : '';
    if (!$user) {
        http_response_code(400);
        echo json_encode(['error' => 'Missing user']);
        exit;
    }

    $contents = loadUserData($user);
    if ($contents === false) {
        http_response_code(404);
        echo json_encode(['error' => 'User not found']);
        exit;
    }

    echo $contents;
    exit;
}

http_response_code(400);
echo json_encode(['error' => 'Invalid request']);
