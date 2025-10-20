-- Enable pgcrypto extension for user secret encryption
-- This extension provides cryptographic functions for PostgreSQL
-- Used to encrypt user-provided API keys at rest

CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- Verify extension is installed
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_extension WHERE extname = 'pgcrypto'
    ) THEN
        RAISE EXCEPTION 'pgcrypto extension could not be installed';
    END IF;
END
$$;
