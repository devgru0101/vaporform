-- Migrate user_secrets table to use encrypted storage
-- This migration changes secret_value from TEXT to BYTEA and encrypts existing values
-- CRITICAL: The encryption key (UserSecretEncryptionKey Encore secret) must never change
-- after this migration runs, or existing data will become unrecoverable

-- Step 1: Add new encrypted column
ALTER TABLE user_secrets
ADD COLUMN secret_value_encrypted BYTEA;

-- Step 2: Migrate existing data (if any) to encrypted format
-- Note: This migration assumes UserSecretEncryptionKey Encore secret is already set
-- The encryption will be handled at the application layer, not in SQL
-- This is a schema-only migration; data migration happens in the application code

-- Step 3: Drop old TEXT column (after data migration completes)
-- We keep both columns temporarily for safe rollback
-- The application will handle reading from encrypted column and migrating data on first access

-- Step 4: Add NOT NULL constraint after data migration (future migration)
-- ALTER TABLE user_secrets ALTER COLUMN secret_value_encrypted SET NOT NULL;

-- Step 5: Drop old column after data migration (future migration)
-- ALTER TABLE user_secrets DROP COLUMN secret_value;

-- For now, we keep both columns to allow gradual migration
-- Application code will:
-- 1. Read from secret_value_encrypted if present
-- 2. Fall back to secret_value if encrypted version not set
-- 3. Encrypt and save to secret_value_encrypted on next write

COMMENT ON COLUMN user_secrets.secret_value IS 'DEPRECATED: Use secret_value_encrypted instead. Will be removed in future migration.';
COMMENT ON COLUMN user_secrets.secret_value_encrypted IS 'Encrypted user API key (pgp_sym_encrypt with UserSecretEncryptionKey)';
