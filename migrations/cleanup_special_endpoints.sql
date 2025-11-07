-- =====================================================
-- Database Cleanup Queries for Special Endpoints
-- =====================================================
-- This file contains SQL queries to remove the Special Endpoints
-- feature and all related data from the database.
--
-- IMPORTANT: Run these queries only after verifying that:
-- 1. All users have migrated to Sequence Endpoints
-- 2. You have taken a backup of the database
-- 3. You understand this operation is IRREVERSIBLE
--
-- Date: 2025-01-XX
-- =====================================================

-- Step 1: Drop indexes on special_endpoints table
-- This improves performance when dropping the table
DROP INDEX IF EXISTS idx_special_endpoints_user_id ON special_endpoints;
DROP INDEX IF EXISTS idx_special_endpoints_is_active ON special_endpoints;
DROP INDEX IF EXISTS idx_special_endpoints_user_active ON special_endpoints;

-- Step 2: Drop the special_endpoints table
-- WARNING: This will permanently delete all special endpoint data
DROP TABLE IF EXISTS special_endpoints;

-- Step 3: Optional - Clean up migration records
-- If you track migrations in a separate table, remove the special endpoints migration records
-- Uncomment and adjust the following queries based on your migration tracking system:
--
-- DELETE FROM migrations WHERE migration_name = 'create_http_mocker_special_endpoints';
-- DELETE FROM migrations WHERE migration_name = 'add_response_payload_to_special_endpoints';

-- =====================================================
-- Verification Queries
-- =====================================================
-- Run these after cleanup to verify the removal was successful

-- Verify table is dropped
SHOW TABLES LIKE 'special_endpoints';
-- Expected result: Empty set (no rows)

-- Verify no orphaned indexes
SHOW INDEX FROM special_endpoints;
-- Expected result: Error 1146 (42S02): Table doesn't exist

-- =====================================================
-- Rollback Information
-- =====================================================
-- If you need to recreate the special_endpoints table, you can run:
-- migrations/create_http_mocker_special_endpoints.sql
-- migrations/add_response_payload_to_special_endpoints.sql
--
-- However, all data will be lost and cannot be recovered without
-- a database backup.
-- =====================================================
