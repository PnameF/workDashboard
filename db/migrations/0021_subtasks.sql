ALTER TABLE tasks ADD COLUMN parent_id TEXT REFERENCES tasks(id) ON DELETE CASCADE;
ALTER TABLE tasks ADD COLUMN archived_parent_id TEXT;
CREATE INDEX tasks_parent ON tasks(parent_id);
