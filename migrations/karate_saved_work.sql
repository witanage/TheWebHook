-- Migration: Create karate_saved_work table
-- Purpose: Store Karate generator work for users to persist data across sessions

CREATE TABLE IF NOT EXISTS karate_saved_work (
    id INT AUTO_INCREMENT PRIMARY KEY,
    user_id INT NOT NULL,
    work_name VARCHAR(255) NOT NULL DEFAULT 'My Work',
    feature_config JSON NOT NULL,
    scenarios_data JSON NOT NULL,
    env_variables JSON,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    INDEX idx_user_id (user_id),
    INDEX idx_updated_at (updated_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
