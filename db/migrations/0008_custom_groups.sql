CREATE TABLE task_groups (id TEXT PRIMARY KEY,name TEXT NOT NULL CHECK(length(name) BETWEEN 1 AND 60),color TEXT NOT NULL);
ALTER TABLE tasks ADD COLUMN group_id TEXT REFERENCES task_groups(id);
CREATE INDEX tasks_group_order ON tasks(group_id,sort_order);
