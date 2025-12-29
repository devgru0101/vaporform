-- Add metadata column to workspaces table for storing preview port and other settings
ALTER TABLE workspaces ADD COLUMN IF NOT EXISTS metadata JSONB DEFAULT '{}';

COMMENT ON COLUMN workspaces.metadata IS 'Workspace metadata including preview_port, custom settings, etc.';
