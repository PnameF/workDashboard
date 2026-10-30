ALTER TABLE tasks ADD COLUMN archived_group_id TEXT;
CREATE INDEX tasks_archived_group ON tasks(archived_group_id) WHERE archived_group_id IS NOT NULL;
