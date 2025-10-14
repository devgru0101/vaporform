-- Create terminal sessions table
CREATE TABLE terminal_sessions (
  id BIGSERIAL PRIMARY KEY,
  project_id BIGINT NOT NULL,
  workspace_id BIGINT,
  user_id TEXT NOT NULL,
  status TEXT DEFAULT 'active' CHECK (status IN ('active', 'closed')),
  shell TEXT DEFAULT '/bin/sh',
  cwd TEXT DEFAULT '/workspace',
  pid INTEGER,
  cols INTEGER DEFAULT 80,
  rows INTEGER DEFAULT 24,
  created_at TIMESTAMP DEFAULT NOW(),
  closed_at TIMESTAMP
);

-- Create terminal command history table
CREATE TABLE terminal_history (
  id BIGSERIAL PRIMARY KEY,
  session_id BIGINT NOT NULL REFERENCES terminal_sessions(id) ON DELETE CASCADE,
  command TEXT NOT NULL,
  executed_at TIMESTAMP DEFAULT NOW()
);

-- Indexes
CREATE INDEX idx_terminal_sessions_project ON terminal_sessions(project_id);
CREATE INDEX idx_terminal_sessions_workspace ON terminal_sessions(workspace_id);
CREATE INDEX idx_terminal_sessions_user ON terminal_sessions(user_id);
CREATE INDEX idx_terminal_sessions_status ON terminal_sessions(status);
CREATE INDEX idx_terminal_history_session ON terminal_history(session_id);
CREATE INDEX idx_terminal_history_executed ON terminal_history(executed_at DESC);

-- Comments
COMMENT ON TABLE terminal_sessions IS 'WebSocket terminal sessions with PTY';
COMMENT ON COLUMN terminal_sessions.workspace_id IS 'Optional Daytona workspace for remote shell';
COMMENT ON COLUMN terminal_sessions.pid IS 'Process ID of the PTY shell';
COMMENT ON COLUMN terminal_sessions.cols IS 'Terminal width in columns';
COMMENT ON COLUMN terminal_sessions.rows IS 'Terminal height in rows';
COMMENT ON TABLE terminal_history IS 'Command history for terminal sessions';
