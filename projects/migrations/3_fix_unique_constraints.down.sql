-- Rollback: restore old indexes without deleted_at condition
DROP INDEX IF EXISTS unique_personal_project;
DROP INDEX IF EXISTS unique_org_project;

CREATE UNIQUE INDEX unique_personal_project ON projects(clerk_user_id, name)
WHERE clerk_org_id IS NULL;

CREATE UNIQUE INDEX unique_org_project ON projects(clerk_org_id, name)
WHERE clerk_org_id IS NOT NULL;
