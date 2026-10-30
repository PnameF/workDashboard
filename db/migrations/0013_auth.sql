CREATE TABLE auth_users (
 id TEXT PRIMARY KEY,
 email TEXT NOT NULL UNIQUE COLLATE NOCASE,
 name TEXT NOT NULL,
 password_hash TEXT NOT NULL,
 role TEXT NOT NULL CHECK(role IN ('admin','member')),
 created_at INTEGER NOT NULL
);
CREATE UNIQUE INDEX auth_single_bootstrap_admin ON auth_users(role) WHERE role='admin';
CREATE TABLE members(id INTEGER PRIMARY KEY,name TEXT NOT NULL,user_id TEXT UNIQUE REFERENCES auth_users(id));
INSERT INTO members(id,name) VALUES(0,'ธนกร'),(1,'พิมพ์ชนก'),(2,'ณัฐวุฒิ'),(3,'ศิริพร');
CREATE TABLE auth_sessions(token_hash TEXT PRIMARY KEY,user_id TEXT NOT NULL REFERENCES auth_users(id) ON DELETE CASCADE,created_at INTEGER NOT NULL);
CREATE INDEX auth_sessions_user ON auth_sessions(user_id);
CREATE TABLE auth_recovery(user_id TEXT PRIMARY KEY REFERENCES auth_users(id) ON DELETE CASCADE,code_hash TEXT NOT NULL,issued_by TEXT NOT NULL REFERENCES auth_users(id),created_at INTEGER NOT NULL);
CREATE TABLE auth_rate_limits(key TEXT PRIMARY KEY,hits INTEGER NOT NULL,reset_at INTEGER NOT NULL);
