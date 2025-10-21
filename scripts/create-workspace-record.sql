-- Insert workspace record for project 12
-- This fixes the missing database record issue

-- First, check if workspace 82 exists
SELECT id, project_id, daytona_sandbox_id, status, name
FROM workspaces
WHERE id = 82 OR project_id = 12;

-- Insert the workspace record
INSERT INTO workspaces (
  id,
  project_id,
  daytona_sandbox_id,
  name,
  status,
  language,
  environment,
  ephemeral,
  auto_stop_interval,
  auto_archive_interval,
  created_at,
  updated_at
) VALUES (
  82,                                                -- id (from Daytona labels)
  12,                                                -- project_id
  '2a671d8b-827c-46ab-b973-7df03afccca7',          -- daytona_sandbox_id (from Daytona API)
  'FlowLM Workspace',                               -- name (from Daytona labels)
  'running',                                         -- status (confirmed started)
  'typescript',                                      -- language (from Daytona labels)
  '{"PROJECT_ID": "12", "PROJECT_NAME": "FlowLM Workspace"}', -- environment
  false,                                             -- ephemeral
  60,                                                -- auto_stop_interval (60 min)
  1440,                                              -- auto_archive_interval (24 hours)
  '2025-10-20 16:54:31.089Z',                       -- created_at (from Daytona)
  NOW()                                              -- updated_at
)
ON CONFLICT (id) DO UPDATE
SET
  daytona_sandbox_id = EXCLUDED.daytona_sandbox_id,
  status = EXCLUDED.status,
  updated_at = NOW();

-- Verify the insertion
SELECT id, project_id, daytona_sandbox_id, status, name, created_at
FROM workspaces
WHERE id = 82;
