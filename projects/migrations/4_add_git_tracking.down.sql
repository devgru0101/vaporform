-- Rollback Git tracking fields
DROP INDEX IF EXISTS idx_generation_jobs_metadata;

ALTER TABLE projects
  DROP COLUMN IF EXISTS current_commit_hash;

ALTER TABLE generation_jobs
  DROP COLUMN IF EXISTS metadata;
