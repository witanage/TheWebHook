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
    api_token VARCHAR(64) UNIQUE DEFAULT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);

-- Create indexes for users table
CREATE INDEX IF NOT EXISTS idx_users_default_app ON users(default_app);
CREATE INDEX IF NOT EXISTS idx_users_api_token ON users(api_token);

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

-- Stored images table for HTTP status code tester
CREATE TABLE IF NOT EXISTS http_status_images (
    id INT AUTO_INCREMENT PRIMARY KEY,
    user_id INT NOT NULL,
    name VARCHAR(255) NOT NULL,
    filename VARCHAR(255) NOT NULL,
    content_type VARCHAR(100) NOT NULL,
    file_size INT NOT NULL,
    width INT,
    height INT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

-- Create indexes for http_status_images
CREATE INDEX IF NOT EXISTS idx_http_status_images_user_id ON http_status_images(user_id);
CREATE INDEX IF NOT EXISTS idx_http_status_images_created_at ON http_status_images(created_at);

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
-- KARATE FEATURE GENERATOR TABLES
-- =============================================================================

-- Karate saved work table (stores user's saved projects)
CREATE TABLE IF NOT EXISTS karate_saved_work (
    id INT AUTO_INCREMENT PRIMARY KEY,
    user_id INT NOT NULL,
    work_name VARCHAR(255) NOT NULL,
    feature_config JSON NOT NULL,
    scenarios_data JSON NOT NULL,
    env_variables JSON,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    INDEX idx_user_id (user_id),
    INDEX idx_created_at (created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- =============================================================================
-- JSON COMPARISON TABLES
-- =============================================================================

-- JSON comparisons table (stores user's saved comparisons)
CREATE TABLE IF NOT EXISTS json_comparisons (
    id INT AUTO_INCREMENT PRIMARY KEY,
    user_id INT NOT NULL,
    comparison_name VARCHAR(255) NOT NULL,
    json1 MEDIUMTEXT NOT NULL,
    json2 MEDIUMTEXT NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    INDEX idx_user_id (user_id),
    INDEX idx_created_at (created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- =============================================================================
-- CRON SCHEDULER TABLES
-- =============================================================================

-- Cron folders table (organize jobs into folders)
CREATE TABLE IF NOT EXISTS cron_folders (
    id INT AUTO_INCREMENT PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    display_order INT DEFAULT 0,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    INDEX idx_cron_folders_display_order (display_order)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Cron jobs table (job definitions)
CREATE TABLE IF NOT EXISTS cron_jobs (
    id INT AUTO_INCREMENT PRIMARY KEY,
    folder_id INT DEFAULT NULL,
    enabled TINYINT NOT NULL DEFAULT 1,
    title VARCHAR(255) NOT NULL,
    url VARCHAR(2048) NOT NULL,
    request_method VARCHAR(10) NOT NULL DEFAULT 'GET',
    request_timeout INT NOT NULL DEFAULT 30,
    save_responses TINYINT NOT NULL DEFAULT 0,
    redirect_success TINYINT NOT NULL DEFAULT 0,

    -- Authentication
    auth_enabled TINYINT NOT NULL DEFAULT 0,
    auth_user VARCHAR(255) DEFAULT NULL,
    auth_password VARCHAR(255) DEFAULT NULL,

    -- Request configuration
    headers JSON DEFAULT NULL,
    body TEXT DEFAULT NULL,

    -- Notification settings
    notify_on_failure TINYINT NOT NULL DEFAULT 0,
    notify_failure_count INT NOT NULL DEFAULT 1,
    notify_on_success TINYINT NOT NULL DEFAULT 0,
    notify_on_disable TINYINT NOT NULL DEFAULT 0,

    -- Schedule configuration
    schedule_timezone VARCHAR(100) NOT NULL DEFAULT 'UTC',
    schedule_minutes JSON NOT NULL DEFAULT ('[-1]'),
    schedule_hours JSON NOT NULL DEFAULT ('[-1]'),
    schedule_mdays JSON NOT NULL DEFAULT ('[-1]'),
    schedule_months JSON NOT NULL DEFAULT ('[-1]'),
    schedule_wdays JSON NOT NULL DEFAULT ('[-1]'),
    schedule_expires_at DATETIME DEFAULT NULL,

    -- Execution tracking
    last_status INT DEFAULT 0,
    last_duration INT DEFAULT 0,
    last_execution DATETIME DEFAULT NULL,
    next_execution DATETIME DEFAULT NULL,
    consecutive_failures INT NOT NULL DEFAULT 0,

    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,

    FOREIGN KEY (folder_id) REFERENCES cron_folders(id) ON DELETE SET NULL,
    INDEX idx_cron_jobs_enabled (enabled),
    INDEX idx_cron_jobs_folder_id (folder_id),
    INDEX idx_cron_jobs_last_status (last_status),
    INDEX idx_cron_jobs_enabled_folder (enabled, folder_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Cron job execution history table
CREATE TABLE IF NOT EXISTS cron_job_history (
    id INT AUTO_INCREMENT PRIMARY KEY,
    job_id INT NOT NULL,
    date_executed DATETIME NOT NULL,
    date_planned DATETIME NOT NULL,
    jitter_ms INT NOT NULL DEFAULT 0,
    url VARCHAR(2048) NOT NULL,
    duration_ms INT NOT NULL DEFAULT 0,
    status INT NOT NULL DEFAULT 0,
    status_text VARCHAR(255) DEFAULT NULL,
    http_status INT DEFAULT NULL,
    response_headers TEXT DEFAULT NULL,
    response_body TEXT DEFAULT NULL,

    -- Timing statistics (in microseconds)
    stats_name_lookup INT DEFAULT NULL,
    stats_connect INT DEFAULT NULL,
    stats_tls INT DEFAULT NULL,
    stats_transfer_start INT DEFAULT NULL,
    stats_total INT DEFAULT NULL,

    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,

    FOREIGN KEY (job_id) REFERENCES cron_jobs(id) ON DELETE CASCADE,
    INDEX idx_cron_job_history_job_id (job_id),
    INDEX idx_cron_job_history_date_executed (date_executed),
    INDEX idx_cron_job_history_job_date (job_id, date_executed)
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
    ('Code Formatter', 'Beautify code like Postman API or convert to single-line format', '💻', '/code-formatter', 7, 1),
    ('PDF Process', 'All-in-one PDF tools: merge, split, compress, convert, rotate, watermark & more', '📄', '/pdf-process', 8, 1),
    ('Image Process', 'All-in-one image tools: resize, convert, compress, rotate, crop, filters & more', '🖼️', '/image-process', 9, 1),
    ('Cron Job Scheduler', 'Schedule and monitor HTTP requests with cron-like scheduling', '⏰', '/cron-scheduler', 10, 1)
ON DUPLICATE KEY UPDATE
    title = VALUES(title),
    description = VALUES(description),
    icon = VALUES(icon),
    route = VALUES(route);

-- =============================================================================
-- SCHEMA VERSION
-- ==================6
-- Last updated: 2026-04-19
-- Description: Added Cron Job Scheduler component with cron_folders, cron_jobs, and cron_job_history table
-- Description: Added Image Process app to default menu items
-- =============================================================================
