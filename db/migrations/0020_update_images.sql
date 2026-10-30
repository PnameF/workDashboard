CREATE TABLE task_updates_new (
 id TEXT PRIMARY KEY,
 task_id TEXT NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
 author_id TEXT REFERENCES auth_users(id) ON DELETE SET NULL,
 body TEXT NOT NULL CHECK(length(body) <= 10000),
 created_at INTEGER NOT NULL,
 updated_at INTEGER NOT NULL
);
INSERT INTO task_updates_new SELECT id,task_id,author_id,body,created_at,updated_at FROM task_updates;
DROP TABLE task_updates;
ALTER TABLE task_updates_new RENAME TO task_updates;
CREATE INDEX task_updates_task_time ON task_updates(task_id,created_at DESC,id DESC);
CREATE TABLE task_update_files (
 id TEXT PRIMARY KEY,
 task_id TEXT NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
 update_id TEXT NOT NULL REFERENCES task_updates(id) ON DELETE CASCADE,
 name TEXT NOT NULL,
 content_type TEXT NOT NULL CHECK(content_type IN ('image/png','image/jpeg','image/webp','image/gif')),
 size INTEGER NOT NULL CHECK(size BETWEEN 1 AND 2097152),
 url TEXT NOT NULL
);
CREATE INDEX task_update_files_update ON task_update_files(update_id);
CREATE INDEX task_update_files_task ON task_update_files(task_id);
