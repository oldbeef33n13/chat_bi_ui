CREATE TABLE IF NOT EXISTS schedule_job (
  id TEXT PRIMARY KEY,
  template_id TEXT NOT NULL,
  name TEXT NOT NULL,
  enabled INTEGER NOT NULL DEFAULT 1,
  cron_expr TEXT NOT NULL,
  timezone TEXT NOT NULL,
  output_type TEXT NOT NULL,
  variables_json TEXT NOT NULL DEFAULT '{}',
  retention_days INTEGER NOT NULL DEFAULT 30,
  last_triggered_at TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  CONSTRAINT fk_schedule_job_template
    FOREIGN KEY (template_id) REFERENCES template(id) ON DELETE CASCADE
);

ALTER TABLE render_run ADD COLUMN schedule_job_id TEXT;

CREATE INDEX IF NOT EXISTS idx_schedule_job_template_updated
  ON schedule_job(template_id, updated_at DESC);

CREATE INDEX IF NOT EXISTS idx_schedule_job_enabled_updated
  ON schedule_job(enabled, updated_at DESC);

CREATE INDEX IF NOT EXISTS idx_render_run_schedule_created
  ON render_run(schedule_job_id, created_at DESC);
