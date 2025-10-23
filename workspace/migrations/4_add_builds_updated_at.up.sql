-- Add updated_at column to builds table
ALTER TABLE builds ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP DEFAULT NOW();

-- Create function to auto-update updated_at timestamp
CREATE OR REPLACE FUNCTION update_builds_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create trigger to auto-update updated_at on row changes
DROP TRIGGER IF EXISTS trigger_update_builds_updated_at ON builds;
CREATE TRIGGER trigger_update_builds_updated_at
  BEFORE UPDATE ON builds
  FOR EACH ROW
  EXECUTE FUNCTION update_builds_updated_at();

-- Add comment
COMMENT ON COLUMN builds.updated_at IS 'Timestamp of last update to build record';
