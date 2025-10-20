-- Rollback encryption migration
-- Removes encrypted column, keeping original TEXT column

ALTER TABLE user_secrets DROP COLUMN IF EXISTS secret_value_encrypted;

COMMENT ON COLUMN user_secrets.secret_value IS NULL;
