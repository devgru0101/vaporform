-- Create deployments table
CREATE TABLE deployments (
  id BIGSERIAL PRIMARY KEY,
  project_id BIGINT NOT NULL,
  container_id TEXT UNIQUE,
  image_name TEXT,
  status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'building', 'deploying', 'running', 'stopped', 'failed', 'deleted')),
  subdomain TEXT UNIQUE,
  url TEXT,
  ports JSONB,
  environment JSONB,
  error_message TEXT,
  health_status TEXT CHECK (health_status IN ('healthy', 'unhealthy', 'unknown')),
  last_health_check TIMESTAMP,
  deployed_at TIMESTAMP,
  stopped_at TIMESTAMP,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW(),
  deleted_at TIMESTAMP
);

-- Create deployment logs table
CREATE TABLE deployment_logs (
  id BIGSERIAL PRIMARY KEY,
  deployment_id BIGINT NOT NULL REFERENCES deployments(id) ON DELETE CASCADE,
  log_level TEXT CHECK (log_level IN ('info', 'warn', 'error', 'debug')),
  message TEXT NOT NULL,
  timestamp TIMESTAMP DEFAULT NOW()
);

-- Create port allocations table
CREATE TABLE port_allocations (
  id BIGSERIAL PRIMARY KEY,
  deployment_id BIGINT NOT NULL REFERENCES deployments(id) ON DELETE CASCADE,
  internal_port INTEGER NOT NULL,
  external_port INTEGER NOT NULL UNIQUE,
  protocol TEXT DEFAULT 'tcp' CHECK (protocol IN ('tcp', 'udp')),
  created_at TIMESTAMP DEFAULT NOW()
);

-- Indexes
CREATE INDEX idx_deployments_project ON deployments(project_id) WHERE deleted_at IS NULL;
CREATE INDEX idx_deployments_status ON deployments(status) WHERE deleted_at IS NULL;
CREATE INDEX idx_deployments_subdomain ON deployments(subdomain) WHERE subdomain IS NOT NULL;
CREATE INDEX idx_deployment_logs_deployment ON deployment_logs(deployment_id);
CREATE INDEX idx_deployment_logs_timestamp ON deployment_logs(timestamp DESC);
CREATE INDEX idx_port_allocations_deployment ON port_allocations(deployment_id);
CREATE INDEX idx_port_allocations_external ON port_allocations(external_port);

-- Comments
COMMENT ON TABLE deployments IS 'Docker container deployments for projects';
COMMENT ON COLUMN deployments.container_id IS 'Docker container ID';
COMMENT ON COLUMN deployments.subdomain IS 'Unique subdomain for this deployment (e.g., project-abc.vaporform.dev)';
COMMENT ON COLUMN deployments.ports IS 'Port mappings (internal -> external)';
COMMENT ON COLUMN deployments.environment IS 'Environment variables for the container';
COMMENT ON TABLE deployment_logs IS 'Logs from deployment operations';
COMMENT ON TABLE port_allocations IS 'Dynamic port allocations for deployments';
