const account = process.env.CLOUDFLARE_ACCOUNT_ID;
const database = process.env.CLOUDFLARE_D1_DATABASE_ID;
const token = process.env.CLOUDFLARE_API_TOKEN;
if (!account || !database || !token) throw new Error('Missing D1 configuration');
async function read(sql) {
  const response = await fetch(`https://api.cloudflare.com/client/v4/accounts/${account}/d1/database/${database}/query`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ sql }),
    signal: AbortSignal.timeout(30000),
  });
  const data = await response.json();
  if (!response.ok || !data.success || data.result?.some(r => r.success === false)) throw new Error(`D1 inventory failed (${response.status})`);
  return data.result[0].results;
}
const tables = await read("SELECT name FROM sqlite_master WHERE type='table' AND name IN ('tasks','attachments','task_updates','task_update_files','auth_users','auth_sessions','auth_recovery','members','board_settings','custom_columns','task_groups','d1_migrations') ORDER BY name");
const counts = {};
for (const { name } of tables) {
  const safeName = name.replaceAll('"', '""');
  const [row] = await read(`SELECT COUNT(*) AS count FROM "${safeName}"`);
  counts[name] = row.count;
}
const roles = await read('SELECT role, COUNT(*) AS count FROM auth_users GROUP BY role');
console.log(JSON.stringify({ mode: 'read-only', counts, roles }, null, 2));
