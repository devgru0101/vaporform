-- Create usage records table
CREATE TABLE usage_records (
  id BIGSERIAL PRIMARY KEY,
  project_id BIGINT NOT NULL,
  user_id TEXT NOT NULL,
  resource_type TEXT NOT NULL CHECK (resource_type IN ('storage', 'compute', 'bandwidth', 'ai_tokens')),
  amount BIGINT NOT NULL,
  unit TEXT NOT NULL,
  period_start TIMESTAMP NOT NULL,
  period_end TIMESTAMP NOT NULL,
  created_at TIMESTAMP DEFAULT NOW()
);

-- Create quota alerts table
CREATE TABLE quota_alerts (
  id BIGSERIAL PRIMARY KEY,
  project_id BIGINT NOT NULL,
  user_id TEXT NOT NULL,
  resource_type TEXT NOT NULL,
  threshold_percent INTEGER NOT NULL,
  current_usage BIGINT NOT NULL,
  quota_limit BIGINT NOT NULL,
  alerted_at TIMESTAMP DEFAULT NOW(),
  acknowledged BOOLEAN DEFAULT false
);

-- Create billing cycles table
CREATE TABLE billing_cycles (
  id BIGSERIAL PRIMARY KEY,
  user_id TEXT NOT NULL,
  subscription_tier TEXT NOT NULL,
  period_start TIMESTAMP NOT NULL,
  period_end TIMESTAMP NOT NULL,
  total_storage_bytes BIGINT DEFAULT 0,
  total_compute_minutes INTEGER DEFAULT 0,
  total_ai_tokens BIGINT DEFAULT 0,
  total_bandwidth_bytes BIGINT DEFAULT 0,
  amount_cents INTEGER,
  status TEXT DEFAULT 'active' CHECK (status IN ('active', 'ended', 'paid')),
  created_at TIMESTAMP DEFAULT NOW()
);

-- Indexes
CREATE INDEX idx_usage_records_project ON usage_records(project_id);
CREATE INDEX idx_usage_records_user ON usage_records(user_id);
CREATE INDEX idx_usage_records_period ON usage_records(period_start, period_end);
CREATE INDEX idx_usage_records_type ON usage_records(resource_type);
CREATE INDEX idx_quota_alerts_project ON quota_alerts(project_id);
CREATE INDEX idx_quota_alerts_user ON quota_alerts(user_id);
CREATE INDEX idx_quota_alerts_unack ON quota_alerts(acknowledged) WHERE acknowledged = false;
CREATE INDEX idx_billing_cycles_user ON billing_cycles(user_id);
CREATE INDEX idx_billing_cycles_period ON billing_cycles(period_start, period_end);
CREATE INDEX idx_billing_cycles_status ON billing_cycles(status);

-- Comments
COMMENT ON TABLE usage_records IS 'Resource usage tracking for billing';
COMMENT ON COLUMN usage_records.resource_type IS 'Type of resource consumed';
COMMENT ON COLUMN usage_records.amount IS 'Amount of resource used';
COMMENT ON COLUMN usage_records.unit IS 'Unit of measurement (bytes, minutes, tokens, etc.)';
COMMENT ON TABLE quota_alerts IS 'Alerts when approaching quota limits';
COMMENT ON TABLE billing_cycles IS 'Monthly billing cycles with aggregated usage';
