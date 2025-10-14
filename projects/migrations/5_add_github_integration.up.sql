-- Add GitHub integration fields to projects table
ALTER TABLE projects
  ADD COLUMN github_pat TEXT,
  ADD COLUMN github_repo_full_name TEXT,
  ADD COLUMN github_default_branch TEXT DEFAULT 'main';

-- Add indexes for faster GitHub queries
CREATE INDEX idx_projects_github_repo ON projects(github_repo_full_name) WHERE github_repo_full_name IS NOT NULL;

-- Comments
COMMENT ON COLUMN projects.github_pat IS 'Encrypted GitHub Personal Access Token for repository integration';
COMMENT ON COLUMN projects.github_repo_full_name IS 'GitHub repository full name (owner/repo) for auto-push';
COMMENT ON COLUMN projects.github_default_branch IS 'Default branch for GitHub pushes';
