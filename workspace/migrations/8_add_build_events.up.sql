-- Build events table for streaming
CREATE TABLE IF NOT EXISTS build_events (
  id SERIAL PRIMARY KEY,
  build_id BIGINT REFERENCES builds(id) ON DELETE CASCADE,
  event_type VARCHAR(50) NOT NULL,
  message TEXT NOT NULL,
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_build_events_build_id ON build_events(build_id, created_at);
