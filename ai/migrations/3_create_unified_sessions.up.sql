-- Create unified agent sessions table
-- This table supports both code generation and terminal agent sessions
-- with shared context between them
CREATE TABLE IF NOT EXISTS agent_sessions (
  id BIGSERIAL PRIMARY KEY,
  project_id BIGINT NOT NULL,
  user_id TEXT NOT NULL,
  session_type TEXT NOT NULL CHECK (session_type IN ('code', 'terminal', 'hybrid')),
  title TEXT,

  -- Session state
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'paused', 'completed', 'error')),

  -- Context tracking
  context_hash TEXT, -- Hash of current context for change detection
  shared_context JSONB DEFAULT '{}', -- Shared state between agents

  -- Metadata
  metadata JSONB DEFAULT '{}',

  -- Timestamps
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW(),
  last_activity_at TIMESTAMP DEFAULT NOW(),
  deleted_at TIMESTAMP
);

-- Create agent messages table
-- Stores all messages across all agent types with unified structure
CREATE TABLE IF NOT EXISTS agent_messages (
  id BIGSERIAL PRIMARY KEY,
  session_id BIGINT NOT NULL REFERENCES agent_sessions(id) ON DELETE CASCADE,

  -- Message identification
  role TEXT NOT NULL CHECK (role IN ('user', 'assistant', 'system', 'tool')),
  agent_type TEXT CHECK (agent_type IN ('code', 'terminal', 'system')),

  -- Content (supports both simple text and complex structured content)
  content TEXT NOT NULL,
  content_type TEXT DEFAULT 'text' CHECK (content_type IN ('text', 'json', 'markdown', 'error')),

  -- Tool execution tracking
  tool_name TEXT,
  tool_input JSONB,
  tool_output JSONB,
  tool_status TEXT CHECK (tool_status IN ('pending', 'running', 'success', 'error')),

  -- Context and metadata
  context_snapshot JSONB, -- RAG results, file refs, etc at time of message
  metadata JSONB DEFAULT '{}',

  -- Timestamps
  created_at TIMESTAMP DEFAULT NOW()
);

-- Create context items table
-- Stores individual context items that can be shared across sessions
CREATE TABLE IF NOT EXISTS context_items (
  id BIGSERIAL PRIMARY KEY,
  project_id BIGINT NOT NULL,

  -- Item identification
  item_type TEXT NOT NULL CHECK (item_type IN ('file', 'terminal_output', 'error', 'env_var', 'git_commit', 'custom')),
  item_key TEXT NOT NULL, -- Unique key within project (e.g., file path, env var name)

  -- Content
  content TEXT NOT NULL,
  content_hash TEXT NOT NULL, -- For change detection

  -- Metadata
  metadata JSONB DEFAULT '{}',

  -- Usage tracking
  last_accessed_at TIMESTAMP DEFAULT NOW(),
  access_count INTEGER DEFAULT 0,

  -- Timestamps
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW(),

  -- Ensure unique items per project
  UNIQUE(project_id, item_type, item_key)
);

-- Create session context links table
-- Links context items to sessions for efficient lookups
CREATE TABLE IF NOT EXISTS session_context_links (
  id BIGSERIAL PRIMARY KEY,
  session_id BIGINT NOT NULL REFERENCES agent_sessions(id) ON DELETE CASCADE,
  context_item_id BIGINT NOT NULL REFERENCES context_items(id) ON DELETE CASCADE,

  -- Link metadata
  relevance_score FLOAT DEFAULT 1.0,
  added_at TIMESTAMP DEFAULT NOW(),

  -- Ensure unique links
  UNIQUE(session_id, context_item_id)
);

-- Create agent session jobs table (for code generation tracking)
CREATE TABLE IF NOT EXISTS agent_jobs (
  id BIGSERIAL PRIMARY KEY,
  session_id BIGINT NOT NULL REFERENCES agent_sessions(id) ON DELETE CASCADE,

  -- Job identification
  job_type TEXT NOT NULL CHECK (job_type IN ('code_generation', 'terminal_execution', 'file_operation', 'git_operation')),
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'running', 'completed', 'error', 'cancelled')),

  -- Job details
  description TEXT,
  input_data JSONB,
  output_data JSONB,
  error_message TEXT,

  -- Progress tracking
  progress_percentage INTEGER DEFAULT 0,

  -- Timestamps
  started_at TIMESTAMP,
  completed_at TIMESTAMP,
  created_at TIMESTAMP DEFAULT NOW()
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_agent_sessions_project ON agent_sessions(project_id) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_agent_sessions_user ON agent_sessions(user_id) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_agent_sessions_type ON agent_sessions(session_type) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_agent_sessions_status ON agent_sessions(status);
CREATE INDEX IF NOT EXISTS idx_agent_sessions_activity ON agent_sessions(last_activity_at DESC);

CREATE INDEX IF NOT EXISTS idx_agent_messages_session ON agent_messages(session_id);
CREATE INDEX IF NOT EXISTS idx_agent_messages_role ON agent_messages(role);
CREATE INDEX IF NOT EXISTS idx_agent_messages_agent_type ON agent_messages(agent_type);
CREATE INDEX IF NOT EXISTS idx_agent_messages_created ON agent_messages(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_agent_messages_tool_status ON agent_messages(tool_status) WHERE tool_status IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_context_items_project ON context_items(project_id);
CREATE INDEX IF NOT EXISTS idx_context_items_type ON context_items(item_type);
CREATE INDEX IF NOT EXISTS idx_context_items_key ON context_items(item_key);
CREATE INDEX IF NOT EXISTS idx_context_items_hash ON context_items(content_hash);
CREATE INDEX IF NOT EXISTS idx_context_items_accessed ON context_items(last_accessed_at DESC);

CREATE INDEX IF NOT EXISTS idx_session_context_session ON session_context_links(session_id);
CREATE INDEX IF NOT EXISTS idx_session_context_item ON session_context_links(context_item_id);
CREATE INDEX IF NOT EXISTS idx_session_context_relevance ON session_context_links(relevance_score DESC);

CREATE INDEX IF NOT EXISTS idx_agent_jobs_session ON agent_jobs(session_id);
CREATE INDEX IF NOT EXISTS idx_agent_jobs_type ON agent_jobs(job_type);
CREATE INDEX IF NOT EXISTS idx_agent_jobs_status ON agent_jobs(status);

-- Comments
COMMENT ON TABLE agent_sessions IS 'Unified sessions for all agent types (code, terminal, hybrid) with shared context';
COMMENT ON TABLE agent_messages IS 'All agent messages with support for tool execution tracking';
COMMENT ON TABLE context_items IS 'Reusable context items that can be shared across sessions';
COMMENT ON TABLE session_context_links IS 'Links sessions to relevant context items';
COMMENT ON TABLE agent_jobs IS 'Tracks long-running agent jobs with progress';

COMMENT ON COLUMN agent_sessions.session_type IS 'code=code generation, terminal=terminal agent, hybrid=both';
COMMENT ON COLUMN agent_sessions.shared_context IS 'Context shared between code and terminal agents';
COMMENT ON COLUMN agent_messages.context_snapshot IS 'RAG results and context at time of message';
COMMENT ON COLUMN context_items.content_hash IS 'SHA256 hash for change detection';
COMMENT ON COLUMN session_context_links.relevance_score IS 'Relevance score from RAG or manual assignment';
