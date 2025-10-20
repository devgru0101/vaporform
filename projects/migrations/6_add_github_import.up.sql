-- Add GitHub import source tracking to projects table
ALTER TABLE projects
  ADD COLUMN github_imported_from TEXT,
  ADD COLUMN github_imported_branch TEXT,
  ADD COLUMN github_import_date TIMESTAMP;

-- Add index for imported projects
CREATE INDEX idx_projects_github_imported ON projects(github_imported_from) WHERE github_imported_from IS NOT NULL;

-- Comments
COMMENT ON COLUMN projects.github_imported_from IS 'GitHub repository URL that this project was imported from (e.g., https://github.com/owner/repo)';
COMMENT ON COLUMN projects.github_imported_branch IS 'Branch that was imported from the GitHub repository';
COMMENT ON COLUMN projects.github_import_date IS 'Date and time when the project was imported from GitHub';
