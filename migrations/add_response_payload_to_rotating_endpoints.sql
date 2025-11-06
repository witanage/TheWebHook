-- Add response_payload column to rotating_endpoints table
-- This allows users to optionally provide a custom JSON payload for responses

ALTER TABLE rotating_endpoints
ADD COLUMN response_payload JSON DEFAULT NULL AFTER description;
