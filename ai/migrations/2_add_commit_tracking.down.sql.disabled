-- Rollback commit tracking for chat messages
DROP INDEX IF EXISTS idx_chat_messages_commits;

ALTER TABLE chat_messages
  DROP COLUMN IF EXISTS pre_edit_commit_hash,
  DROP COLUMN IF EXISTS post_edit_commit_hash;
