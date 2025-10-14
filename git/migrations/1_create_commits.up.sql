-- Create git commits table
CREATE TABLE git_commits (
  id BIGSERIAL PRIMARY KEY,
  project_id BIGINT NOT NULL,
  commit_hash TEXT NOT NULL,
  author_name TEXT NOT NULL,
  author_email TEXT NOT NULL,
  message TEXT NOT NULL,
  parent_hash TEXT,
  timestamp TIMESTAMP NOT NULL,
  files_changed INTEGER DEFAULT 0,
  insertions INTEGER DEFAULT 0,
  deletions INTEGER DEFAULT 0,
  created_at TIMESTAMP DEFAULT NOW(),
  CONSTRAINT unique_project_commit UNIQUE(project_id, commit_hash)
);

-- Create git branches table
CREATE TABLE git_branches (
  id BIGSERIAL PRIMARY KEY,
  project_id BIGINT NOT NULL,
  name TEXT NOT NULL,
  commit_hash TEXT NOT NULL,
  is_default BOOLEAN DEFAULT false,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW(),
  CONSTRAINT unique_project_branch UNIQUE(project_id, name)
);

-- Indexes
CREATE INDEX idx_git_commits_project ON git_commits(project_id);
CREATE INDEX idx_git_commits_hash ON git_commits(commit_hash);
CREATE INDEX idx_git_commits_timestamp ON git_commits(project_id, timestamp DESC);
CREATE INDEX idx_git_branches_project ON git_branches(project_id);
CREATE INDEX idx_git_branches_default ON git_branches(project_id, is_default) WHERE is_default = true;

-- Comments
COMMENT ON TABLE git_commits IS 'Git commit history for projects';
COMMENT ON COLUMN git_commits.commit_hash IS 'Git commit SHA-1 hash';
COMMENT ON COLUMN git_commits.parent_hash IS 'Parent commit hash (NULL for initial commit)';
COMMENT ON TABLE git_branches IS 'Git branches for projects';
COMMENT ON COLUMN git_branches.is_default IS 'Whether this is the default branch (main/master)';
