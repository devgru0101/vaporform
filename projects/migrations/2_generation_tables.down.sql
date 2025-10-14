-- Drop indexes
DROP INDEX IF EXISTS idx_generation_logs_created_at;
DROP INDEX IF EXISTS idx_generation_logs_job_id;
DROP INDEX IF EXISTS idx_generation_jobs_status;
DROP INDEX IF EXISTS idx_generation_jobs_project_id;

-- Drop tables
DROP TABLE IF EXISTS generation_logs;
DROP TABLE IF EXISTS generation_jobs;

-- Remove columns from projects
ALTER TABLE projects
  DROP COLUMN IF EXISTS wizard_data,
  DROP COLUMN IF EXISTS generation_status;
