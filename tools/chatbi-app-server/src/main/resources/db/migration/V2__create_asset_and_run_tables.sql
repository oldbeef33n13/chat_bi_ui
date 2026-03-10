CREATE TABLE IF NOT EXISTS asset (
  id TEXT PRIMARY KEY,
  asset_type TEXT NOT NULL,
  name TEXT NOT NULL,
  mime_type TEXT NOT NULL,
  original_file_name TEXT NOT NULL,
  file_ext TEXT NOT NULL,
  file_path TEXT NOT NULL,
  size_bytes INTEGER NOT NULL,
  width_px INTEGER,
  height_px INTEGER,
  sha256 TEXT NOT NULL,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS render_run (
  id TEXT PRIMARY KEY,
  trigger_type TEXT NOT NULL,
  template_id TEXT NOT NULL,
  template_revision_no INTEGER NOT NULL,
  output_type TEXT NOT NULL,
  status TEXT NOT NULL,
  variables_json TEXT NOT NULL DEFAULT '{}',
  started_at TEXT,
  finished_at TEXT,
  error_message TEXT,
  created_at TEXT NOT NULL,
  CONSTRAINT fk_render_run_template
    FOREIGN KEY (template_id) REFERENCES template(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS artifact (
  id TEXT PRIMARY KEY,
  run_id TEXT NOT NULL,
  artifact_type TEXT NOT NULL,
  file_name TEXT NOT NULL,
  file_path TEXT NOT NULL,
  content_type TEXT NOT NULL,
  size_bytes INTEGER NOT NULL,
  created_at TEXT NOT NULL,
  CONSTRAINT fk_artifact_run
    FOREIGN KEY (run_id) REFERENCES render_run(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_asset_created_at
  ON asset(created_at DESC);

CREATE INDEX IF NOT EXISTS idx_render_run_template_created
  ON render_run(template_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_render_run_status_created
  ON render_run(status, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_artifact_run_created
  ON artifact(run_id, created_at ASC);
