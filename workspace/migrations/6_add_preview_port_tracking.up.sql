-- Add preview_port and dev_command columns for smart port detection
-- Phase 2: Agent Port Specification

ALTER TABLE workspaces
ADD COLUMN preview_port INT DEFAULT NULL;

ALTER TABLE workspaces
ADD COLUMN dev_command TEXT DEFAULT NULL;

-- Add index for faster lookups
CREATE INDEX idx_workspaces_preview_port ON workspaces(preview_port) WHERE preview_port IS NOT NULL;

COMMENT ON COLUMN workspaces.preview_port IS 'Port number where the dev server is running (agent-specified)';
COMMENT ON COLUMN workspaces.dev_command IS 'Command used to start the dev server (for port detection)';
