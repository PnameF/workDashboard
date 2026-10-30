CREATE TABLE tasks (id TEXT PRIMARY KEY,name TEXT NOT NULL CHECK(length(name) BETWEEN 1 AND 250),person INTEGER NOT NULL CHECK(person BETWEEN 0 AND 3),status INTEGER NOT NULL CHECK(status BETWEEN 0 AND 3),date TEXT NOT NULL,priority TEXT NOT NULL CHECK(priority IN ('สูง','ปานกลาง','ต่ำ')),project TEXT NOT NULL,hours REAL NOT NULL DEFAULT 0 CHECK(hours >= 0),custom TEXT NOT NULL DEFAULT '{}');
CREATE TABLE custom_columns (id TEXT PRIMARY KEY,name TEXT NOT NULL,type TEXT NOT NULL CHECK(type IN ('text','number','status','date','checkbox','url','email')));
CREATE INDEX tasks_person_status ON tasks(person,status);
CREATE INDEX tasks_project_date ON tasks(project,date);
