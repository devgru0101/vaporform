-- Create projects table
CREATE TABLE projects (
  id BIGSERIAL PRIMARY KEY,
  clerk_org_id TEXT,
  clerk_user_id TEXT NOT NULL,
  name TEXT NOT NULL,
  description TEXT,
  template TEXT,
  git_initialized BOOLEAN DEFAULT false,
  daytona_workspace_id TEXT,
  deployment_url TEXT,
  deployment_status TEXT DEFAULT 'none' CHECK (deployment_status IN ('none', 'building', 'deployed', 'failed')),
  storage_used_bytes BIGINT DEFAULT 0,
  compute_minutes_used INTEGER DEFAULT 0,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW(),
  deleted_at TIMESTAMP
);

-- Create unique indexes with WHERE clauses (supported in PostgreSQL 9.0+)
CREATE UNIQUE INDEX unique_personal_project ON projects(clerk_user_id, name) WHERE clerk_org_id IS NULL;
CREATE UNIQUE INDEX unique_org_project ON projects(clerk_org_id, name) WHERE clerk_org_id IS NOT NULL;

-- Indexes
CREATE INDEX idx_projects_org ON projects(clerk_org_id) WHERE clerk_org_id IS NOT NULL;
CREATE INDEX idx_projects_user ON projects(clerk_user_id);
CREATE INDEX idx_projects_deleted ON projects(deleted_at) WHERE deleted_at IS NULL;
CREATE INDEX idx_projects_deployment_status ON projects(deployment_status);

-- Comments
COMMENT ON TABLE projects IS 'User projects - can be personal or organization-owned';
COMMENT ON COLUMN projects.clerk_org_id IS 'Organization ID if project belongs to org, NULL for personal projects';
COMMENT ON COLUMN projects.clerk_user_id IS 'Owner/creator of the project';
COMMENT ON COLUMN projects.template IS 'Template used: react-vite, nextjs, express, etc.';
COMMENT ON COLUMN projects.daytona_workspace_id IS 'Daytona workspace ID for code execution';
COMMENT ON COLUMN projects.deployment_url IS 'Full deployment URL (subdomain.vaporform.dev)';
COMMENT ON COLUMN projects.storage_used_bytes IS 'Total storage used by project files in GridFS';
COMMENT ON COLUMN projects.compute_minutes_used IS 'Total compute minutes used by builds/execution';
