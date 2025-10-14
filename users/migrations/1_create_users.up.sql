-- Create users table
CREATE TABLE users (
  id BIGSERIAL PRIMARY KEY,
  clerk_user_id TEXT UNIQUE NOT NULL,
  email TEXT NOT NULL,
  first_name TEXT,
  last_name TEXT,
  avatar_url TEXT,
  subscription_tier TEXT DEFAULT 'free' CHECK (subscription_tier IN ('free', 'pro', 'team', 'enterprise')),
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW(),
  deleted_at TIMESTAMP
);

-- Indexes for faster queries
CREATE INDEX idx_users_clerk_id ON users(clerk_user_id);
CREATE INDEX idx_users_email ON users(email);
CREATE INDEX idx_users_deleted ON users(deleted_at) WHERE deleted_at IS NULL;

-- Comments for documentation
COMMENT ON TABLE users IS 'User accounts synced from Clerk';
COMMENT ON COLUMN users.clerk_user_id IS 'Clerk user ID (primary key from Clerk)';
COMMENT ON COLUMN users.subscription_tier IS 'User subscription tier: free, pro, team, or enterprise';
COMMENT ON COLUMN users.deleted_at IS 'Soft delete timestamp';
