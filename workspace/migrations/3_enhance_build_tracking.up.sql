-- Enhance build tracking with detailed status and Daytona session integration

-- Add new columns to builds table for better tracking
ALTER TABLE builds ADD COLUMN IF NOT EXISTS phase VARCHAR(50) DEFAULT 'pending';
ALTER TABLE builds ADD COLUMN IF NOT EXISTS daytona_session_id VARCHAR(255);
ALTER TABLE builds ADD COLUMN IF NOT EXISTS current_step VARCHAR(255);
ALTER TABLE builds ADD COLUMN IF NOT EXISTS total_steps INTEGER;
ALTER TABLE builds ADD COLUMN IF NOT EXISTS step_logs TEXT;
ALTER TABLE builds ADD COLUMN IF NOT EXISTS live_output TEXT;
ALTER TABLE builds ADD COLUMN IF NOT EXISTS install_logs TEXT;
ALTER TABLE builds ADD COLUMN IF NOT EXISTS metadata JSONB;

-- Create build_events table for real-time build progress tracking
CREATE TABLE IF NOT EXISTS build_events (
  id BIGSERIAL PRIMARY KEY,
  build_id BIGINT NOT NULL REFERENCES builds(id) ON DELETE CASCADE,
  event_type VARCHAR(50) NOT NULL, -- 'phase_change', 'log', 'error', 'warning', 'progress'
  phase VARCHAR(50), -- 'setup', 'install', 'build', 'test', 'deploy', 'complete'
  message TEXT,
  metadata JSONB,
  timestamp TIMESTAMPTZ DEFAULT NOW()
);

-- Create indexes for efficient querying
CREATE INDEX idx_build_events_build_id ON build_events(build_id);
CREATE INDEX idx_build_events_timestamp ON build_events(timestamp DESC);
CREATE INDEX idx_builds_daytona_session ON builds(daytona_session_id) WHERE daytona_session_id IS NOT NULL;
CREATE INDEX idx_builds_status_phase ON builds(status, phase);

-- Add comments
COMMENT ON COLUMN builds.phase IS 'Current build phase: pending, setup, install, build, test, deploy, complete, failed';
COMMENT ON COLUMN builds.daytona_session_id IS 'Daytona process session ID for this build';
COMMENT ON COLUMN builds.current_step IS 'Human-readable description of current build step';
COMMENT ON COLUMN builds.total_steps IS 'Total number of steps in this build';
COMMENT ON COLUMN builds.step_logs IS 'Logs for the current step';
COMMENT ON COLUMN builds.live_output IS 'Live streaming output from build process';
COMMENT ON COLUMN builds.install_logs IS 'Dependency installation logs';
COMMENT ON COLUMN builds.metadata IS 'Additional build metadata (tech stack, commands, etc.)';
COMMENT ON TABLE build_events IS 'Real-time build event stream for progress tracking';
