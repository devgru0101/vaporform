-- Rollback enhanced build tracking

-- Drop indexes
DROP INDEX IF EXISTS idx_builds_status_phase;
DROP INDEX IF EXISTS idx_builds_daytona_session;
DROP INDEX IF EXISTS idx_build_events_timestamp;
DROP INDEX IF EXISTS idx_build_events_build_id;

-- Drop build_events table
DROP TABLE IF EXISTS build_events;

-- Remove columns from builds table
ALTER TABLE builds DROP COLUMN IF EXISTS metadata;
ALTER TABLE builds DROP COLUMN IF EXISTS install_logs;
ALTER TABLE builds DROP COLUMN IF EXISTS live_output;
ALTER TABLE builds DROP COLUMN IF EXISTS step_logs;
ALTER TABLE builds DROP COLUMN IF EXISTS total_steps;
ALTER TABLE builds DROP COLUMN IF EXISTS current_step;
ALTER TABLE builds DROP COLUMN IF EXISTS daytona_session_id;
ALTER TABLE builds DROP COLUMN IF EXISTS phase;
