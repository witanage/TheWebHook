-- Migration: Create sequence_endpoints table
-- This combines features from special_endpoints (delays, custom codes)
-- and rotating_endpoints (sequence rotation) into a more powerful feature

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

-- Create indexes for better query performance
CREATE INDEX idx_sequence_endpoints_user_id ON sequence_endpoints(user_id);
CREATE INDEX idx_sequence_endpoints_is_active ON sequence_endpoints(is_active);
CREATE INDEX idx_sequence_endpoints_user_active ON sequence_endpoints(user_id, is_active);
