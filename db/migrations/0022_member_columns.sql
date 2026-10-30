CREATE TABLE custom_columns_member(id TEXT PRIMARY KEY,name TEXT NOT NULL,type TEXT NOT NULL CHECK(type IN ('text','number','status','date','checkbox','url','email','multiselect','select','files','timeline','member')),options TEXT NOT NULL DEFAULT '[]');
INSERT INTO custom_columns_member(id,name,type,options) SELECT id,name,type,options FROM custom_columns;
DROP TABLE custom_columns;
ALTER TABLE custom_columns_member RENAME TO custom_columns;
