-- Remove metadata column from workspaces table
ALTER TABLE workspaces DROP COLUMN IF EXISTS metadata;
