-- Fix unique constraints to exclude soft-deleted projects
-- Drop old indexes
DROP INDEX IF EXISTS unique_personal_project;
DROP INDEX IF EXISTS unique_org_project;

-- Recreate indexes with deleted_at IS NULL condition
CREATE UNIQUE INDEX unique_personal_project ON projects(clerk_user_id, name)
WHERE clerk_org_id IS NULL AND deleted_at IS NULL;

CREATE UNIQUE INDEX unique_org_project ON projects(clerk_org_id, name)
WHERE clerk_org_id IS NOT NULL AND deleted_at IS NULL;
