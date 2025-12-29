-- Drop SSH tokens table and related objects
DROP TRIGGER IF EXISTS trigger_cleanup_expired_ssh_tokens ON ssh_tokens;
DROP FUNCTION IF EXISTS cleanup_expired_ssh_tokens();
DROP TABLE IF EXISTS ssh_tokens;
