CREATE TABLE custom_columns_v2 (id TEXT PRIMARY KEY,name TEXT NOT NULL,type TEXT NOT NULL CHECK(type IN ('text','number','status','date','checkbox','url','email','multiselect')),options TEXT NOT NULL DEFAULT '[]');
INSERT INTO custom_columns_v2 (id,name,type) SELECT id,name,type FROM custom_columns;
DROP TABLE custom_columns;
ALTER TABLE custom_columns_v2 RENAME TO custom_columns;
