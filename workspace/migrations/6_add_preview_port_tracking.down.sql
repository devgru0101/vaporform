-- Rollback preview_port and dev_command columns

DROP INDEX IF EXISTS idx_workspaces_preview_port;

ALTER TABLE workspaces
DROP COLUMN IF EXISTS dev_command;

ALTER TABLE workspaces
DROP COLUMN IF EXISTS preview_port;
