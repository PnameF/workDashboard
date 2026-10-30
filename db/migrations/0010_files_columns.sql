CREATE TABLE custom_columns_v4 (id TEXT PRIMARY KEY,name TEXT NOT NULL,type TEXT NOT NULL CHECK(type IN ('text','number','status','date','checkbox','url','email','multiselect','select','files')),options TEXT NOT NULL DEFAULT '[]');
INSERT INTO custom_columns_v4(id,name,type,options) SELECT id,name,type,options FROM custom_columns;
DROP TABLE custom_columns;
ALTER TABLE custom_columns_v4 RENAME TO custom_columns;
ALTER TABLE attachments ADD COLUMN column_id TEXT;
CREATE INDEX attachments_column ON attachments(task_id,column_id);
