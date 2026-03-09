CREATE TABLE IF NOT EXISTS template (
  id TEXT PRIMARY KEY,
  template_type TEXT NOT NULL,
  name TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL,
  tags_json TEXT NOT NULL DEFAULT '[]',
  published_revision INTEGER NOT NULL,
  draft_revision INTEGER NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS template_revision (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  template_id TEXT NOT NULL,
  revision_no INTEGER NOT NULL,
  channel TEXT NOT NULL,
  template_json TEXT NOT NULL,
  created_at TEXT NOT NULL,
  created_by TEXT NOT NULL DEFAULT 'system',
  CONSTRAINT fk_template_revision_template
    FOREIGN KEY (template_id) REFERENCES template(id) ON DELETE CASCADE,
  CONSTRAINT uq_template_revision UNIQUE (template_id, revision_no, channel)
);

CREATE INDEX IF NOT EXISTS idx_template_type_updated
  ON template(template_type, updated_at DESC);

CREATE INDEX IF NOT EXISTS idx_template_status_updated
  ON template(status, updated_at DESC);

CREATE INDEX IF NOT EXISTS idx_template_revision_lookup
  ON template_revision(template_id, channel, revision_no DESC);
