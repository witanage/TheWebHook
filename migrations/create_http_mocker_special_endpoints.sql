-- Create special_endpoints table for HTTP Mocker
-- This table stores user-specific special endpoints with custom HTTP codes and response delays

CREATE TABLE IF NOT EXISTS special_endpoints (
    id INT AUTO_INCREMENT PRIMARY KEY,
    user_id INT NOT NULL,
    endpoint_name VARCHAR(255) NOT NULL,
    http_code INT NOT NULL,
    delay_ms INT NOT NULL DEFAULT 0,
    description TEXT,
    is_active TINYINT DEFAULT 1,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    UNIQUE KEY unique_user_endpoint (user_id, endpoint_name)
);

-- Create indexes for better query performance
CREATE INDEX idx_special_endpoints_user_id ON special_endpoints(user_id);
CREATE INDEX idx_special_endpoints_is_active ON special_endpoints(is_active);
CREATE INDEX idx_special_endpoints_user_active ON special_endpoints(user_id, is_active);
