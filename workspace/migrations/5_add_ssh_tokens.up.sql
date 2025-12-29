-- Create SSH tokens table for terminal access
CREATE TABLE IF NOT EXISTS ssh_tokens (
  id BIGSERIAL PRIMARY KEY,
  workspace_id BIGINT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  token TEXT NOT NULL UNIQUE,
  expires_at TIMESTAMP NOT NULL,
  created_at TIMESTAMP DEFAULT NOW()
);

-- Create index for efficient token lookup
CREATE INDEX idx_ssh_tokens_workspace ON ssh_tokens(workspace_id);
CREATE INDEX idx_ssh_tokens_token ON ssh_tokens(token);
CREATE INDEX idx_ssh_tokens_expires ON ssh_tokens(expires_at);

-- Add cleanup trigger to delete expired tokens
CREATE OR REPLACE FUNCTION cleanup_expired_ssh_tokens()
RETURNS TRIGGER AS $$
BEGIN
  DELETE FROM ssh_tokens WHERE expires_at < NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_cleanup_expired_ssh_tokens
  AFTER INSERT ON ssh_tokens
  EXECUTE FUNCTION cleanup_expired_ssh_tokens();

-- Comments
COMMENT ON TABLE ssh_tokens IS 'SSH access tokens for Daytona terminal connections';
COMMENT ON COLUMN ssh_tokens.token IS 'Unique SSH token used as username for ssh.app.daytona.io';
COMMENT ON COLUMN ssh_tokens.expires_at IS 'Token expiration timestamp';
