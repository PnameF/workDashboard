UPDATE auth_users SET role='member' WHERE email<>'admin@gmail.com' COLLATE NOCASE;
UPDATE auth_users SET role='admin' WHERE email='admin@gmail.com' COLLATE NOCASE;
