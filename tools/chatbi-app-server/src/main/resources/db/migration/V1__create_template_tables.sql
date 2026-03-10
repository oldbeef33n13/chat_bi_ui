CREATE TABLE IF NOT EXISTS template (
  id TEXT PRIMARY KEY,
  template_type TEXT NOT NULL,
  name TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  tags_json TEXT NOT NULL DEFAULT '[]',
  current_revision INTEGER NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS template_revision (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  template_id TEXT NOT NULL,
  revision_no INTEGER NOT NULL,
  template_json TEXT NOT NULL,
  created_at TEXT NOT NULL,
  created_by TEXT NOT NULL DEFAULT 'system',
  CONSTRAINT fk_template_revision_template
    FOREIGN KEY (template_id) REFERENCES template(id) ON DELETE CASCADE,
  CONSTRAINT uq_template_revision UNIQUE (template_id, revision_no)
);

CREATE INDEX IF NOT EXISTS idx_template_type_updated
  ON template(template_type, updated_at DESC);

CREATE INDEX IF NOT EXISTS idx_template_revision_lookup
  ON template_revision(template_id, revision_no DESC);
