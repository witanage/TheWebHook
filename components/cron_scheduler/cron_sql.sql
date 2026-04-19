INSERT INTO menu_items (title, description, icon, route, display_order, is_active) 
VALUES ('Cron Job Scheduler', 'Schedule and monitor HTTP requests with cron-like scheduling', '⏰', '/cron-scheduler', 10, 1)
ON DUPLICATE KEY UPDATE
    title = VALUES(title),
    description = VALUES(description),
    icon = VALUES(icon),
    route = VALUES(route),
    display_order = VALUES(display_order),
    is_active = VALUES(is_active);
    
    
-- =============================================================================
-- Cron Scheduler Tables Migration
-- =============================================================================
-- This migration adds tables for the cron job scheduler component
-- =============================================================================

USE webhook_viewer;

-- =============================================================================
-- CRON SCHEDULER TABLES
-- =============================================================================

-- Cron folders table (organize jobs into folders)
CREATE TABLE IF NOT EXISTS cron_folders (
    id INT AUTO_INCREMENT PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    display_order INT DEFAULT 0,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
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

-- Create indexes for cron_folders
CREATE INDEX idx_cron_folders_display_order ON cron_folders(display_order);
