-- Add Git commit tracking to projects table
ALTER TABLE projects
  ADD COLUMN current_commit_hash TEXT;

-- Add metadata column to generation_jobs for storing commit hashes and other info
ALTER TABLE generation_jobs
  ADD COLUMN metadata JSONB DEFAULT '{}'::jsonb;

-- Create index for faster metadata queries
CREATE INDEX idx_generation_jobs_metadata ON generation_jobs USING GIN (metadata);

-- Comments
COMMENT ON COLUMN projects.current_commit_hash IS 'Current Git commit hash for the project';
COMMENT ON COLUMN generation_jobs.metadata IS 'JSON metadata including initial_commit_hash, tech_stack, etc.';
