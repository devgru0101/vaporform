-- Remove trigger
DROP TRIGGER IF EXISTS trigger_update_builds_updated_at ON builds;

-- Remove function
DROP FUNCTION IF EXISTS update_builds_updated_at();

-- Remove updated_at column from builds table
ALTER TABLE builds DROP COLUMN IF EXISTS updated_at;
