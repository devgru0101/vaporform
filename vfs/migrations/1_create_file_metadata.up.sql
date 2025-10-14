-- Create file metadata table for tracking GridFS files
CREATE TABLE file_metadata (
  id BIGSERIAL PRIMARY KEY,
  project_id BIGINT NOT NULL,
  gridfs_file_id TEXT NOT NULL,
  path TEXT NOT NULL,
  filename TEXT NOT NULL,
  mime_type TEXT,
  size_bytes BIGINT NOT NULL,
  version INTEGER DEFAULT 1,
  is_directory BOOLEAN DEFAULT false,
  parent_path TEXT,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW(),
  deleted_at TIMESTAMP
);

-- Create unique index for project paths (excluding soft-deleted files)
CREATE UNIQUE INDEX unique_project_path ON file_metadata(project_id, path) WHERE deleted_at IS NULL;

-- Indexes for performance
CREATE INDEX idx_file_metadata_project ON file_metadata(project_id) WHERE deleted_at IS NULL;
CREATE INDEX idx_file_metadata_parent_path ON file_metadata(project_id, parent_path) WHERE deleted_at IS NULL;
CREATE INDEX idx_file_metadata_gridfs ON file_metadata(gridfs_file_id);
CREATE INDEX idx_file_metadata_path ON file_metadata(project_id, path) WHERE deleted_at IS NULL;

-- Comments
COMMENT ON TABLE file_metadata IS 'Metadata for files stored in MongoDB GridFS';
COMMENT ON COLUMN file_metadata.project_id IS 'Project this file belongs to';
COMMENT ON COLUMN file_metadata.gridfs_file_id IS 'MongoDB GridFS file ID (ObjectId as string)';
COMMENT ON COLUMN file_metadata.path IS 'Full path including filename (e.g., /src/App.tsx)';
COMMENT ON COLUMN file_metadata.parent_path IS 'Parent directory path (e.g., /src for /src/App.tsx)';
COMMENT ON COLUMN file_metadata.is_directory IS 'Whether this is a directory entry';
COMMENT ON COLUMN file_metadata.version IS 'File version number for versioning support';
