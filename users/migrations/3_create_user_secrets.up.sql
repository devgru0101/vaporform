-- Create user_secrets table for storing encrypted API keys and sensitive data
CREATE TABLE IF NOT EXISTS user_secrets (
    id BIGSERIAL PRIMARY KEY,
    user_id TEXT NOT NULL,
    secret_key TEXT NOT NULL,
    secret_value TEXT NOT NULL,
    created_at TIMESTAMP NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP NOT NULL DEFAULT NOW(),
    UNIQUE(user_id, secret_key)
);

-- Create index on user_id for faster lookups
CREATE INDEX IF NOT EXISTS idx_user_secrets_user_id ON user_secrets(user_id);

-- Create index on secret_key
CREATE INDEX IF NOT EXISTS idx_user_secrets_key ON user_secrets(secret_key);
