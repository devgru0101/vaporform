-- Drop performance indexes

DROP INDEX IF EXISTS idx_agent_messages_session_id;
DROP INDEX IF EXISTS idx_agent_messages_created_at;
DROP INDEX IF EXISTS idx_agent_messages_agent_type;

DROP INDEX IF EXISTS idx_context_items_project_type;
DROP INDEX IF EXISTS idx_context_items_last_accessed;
DROP INDEX IF EXISTS idx_context_items_access_count;

DROP INDEX IF EXISTS idx_session_context_links_session;
DROP INDEX IF EXISTS idx_session_context_links_context;
DROP INDEX IF EXISTS idx_session_context_links_relevance;

DROP INDEX IF EXISTS idx_agent_jobs_session_id;
DROP INDEX IF EXISTS idx_agent_jobs_status;
DROP INDEX IF EXISTS idx_agent_jobs_created_at;

DROP INDEX IF EXISTS idx_agent_sessions_project_user;
DROP INDEX IF EXISTS idx_agent_sessions_last_activity;
DROP INDEX IF EXISTS idx_agent_sessions_status;
