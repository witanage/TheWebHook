-- Migration: Add Karate Feature Generator to menu items
-- Date: 2025-11-11
-- Description: Adds the Karate Feature Generator application to the menu

USE webhook_viewer;

-- Insert the Karate Generator menu item
INSERT INTO menu_items (title, description, icon, route, display_order, is_active)
VALUES ('Karate Feature Generator', 'Generate Karate API test feature files from request/response payloads', '🥋', '/karate-generator', 5, 1)
ON DUPLICATE KEY UPDATE
    title = VALUES(title),
    description = VALUES(description),
    icon = VALUES(icon),
    route = VALUES(route),
    display_order = VALUES(display_order);

SELECT 'Karate Generator menu item added successfully' AS status;
