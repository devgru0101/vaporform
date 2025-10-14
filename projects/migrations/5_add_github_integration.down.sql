-- Remove GitHub integration fields from projects table
DROP INDEX IF EXISTS idx_projects_github_repo;

ALTER TABLE projects
  DROP COLUMN IF EXISTS github_pat,
  DROP COLUMN IF EXISTS github_repo_full_name,
  DROP COLUMN IF EXISTS github_default_branch;
