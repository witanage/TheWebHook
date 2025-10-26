-- Migration: Add user menu items assignment feature
-- This allows assigning specific menu items to specific users

-- Create user_menu_items junction table
CREATE TABLE IF NOT EXISTS user_menu_items (
    id INT AUTO_INCREMENT PRIMARY KEY,
    user_id INT NOT NULL,
    menu_item_id INT NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    FOREIGN KEY (menu_item_id) REFERENCES menu_items(id) ON DELETE CASCADE,
    UNIQUE KEY unique_user_menu (user_id, menu_item_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- Create index for faster lookups
CREATE INDEX idx_user_id ON user_menu_items(user_id);
CREATE INDEX idx_menu_item_id ON user_menu_items(menu_item_id);

-- Note: Run this SQL to apply the migration
-- After running, users can be assigned specific menu items
-- Admins will see all menu items regardless of assignments
