-- Create rotating_endpoints table for HTTP Mocker
-- This table stores user-specific endpoints that cycle through multiple HTTP codes in sequence

CREATE TABLE IF NOT EXISTS rotating_endpoints (
    id INT AUTO_INCREMENT PRIMARY KEY,
    user_id INT NOT NULL,
    endpoint_name VARCHAR(255) NOT NULL,
    http_codes JSON NOT NULL,
    current_index INT DEFAULT 0,
    description TEXT,
    is_active TINYINT DEFAULT 1,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    UNIQUE KEY unique_user_rotating_endpoint (user_id, endpoint_name)
);

-- Create indexes for better query performance
CREATE INDEX idx_rotating_endpoints_user_id ON rotating_endpoints(user_id);
CREATE INDEX idx_rotating_endpoints_is_active ON rotating_endpoints(is_active);
CREATE INDEX idx_rotating_endpoints_user_active ON rotating_endpoints(user_id, is_active);
