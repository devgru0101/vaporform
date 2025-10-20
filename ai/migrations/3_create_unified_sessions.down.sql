-- Drop unified session tables in reverse order

DROP INDEX IF EXISTS idx_agent_jobs_status;
DROP INDEX IF EXISTS idx_agent_jobs_type;
DROP INDEX IF EXISTS idx_agent_jobs_session;

DROP INDEX IF EXISTS idx_session_context_relevance;
DROP INDEX IF EXISTS idx_session_context_item;
DROP INDEX IF EXISTS idx_session_context_session;

DROP INDEX IF EXISTS idx_context_items_accessed;
DROP INDEX IF EXISTS idx_context_items_hash;
DROP INDEX IF EXISTS idx_context_items_key;
DROP INDEX IF EXISTS idx_context_items_type;
DROP INDEX IF EXISTS idx_context_items_project;

DROP INDEX IF EXISTS idx_agent_messages_tool_status;
DROP INDEX IF EXISTS idx_agent_messages_created;
DROP INDEX IF EXISTS idx_agent_messages_agent_type;
DROP INDEX IF EXISTS idx_agent_messages_role;
DROP INDEX IF EXISTS idx_agent_messages_session;

DROP INDEX IF EXISTS idx_agent_sessions_activity;
DROP INDEX IF EXISTS idx_agent_sessions_status;
DROP INDEX IF EXISTS idx_agent_sessions_type;
DROP INDEX IF EXISTS idx_agent_sessions_user;
DROP INDEX IF EXISTS idx_agent_sessions_project;

DROP TABLE IF EXISTS agent_jobs;
DROP TABLE IF EXISTS session_context_links;
DROP TABLE IF EXISTS context_items;
DROP TABLE IF EXISTS agent_messages;
DROP TABLE IF EXISTS agent_sessions;
