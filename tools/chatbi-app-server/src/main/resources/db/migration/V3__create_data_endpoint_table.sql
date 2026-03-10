CREATE TABLE IF NOT EXISTS data_endpoint (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  category TEXT NOT NULL DEFAULT '',
  provider_type TEXT NOT NULL,
  origin TEXT NOT NULL,
  method TEXT NOT NULL,
  path TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  param_schema_json TEXT NOT NULL DEFAULT '[]',
  result_schema_json TEXT NOT NULL DEFAULT '[]',
  sample_request_json TEXT NOT NULL DEFAULT '{}',
  sample_response_json TEXT NOT NULL DEFAULT '[]',
  enabled INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_data_endpoint_provider_enabled
  ON data_endpoint(provider_type, enabled, updated_at DESC);

CREATE INDEX IF NOT EXISTS idx_data_endpoint_category_name
  ON data_endpoint(category, name);
