-- Add new Daytona-specific fields to workspaces table

-- Rename daytona_workspace_id to daytona_sandbox_id (Daytona uses "sandboxes" not "workspaces")
ALTER TABLE workspaces RENAME COLUMN daytona_workspace_id TO daytona_sandbox_id;

-- Rename image to language (Daytona uses language-based snapshots by default)
ALTER TABLE workspaces RENAME COLUMN image TO language;

-- Add new Daytona configuration fields
ALTER TABLE workspaces ADD COLUMN IF NOT EXISTS resources JSONB;
ALTER TABLE workspaces ADD COLUMN IF NOT EXISTS auto_stop_interval INTEGER DEFAULT 15;
ALTER TABLE workspaces ADD COLUMN IF NOT EXISTS auto_archive_interval INTEGER DEFAULT 10080;
ALTER TABLE workspaces ADD COLUMN IF NOT EXISTS ephemeral BOOLEAN DEFAULT FALSE;

-- Update index name to match new column name
DROP INDEX IF EXISTS idx_workspaces_daytona;
CREATE INDEX idx_workspaces_daytona_sandbox ON workspaces(daytona_sandbox_id) WHERE daytona_sandbox_id IS NOT NULL;

-- Update comments
COMMENT ON COLUMN workspaces.daytona_sandbox_id IS 'Daytona-assigned sandbox ID (not workspace_id)';
COMMENT ON COLUMN workspaces.language IS 'Programming language for snapshot-based sandbox creation';
COMMENT ON COLUMN workspaces.resources IS 'Resource allocation (cpu, memory, disk)';
COMMENT ON COLUMN workspaces.auto_stop_interval IS 'Minutes of inactivity before auto-stop (0 = never)';
COMMENT ON COLUMN workspaces.auto_archive_interval IS 'Minutes stopped before auto-archive (7 days default)';
COMMENT ON COLUMN workspaces.ephemeral IS 'If true, sandbox is deleted when stopped';
COMMENT ON TABLE workspaces IS 'Daytona sandbox instances for projects';
