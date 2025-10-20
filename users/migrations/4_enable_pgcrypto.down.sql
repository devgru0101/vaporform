-- Rollback pgcrypto extension
-- Only drops if no other objects depend on it

DROP EXTENSION IF EXISTS pgcrypto CASCADE;
