<?php
// MySQL configuration for phpMyAdmin / MySQL database storage.
// Update these values to match your MySQL server and phpMyAdmin credentials.

define('USE_MYSQL', true);
define('DB_HOST', '127.0.0.1');
define('DB_PORT', 3306);
define('DB_NAME', 'fucos');
define('DB_USER', 'root');
define('DB_PASSWORD', '');
define('DB_CHARSET', 'utf8mb4');

define('DB_TABLE_USERS', 'users');
define('DB_TABLE_USER_DATA', 'user_data');

function db_connect() {
    static $pdo = null;
    if ($pdo !== null) {
        return $pdo;
    }

    $dsn = sprintf('mysql:host=%s;port=%d;dbname=%s;charset=%s', DB_HOST, DB_PORT, DB_NAME, DB_CHARSET);
    $options = [
        PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION,
        PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
        PDO::ATTR_EMULATE_PREPARES => false,
    ];

    try {
        $pdo = new PDO($dsn, DB_USER, DB_PASSWORD, $options);
        return $pdo;
    } catch (PDOException $e) {
        $message = $e->getMessage();
        if (strpos($message, 'Unknown database') !== false || strpos($message, '1049') !== false) {
            try {
                $dsnNoDb = sprintf('mysql:host=%s;port=%d;charset=%s', DB_HOST, DB_PORT, DB_CHARSET);
                $pdoNoDb = new PDO($dsnNoDb, DB_USER, DB_PASSWORD, $options);
                $pdoNoDb->exec(
                    'CREATE DATABASE IF NOT EXISTS `' . DB_NAME . '` CHARACTER SET ' . DB_CHARSET . ' COLLATE ' . DB_CHARSET . '_unicode_ci'
                );
                $pdo = new PDO($dsn, DB_USER, DB_PASSWORD, $options);
                return $pdo;
            } catch (PDOException $inner) {
                error_log('DB creation failed: ' . $inner->getMessage());
                return null;
            }
        }
        error_log('DB Connection failed: ' . $message);
        return null;
    }
}

function db_init_tables() {
    $pdo = db_connect();
    if (!$pdo) {
        return false;
    }

    $pdo->exec(
        'CREATE TABLE IF NOT EXISTS `' . DB_TABLE_USERS . '` (
            `id` INT AUTO_INCREMENT PRIMARY KEY,
            `username` VARCHAR(100) NOT NULL UNIQUE,
            `display_name` VARCHAR(100) NOT NULL,
            `password_hash` VARCHAR(255) NOT NULL,
            `role` ENUM("user","admin") NOT NULL DEFAULT "user",
            `created_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
        ) ENGINE=InnoDB DEFAULT CHARSET=' . DB_CHARSET
    );

    $pdo->exec(
        'CREATE TABLE IF NOT EXISTS `' . DB_TABLE_USER_DATA . '` (
            `id` INT AUTO_INCREMENT PRIMARY KEY,
            `username` VARCHAR(100) NOT NULL,
            `data` JSON NOT NULL,
            `updated_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
            FOREIGN KEY (`username`) REFERENCES `' . DB_TABLE_USERS . '`(`username`) ON DELETE CASCADE
        ) ENGINE=InnoDB DEFAULT CHARSET=' . DB_CHARSET
    );

    return true;
}
