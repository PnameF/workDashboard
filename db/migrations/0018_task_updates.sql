CREATE TABLE task_updates (
 id TEXT PRIMARY KEY,
 task_id TEXT NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
 author_id TEXT REFERENCES auth_users(id) ON DELETE SET NULL,
 body TEXT NOT NULL CHECK(length(body) BETWEEN 1 AND 10000),
 created_at INTEGER NOT NULL,
 updated_at INTEGER NOT NULL
);
CREATE INDEX task_updates_task_time ON task_updates(task_id,created_at DESC,id DESC);
