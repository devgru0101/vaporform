-- Create workspaces table
CREATE TABLE workspaces (
  id BIGSERIAL PRIMARY KEY,
  project_id BIGINT NOT NULL,
  daytona_workspace_id TEXT UNIQUE,
  name TEXT NOT NULL,
  status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'starting', 'running', 'stopped', 'error', 'deleted')),
  image TEXT,
  environment JSONB,
  ports JSONB,
  error_message TEXT,
  started_at TIMESTAMP,
  stopped_at TIMESTAMP,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW(),
  deleted_at TIMESTAMP
);

-- Create workspace logs table
CREATE TABLE workspace_logs (
  id BIGSERIAL PRIMARY KEY,
  workspace_id BIGINT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  log_level TEXT CHECK (log_level IN ('info', 'warn', 'error', 'debug')),
  message TEXT NOT NULL,
  timestamp TIMESTAMP DEFAULT NOW()
);

-- Create build history table
CREATE TABLE builds (
  id BIGSERIAL PRIMARY KEY,
  project_id BIGINT NOT NULL,
  workspace_id BIGINT REFERENCES workspaces(id) ON DELETE SET NULL,
  status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'building', 'success', 'failed')),
  build_logs TEXT,
  error_message TEXT,
  duration_ms INTEGER,
  started_at TIMESTAMP,
  completed_at TIMESTAMP,
  created_at TIMESTAMP DEFAULT NOW()
);

-- Indexes
CREATE INDEX idx_workspaces_project ON workspaces(project_id) WHERE deleted_at IS NULL;
CREATE INDEX idx_workspaces_status ON workspaces(status) WHERE deleted_at IS NULL;
CREATE INDEX idx_workspaces_daytona ON workspaces(daytona_workspace_id) WHERE daytona_workspace_id IS NOT NULL;
CREATE INDEX idx_workspace_logs_workspace ON workspace_logs(workspace_id);
CREATE INDEX idx_workspace_logs_timestamp ON workspace_logs(timestamp DESC);
CREATE INDEX idx_builds_project ON builds(project_id);
CREATE INDEX idx_builds_workspace ON builds(workspace_id);
CREATE INDEX idx_builds_status ON builds(status);

-- Comments
COMMENT ON TABLE workspaces IS 'Daytona workspace instances for projects';
COMMENT ON COLUMN workspaces.daytona_workspace_id IS 'Daytona-assigned workspace ID';
COMMENT ON COLUMN workspaces.environment IS 'Environment variables for the workspace';
COMMENT ON COLUMN workspaces.ports IS 'Port mappings (internal -> external)';
COMMENT ON TABLE workspace_logs IS 'Logs from workspace operations';
COMMENT ON TABLE builds IS 'Build history for projects';
