import assert from "node:assert/strict";
const account = process.env.CLOUDFLARE_ACCOUNT_ID,
  database = process.env.CLOUDFLARE_D1_DATABASE_ID,
  token = process.env.CLOUDFLARE_API_TOKEN;
if (!account || !database || !token) throw Error("Missing D1 configuration");
async function read(sql) {
  const response = await fetch(
    `https://api.cloudflare.com/client/v4/accounts/${account}/d1/database/${database}/query`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ sql }),
      signal: AbortSignal.timeout(15000),
    },
  );
  if (!response.ok) throw Error("D1 schema check HTTP " + response.status);
  const data = await response.json();
  assert.ok(data.success, "D1 schema query failed");
  return data.result[0].results;
}
const [schema] = await read(
  "SELECT (SELECT COUNT(*) FROM d1_migrations) AS migrations,(SELECT COUNT(*) FROM sqlite_master WHERE type='table' AND name IN ('task_updates','task_update_files')) AS update_tables",
);
assert.ok(schema.migrations >= 20);
assert.equal(schema.update_tables, 2);
await read(
  "SELECT c.id,c.body,c.created_at,c.updated_at,u.name,u.role,u.avatar_url,f.url,t.archived_group_id FROM task_updates c LEFT JOIN auth_users u ON u.id=c.author_id LEFT JOIN task_update_files f ON f.update_id=c.id JOIN tasks t ON t.id=c.task_id WHERE 0",
);
await read("SELECT parent_id,archived_parent_id FROM tasks WHERE 0");
assert.ok(schema.migrations >= 21);
console.log(
  JSON.stringify({
    migrations: schema.migrations,
    update_tables: schema.update_tables,
    update_queries_valid: true,
    subtask_columns_valid: true,
    mode: "read-only",
  }),
);
