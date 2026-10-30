PRAGMA defer_foreign_keys=ON;
CREATE TABLE auth_attachment_backup AS SELECT * FROM attachments;
DROP TABLE attachments;
CREATE TABLE tasks_auth (
 id TEXT PRIMARY KEY,
 name TEXT NOT NULL CHECK(length(name) BETWEEN 1 AND 250),
 person INTEGER NOT NULL DEFAULT -1 CHECK(person>=-1),
 status INTEGER NOT NULL DEFAULT -1 CHECK(status BETWEEN -1 AND 3),
 date TEXT NOT NULL DEFAULT '',
 priority TEXT NOT NULL DEFAULT '' CHECK(priority IN ('','สูง','ปานกลาง','ต่ำ')),
 project TEXT NOT NULL DEFAULT '',
 hours REAL DEFAULT NULL CHECK(hours IS NULL OR hours>=0),
 custom TEXT NOT NULL DEFAULT '{}',
 assignees TEXT NOT NULL DEFAULT '[]',
 sort_order REAL,
 group_id TEXT REFERENCES task_groups(id),
 created_by INTEGER REFERENCES members(id),
 archived_at TEXT
);
INSERT INTO tasks_auth(rowid,id,name,person,status,date,priority,project,hours,custom,assignees,sort_order,group_id,created_by,archived_at) SELECT rowid,id,name,person,status,date,priority,project,hours,custom,assignees,sort_order,group_id,created_by,archived_at FROM tasks;
DROP TABLE tasks;
ALTER TABLE tasks_auth RENAME TO tasks;
CREATE INDEX tasks_person_status ON tasks(person,status);
CREATE INDEX tasks_project_date ON tasks(project,date);
CREATE INDEX tasks_group_order ON tasks(group_id,sort_order);
CREATE INDEX idx_tasks_archived ON tasks(archived_at);
CREATE TABLE attachments(id TEXT PRIMARY KEY,task_id TEXT NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,name TEXT NOT NULL,content_type TEXT NOT NULL,size INTEGER NOT NULL,created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,column_id TEXT,url TEXT);
INSERT INTO attachments(id,task_id,name,content_type,size,created_at,column_id,url) SELECT id,task_id,name,content_type,size,created_at,column_id,url FROM auth_attachment_backup;
DROP TABLE auth_attachment_backup;
CREATE INDEX attachments_task ON attachments(task_id);
CREATE INDEX attachments_column ON attachments(task_id,column_id);
