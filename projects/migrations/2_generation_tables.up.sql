-- Add wizard_data and generation_status to projects table
ALTER TABLE projects
  ADD COLUMN wizard_data JSONB,
  ADD COLUMN generation_status TEXT DEFAULT 'pending';

-- Create generation_jobs table
CREATE TABLE generation_jobs (
  id BIGSERIAL PRIMARY KEY,
  project_id BIGINT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  workspace_id BIGINT, -- No foreign key since workspaces is in a different database
  status TEXT NOT NULL,
  progress INTEGER DEFAULT 0,
  current_step TEXT,
  wizard_data JSONB NOT NULL,
  error_message TEXT,
  started_at TIMESTAMPTZ DEFAULT NOW(),
  completed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create generation_logs table
CREATE TABLE generation_logs (
  id BIGSERIAL PRIMARY KEY,
  job_id BIGINT NOT NULL REFERENCES generation_jobs(id) ON DELETE CASCADE,
  level TEXT NOT NULL,
  message TEXT NOT NULL,
  tool_name TEXT,
  file_path TEXT,
  metadata JSONB,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create indexes
CREATE INDEX idx_generation_jobs_project_id ON generation_jobs(project_id);
CREATE INDEX idx_generation_jobs_status ON generation_jobs(status);
CREATE INDEX idx_generation_logs_job_id ON generation_logs(job_id);
CREATE INDEX idx_generation_logs_created_at ON generation_logs(created_at);
