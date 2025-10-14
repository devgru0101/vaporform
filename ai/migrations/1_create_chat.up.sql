-- Create chat sessions table
CREATE TABLE chat_sessions (
  id BIGSERIAL PRIMARY KEY,
  project_id BIGINT NOT NULL,
  user_id TEXT NOT NULL,
  title TEXT,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW(),
  deleted_at TIMESTAMP
);

-- Create chat messages table
CREATE TABLE chat_messages (
  id BIGSERIAL PRIMARY KEY,
  session_id BIGINT NOT NULL REFERENCES chat_sessions(id) ON DELETE CASCADE,
  role TEXT NOT NULL CHECK (role IN ('user', 'assistant', 'system')),
  content TEXT NOT NULL,
  metadata JSONB,
  created_at TIMESTAMP DEFAULT NOW()
);

-- Create UI component extractions table (for UI Edit Mode)
CREATE TABLE ui_components (
  id BIGSERIAL PRIMARY KEY,
  project_id BIGINT NOT NULL,
  file_path TEXT NOT NULL,
  component_name TEXT,
  component_type TEXT,
  selector TEXT,
  start_line INTEGER,
  end_line INTEGER,
  code_snippet TEXT,
  metadata JSONB,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- Indexes
CREATE INDEX idx_chat_sessions_project ON chat_sessions(project_id) WHERE deleted_at IS NULL;
CREATE INDEX idx_chat_sessions_user ON chat_sessions(user_id) WHERE deleted_at IS NULL;
CREATE INDEX idx_chat_messages_session ON chat_messages(session_id);
CREATE INDEX idx_chat_messages_created ON chat_messages(created_at DESC);
CREATE INDEX idx_ui_components_project ON ui_components(project_id);
CREATE INDEX idx_ui_components_file ON ui_components(file_path);

-- Comments
COMMENT ON TABLE chat_sessions IS 'KiloCode AI chat sessions';
COMMENT ON TABLE chat_messages IS 'Messages in chat sessions';
COMMENT ON TABLE ui_components IS 'Extracted UI components for UI Edit Mode';
COMMENT ON COLUMN chat_messages.metadata IS 'Additional context (file paths, embeddings, tokens, etc.)';
COMMENT ON COLUMN ui_components.selector IS 'CSS/DOM selector for the component';
COMMENT ON COLUMN ui_components.metadata IS 'Additional context (props, state, dependencies, etc.)';
