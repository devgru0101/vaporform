-- Remove GitHub import tracking columns
DROP INDEX IF EXISTS idx_projects_github_imported;

ALTER TABLE projects
  DROP COLUMN IF EXISTS github_imported_from,
  DROP COLUMN IF EXISTS github_imported_branch,
  DROP COLUMN IF EXISTS github_import_date;
