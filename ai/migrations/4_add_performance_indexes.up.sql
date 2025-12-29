-- Add performance indexes for frequently queried columns

-- Agent messages indexes
CREATE INDEX IF NOT EXISTS idx_agent_messages_session_id ON agent_messages(session_id);
CREATE INDEX IF NOT EXISTS idx_agent_messages_created_at ON agent_messages(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_agent_messages_agent_type ON agent_messages(agent_type) WHERE agent_type IS NOT NULL;

-- Context items indexes
CREATE INDEX IF NOT EXISTS idx_context_items_project_type ON context_items(project_id, item_type);
CREATE INDEX IF NOT EXISTS idx_context_items_last_accessed ON context_items(last_accessed_at DESC);
CREATE INDEX IF NOT EXISTS idx_context_items_access_count ON context_items(access_count DESC);

-- Session context links indexes
CREATE INDEX IF NOT EXISTS idx_session_context_links_session ON session_context_links(session_id);
CREATE INDEX IF NOT EXISTS idx_session_context_links_context ON session_context_links(context_item_id);
CREATE INDEX IF NOT EXISTS idx_session_context_links_relevance ON session_context_links(relevance_score DESC);

-- Agent jobs indexes
CREATE INDEX IF NOT EXISTS idx_agent_jobs_session_id ON agent_jobs(session_id);
CREATE INDEX IF NOT EXISTS idx_agent_jobs_status ON agent_jobs(status);
CREATE INDEX IF NOT EXISTS idx_agent_jobs_created_at ON agent_jobs(created_at DESC);

-- Agent sessions indexes
CREATE INDEX IF NOT EXISTS idx_agent_sessions_project_user ON agent_sessions(project_id, user_id) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_agent_sessions_last_activity ON agent_sessions(last_activity_at DESC) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_agent_sessions_status ON agent_sessions(status) WHERE deleted_at IS NULL;

-- Comments
COMMENT ON INDEX idx_agent_messages_session_id IS 'Fast lookup of messages by session';
COMMENT ON INDEX idx_context_items_project_type IS 'Composite index for project context queries';
COMMENT ON INDEX idx_agent_sessions_project_user IS 'Fast lookup of user sessions per project';
