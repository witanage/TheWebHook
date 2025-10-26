-- ============================================================
-- Migration: Add user menu items assignment feature
-- ============================================================
-- This allows assigning specific menu items to specific users
--
-- HOW TO RUN THIS MIGRATION:
--   mysql -u your_username -p your_database < user_menu_assignments.sql
--
-- BEHAVIOR:
--   - Users with NO assignments will see ALL menu items (default)
--   - Users with assignments will ONLY see assigned items
--   - Admins always see ALL menu items regardless of assignments
--
-- USAGE:
--   1. Go to Admin → User Management
--   2. Click the 📱 (Manage Apps) button next to a user
--   3. Check/uncheck which applications they can access
--   4. Click "Save Assignments"
-- ============================================================

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

-- Create indexes for faster lookups
CREATE INDEX idx_user_id ON user_menu_items(user_id);
CREATE INDEX idx_menu_item_id ON user_menu_items(menu_item_id);

-- Migration complete!
-- The system will work with or without this table.
-- Without the table: All users see all menu items (backward compatible)
-- With the table: Users can be restricted to specific menu items
