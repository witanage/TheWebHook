-- =====================================================
-- Database Cleanup Queries for Rotating Endpoints
-- =====================================================
-- This file contains SQL queries to remove the Rotating Endpoints
-- feature and all related data from the database.
--
-- IMPORTANT: Run these queries only after verifying that:
-- 1. All users have migrated to Sequence Endpoints
-- 2. You have taken a backup of the database
-- 3. You understand this operation is IRREVERSIBLE
--
-- Date: 2025-01-XX
-- =====================================================

-- Step 1: Drop indexes on rotating_endpoints table
-- This improves performance when dropping the table
DROP INDEX IF EXISTS idx_rotating_endpoints_user_id ON rotating_endpoints;
DROP INDEX IF EXISTS idx_rotating_endpoints_is_active ON rotating_endpoints;
DROP INDEX IF EXISTS idx_rotating_endpoints_user_active ON rotating_endpoints;

-- Step 2: Drop the rotating_endpoints table
-- WARNING: This will permanently delete all rotating endpoint data
DROP TABLE IF EXISTS rotating_endpoints;

-- Step 3: Optional - Clean up migration records
-- If you track migrations in a separate table, remove the rotating endpoints migration records
-- Uncomment and adjust the following queries based on your migration tracking system:
--
-- DELETE FROM migrations WHERE migration_name = 'create_rotating_endpoints';
-- DELETE FROM migrations WHERE migration_name = 'add_response_payload_to_rotating_endpoints';

-- =====================================================
-- Verification Queries
-- =====================================================
-- Run these after cleanup to verify the removal was successful

-- Verify table is dropped
SHOW TABLES LIKE 'rotating_endpoints';
-- Expected result: Empty set (no rows)

-- Verify no orphaned indexes
SHOW INDEX FROM rotating_endpoints;
-- Expected result: Error 1146 (42S02): Table doesn't exist

-- =====================================================
-- Rollback Information
-- =====================================================
-- If you need to recreate the rotating_endpoints table, you can run:
-- migrations/create_rotating_endpoints.sql
-- migrations/add_response_payload_to_rotating_endpoints.sql
--
-- However, all data will be lost and cannot be recovered without
-- a database backup.
-- =====================================================
