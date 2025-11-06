-- Add response_payload column to special_endpoints table
-- This allows users to optionally provide a custom JSON payload for responses

ALTER TABLE special_endpoints
ADD COLUMN response_payload JSON DEFAULT NULL AFTER description;
