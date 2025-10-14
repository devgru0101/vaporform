-- Create embeddings metadata table
CREATE TABLE embeddings (
  id BIGSERIAL PRIMARY KEY,
  project_id BIGINT NOT NULL,
  qdrant_id TEXT NOT NULL,
  collection_name TEXT NOT NULL,
  content_type TEXT NOT NULL CHECK (content_type IN ('code', 'chat', 'documentation', 'error')),
  content_hash TEXT NOT NULL,
  source_path TEXT,
  source_id TEXT,
  metadata JSONB,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW(),
  CONSTRAINT unique_project_qdrant_id UNIQUE(project_id, qdrant_id)
);

-- Indexes
CREATE INDEX idx_embeddings_project ON embeddings(project_id);
CREATE INDEX idx_embeddings_collection ON embeddings(collection_name);
CREATE INDEX idx_embeddings_content_type ON embeddings(project_id, content_type);
CREATE INDEX idx_embeddings_content_hash ON embeddings(content_hash);
CREATE INDEX idx_embeddings_source ON embeddings(source_path, source_id);

-- Comments
COMMENT ON TABLE embeddings IS 'Metadata for vector embeddings stored in Qdrant';
COMMENT ON COLUMN embeddings.qdrant_id IS 'Qdrant point ID (UUID)';
COMMENT ON COLUMN embeddings.collection_name IS 'Qdrant collection name (e.g., project_123_code)';
COMMENT ON COLUMN embeddings.content_type IS 'Type of content embedded (code, chat, documentation, error)';
COMMENT ON COLUMN embeddings.content_hash IS 'SHA-256 hash of content for deduplication';
COMMENT ON COLUMN embeddings.source_path IS 'File path or source location';
COMMENT ON COLUMN embeddings.source_id IS 'Source identifier (commit hash, message ID, etc.)';
COMMENT ON COLUMN embeddings.metadata IS 'Additional metadata (language, framework, context, etc.)';
