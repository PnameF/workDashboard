PRAGMA defer_foreign_keys = ON;
INSERT OR IGNORE INTO task_groups(id,name,color) VALUES('todo','To-Do','#7197d0');
INSERT OR IGNORE INTO task_groups(id,name,color) VALUES('done','Completed','#64aa91');
CREATE TABLE attachment_backup AS SELECT * FROM attachments;
DROP TABLE attachments;
CREATE TABLE tasks_v2 (
 id TEXT PRIMARY KEY,
 name TEXT NOT NULL CHECK(length(name) BETWEEN 1 AND 250),
 person INTEGER NOT NULL DEFAULT -1 CHECK(person BETWEEN -1 AND 3),
 status INTEGER NOT NULL DEFAULT -1 CHECK(status BETWEEN -1 AND 3),
 date TEXT NOT NULL DEFAULT '',
 priority TEXT NOT NULL DEFAULT '' CHECK(priority IN ('','สูง','ปานกลาง','ต่ำ')),
 project TEXT NOT NULL DEFAULT '',
 hours REAL DEFAULT NULL CHECK(hours IS NULL OR hours >= 0),
 custom TEXT NOT NULL DEFAULT '{}',
 assignees TEXT NOT NULL DEFAULT '[]',
 sort_order REAL,
 group_id TEXT REFERENCES task_groups(id)
 ,created_by INTEGER CHECK(created_by IS NULL OR created_by BETWEEN 0 AND 3)
);
INSERT INTO tasks_v2(id,name,person,status,date,priority,project,hours,custom,assignees,sort_order,group_id) SELECT id,name,person,status,date,priority,project,hours,custom,assignees,sort_order,group_id FROM tasks;
DROP TABLE tasks;
ALTER TABLE tasks_v2 RENAME TO tasks;
CREATE INDEX tasks_person_status ON tasks(person,status);
CREATE INDEX tasks_project_date ON tasks(project,date);
CREATE INDEX tasks_group_order ON tasks(group_id,sort_order);
CREATE TABLE attachments (id TEXT PRIMARY KEY,task_id TEXT NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,name TEXT NOT NULL,content_type TEXT NOT NULL,size INTEGER NOT NULL,created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP);
INSERT INTO attachments(id,task_id,name,content_type,size,created_at) SELECT id,task_id,name,content_type,size,created_at FROM attachment_backup;
DROP TABLE attachment_backup;
CREATE INDEX attachments_task ON attachments(task_id);
