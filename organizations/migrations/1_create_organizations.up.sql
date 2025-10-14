-- Create organizations table
CREATE TABLE organizations (
  id BIGSERIAL PRIMARY KEY,
  clerk_org_id TEXT UNIQUE NOT NULL,
  name TEXT NOT NULL,
  slug TEXT UNIQUE NOT NULL,
  logo_url TEXT,
  subscription_tier TEXT DEFAULT 'team' CHECK (subscription_tier IN ('team', 'enterprise')),
  max_members INTEGER DEFAULT -1,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW(),
  deleted_at TIMESTAMP
);

-- Create organization members table
CREATE TABLE organization_members (
  id BIGSERIAL PRIMARY KEY,
  org_id BIGINT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  user_id BIGINT NOT NULL,
  clerk_org_id TEXT NOT NULL,
  clerk_user_id TEXT NOT NULL,
  role TEXT NOT NULL CHECK (role IN ('org:owner', 'org:admin', 'org:developer', 'org:viewer')),
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW(),
  UNIQUE(org_id, user_id)
);

-- Indexes
CREATE INDEX idx_orgs_clerk_id ON organizations(clerk_org_id);
CREATE INDEX idx_orgs_slug ON organizations(slug);
CREATE INDEX idx_orgs_deleted ON organizations(deleted_at) WHERE deleted_at IS NULL;

CREATE INDEX idx_org_members_org ON organization_members(org_id);
CREATE INDEX idx_org_members_user ON organization_members(user_id);
CREATE INDEX idx_org_members_clerk_org ON organization_members(clerk_org_id);
CREATE INDEX idx_org_members_clerk_user ON organization_members(clerk_user_id);
CREATE INDEX idx_org_members_role ON organization_members(role);

-- Comments
COMMENT ON TABLE organizations IS 'Organizations synced from Clerk';
COMMENT ON TABLE organization_members IS 'Organization membership with roles (RBAC)';
COMMENT ON COLUMN organizations.max_members IS 'Max members allowed (-1 = unlimited)';
COMMENT ON COLUMN organization_members.role IS 'User role in organization: owner, admin, developer, or viewer';
