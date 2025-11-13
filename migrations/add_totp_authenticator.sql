-- Migration: Add TOTP Authenticator Application
-- Description: Creates table for storing user's TOTP secrets for various services
-- Date: 2025-11-13

-- Create table for TOTP accounts
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

-- Add TOTP Authenticator to menu_items
INSERT INTO menu_items (name, url, icon, description, display_order, is_active)
VALUES (
    'TOTP Authenticator',
    '/totp-authenticator',
    'shield',
    'Two-factor authentication code generator like Authy',
    60,
    1
);
