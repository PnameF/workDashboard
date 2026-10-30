ALTER TABLE tasks ADD COLUMN archived_at TEXT;
CREATE INDEX IF NOT EXISTS idx_tasks_archived ON tasks(archived_at);
