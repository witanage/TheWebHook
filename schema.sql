-- =============================================================================
-- TheWebHook Database Schema
-- =============================================================================
-- This schema includes all tables, indexes, and default data for TheWebHook
-- Developer Tools Dashboard application.
-- =============================================================================

-- Create database (if needed)
CREATE DATABASE IF NOT EXISTS webhook_viewer;
USE webhook_viewer;

-- =============================================================================
-- CORE TABLES
-- =============================================================================

-- Users table
CREATE TABLE IF NOT EXISTS users (
    id INT AUTO_INCREMENT PRIMARY KEY,
    username VARCHAR(255) UNIQUE NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    status TINYINT DEFAULT 0,
    is_admin TINYINT DEFAULT 0,
    default_app VARCHAR(255) DEFAULT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);

-- Create index for default_app
CREATE INDEX IF NOT EXISTS idx_users_default_app ON users(default_app);

-- Webhook responses table
CREATE TABLE IF NOT EXISTS webhook_responses (
    id INT AUTO_INCREMENT PRIMARY KEY,
    user_id INT NOT NULL,
    webhook_id VARCHAR(255) NOT NULL,
    method VARCHAR(10),
    headers TEXT,
    body TEXT,
    query_params TEXT,
    timestamp DATETIME NOT NULL,
    is_read TINYINT DEFAULT 0,
    client_ip VARCHAR(45),
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

-- Create indexes for webhook_responses
CREATE INDEX IF NOT EXISTS idx_webhook_responses_user_id ON webhook_responses(user_id);
CREATE INDEX IF NOT EXISTS idx_webhook_responses_webhook_id ON webhook_responses(webhook_id);
CREATE INDEX IF NOT EXISTS idx_webhook_responses_timestamp ON webhook_responses(timestamp);

-- Menu items table (applications)
CREATE TABLE IF NOT EXISTS menu_items (
    id INT AUTO_INCREMENT PRIMARY KEY,
    title VARCHAR(255) NOT NULL,
    description TEXT,
    icon VARCHAR(50),
    route VARCHAR(255) NOT NULL,
    display_order INT DEFAULT 0,
    is_active TINYINT DEFAULT 1,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);

-- User menu assignments (for per-user app access control)
CREATE TABLE IF NOT EXISTS user_menu_items (
    id INT AUTO_INCREMENT PRIMARY KEY,
    user_id INT NOT NULL,
    menu_item_id INT NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    FOREIGN KEY (menu_item_id) REFERENCES menu_items(id) ON DELETE CASCADE,
    UNIQUE KEY unique_user_menu (user_id, menu_item_id)
);

-- Create indexes for user_menu_items
CREATE INDEX IF NOT EXISTS idx_user_menu_items_user_id ON user_menu_items(user_id);
CREATE INDEX IF NOT EXISTS idx_user_menu_items_menu_item_id ON user_menu_items(menu_item_id);

-- =============================================================================
-- HTTP STATUS CODE TESTER TABLES
-- =============================================================================

-- Sequence endpoints table (combines special_endpoints and rotating_endpoints features)
-- This is the primary table for HTTP status code testing with sequences
CREATE TABLE IF NOT EXISTS sequence_endpoints (
    id INT AUTO_INCREMENT PRIMARY KEY,
    user_id INT NOT NULL,
    endpoint_name VARCHAR(255) NOT NULL,
    sequence_config JSON NOT NULL,  -- JSON array of steps: [{"http_code": 200, "delay_ms": 0, "payload": {...}}, ...]
    current_index INT NOT NULL DEFAULT 0,
    description TEXT,
    is_active TINYINT NOT NULL DEFAULT 1,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    UNIQUE KEY unique_user_sequence_endpoint (user_id, endpoint_name)
);

-- Create indexes for sequence_endpoints
CREATE INDEX IF NOT EXISTS idx_sequence_endpoints_user_id ON sequence_endpoints(user_id);
CREATE INDEX IF NOT EXISTS idx_sequence_endpoints_is_active ON sequence_endpoints(is_active);
CREATE INDEX IF NOT EXISTS idx_sequence_endpoints_user_active ON sequence_endpoints(user_id, is_active);

-- Special endpoints table (legacy - for simple endpoints with delays)
-- Kept for backward compatibility
CREATE TABLE IF NOT EXISTS special_endpoints (
    id INT AUTO_INCREMENT PRIMARY KEY,
    user_id INT NOT NULL,
    endpoint_name VARCHAR(255) NOT NULL,
    http_code INT NOT NULL,
    delay_ms INT NOT NULL DEFAULT 0,
    description TEXT,
    response_payload JSON DEFAULT NULL,
    is_active TINYINT DEFAULT 1,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    UNIQUE KEY unique_user_endpoint (user_id, endpoint_name)
);

-- Create indexes for special_endpoints
CREATE INDEX IF NOT EXISTS idx_special_endpoints_user_id ON special_endpoints(user_id);
CREATE INDEX IF NOT EXISTS idx_special_endpoints_is_active ON special_endpoints(is_active);
CREATE INDEX IF NOT EXISTS idx_special_endpoints_user_active ON special_endpoints(user_id, is_active);

-- Rotating endpoints table (legacy - for simple rotating HTTP codes)
-- Kept for backward compatibility
CREATE TABLE IF NOT EXISTS rotating_endpoints (
    id INT AUTO_INCREMENT PRIMARY KEY,
    user_id INT NOT NULL,
    endpoint_name VARCHAR(255) NOT NULL,
    http_codes JSON NOT NULL,
    current_index INT DEFAULT 0,
    description TEXT,
    response_payload JSON DEFAULT NULL,
    is_active TINYINT DEFAULT 1,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    UNIQUE KEY unique_user_rotating_endpoint (user_id, endpoint_name)
);

-- Create indexes for rotating_endpoints
CREATE INDEX IF NOT EXISTS idx_rotating_endpoints_user_id ON rotating_endpoints(user_id);
CREATE INDEX IF NOT EXISTS idx_rotating_endpoints_is_active ON rotating_endpoints(is_active);
CREATE INDEX IF NOT EXISTS idx_rotating_endpoints_user_active ON rotating_endpoints(user_id, is_active);

-- =============================================================================
-- TOTP AUTHENTICATOR TABLES
-- =============================================================================

-- TOTP accounts table (stores user's 2FA accounts)
CREATE TABLE IF NOT EXISTS totp_accounts (
    id INT AUTO_INCREMENT PRIMARY KEY,
    user_id INT NOT NULL,
    service_name VARCHAR(255) NOT NULL,
    account_identifier VARCHAR(255),
    secret_key VARCHAR(255) NOT NULL,
    issuer VARCHAR(255),
    digits INT DEFAULT 6,
    period INT DEFAULT 30,
    algorithm VARCHAR(10) DEFAULT 'SHA1',
    color VARCHAR(7) DEFAULT '#007bff',
    icon VARCHAR(50),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    INDEX idx_user_id (user_id),
    INDEX idx_service_name (service_name)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- =============================================================================
-- DEFAULT DATA
-- =============================================================================

-- Insert default menu items (applications)
INSERT INTO menu_items (title, description, icon, route, display_order, is_active) VALUES
    ('Webhook Viewer', 'Monitor and manage webhooks in real-time', '📡', '/webhook-viewer', 1, 1),
    ('JSON Comparison Tool', 'Compare two JSON objects and visualize differences', '🔄', '/json-compare', 2, 1),
    ('HTTP Status Code Tester', 'Test and simulate different HTTP status codes', '🌐', '/http-codes', 3, 1),
    ('AWS Log Comparison Tool', 'Compare AWS CloudWatch log exports', '📊', '/aws-log-compare', 4, 1),
    ('Karate Feature Generator', 'Generate Karate API test feature files from request/response payloads', '🥋', '/karate-generator', 5, 1),
    ('TOTP Authenticator', 'Two-factor authentication code generator like Authy', '🔐', '/totp-authenticator', 6, 1),
    ('Code Formatter', 'Format code in any language with IntelliJ-style standards or convert to one-line', '💻', '/code-formatter', 7, 1)
ON DUPLICATE KEY UPDATE
    title = VALUES(title),
    description = VALUES(description),
    icon = VALUES(icon),
    route = VALUES(route);

-- =============================================================================
-- SCHEMA VERSION
-- =============================================================================
-- Schema version: 1.2
-- Last updated: 2025-11-17
-- Description: Added Code Formatter application
-- =============================================================================
