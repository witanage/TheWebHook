-- Add default_app column to users table
-- This column stores the route of the user's preferred default application

ALTER TABLE users ADD COLUMN default_app VARCHAR(255) DEFAULT NULL;

-- Add index for better query performance
CREATE INDEX idx_users_default_app ON users(default_app);
