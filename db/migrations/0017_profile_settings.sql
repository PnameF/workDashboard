ALTER TABLE auth_users ADD COLUMN preferences TEXT NOT NULL DEFAULT '{}';
ALTER TABLE auth_users ADD COLUMN avatar_id TEXT;
ALTER TABLE auth_users ADD COLUMN avatar_url TEXT;
