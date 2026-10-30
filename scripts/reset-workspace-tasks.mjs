import { createHash } from 'node:crypto';
import assert from 'node:assert/strict';

// This maintenance command intentionally preserves users, sessions and board setup.
// Refuse attachments: object cleanup requires a separate reviewed R2-aware plan.
if (process.argv[2] !== '--apply-keep-users-and-board') {
  throw new Error('Explicit --apply-keep-users-and-board required');
}
const account = process.env.CLOUDFLARE_ACCOUNT_ID;
const database = process.env.CLOUDFLARE_D1_DATABASE_ID;
const token = process.env.CLOUDFLARE_API_TOKEN;
assert.ok(account && database && token, 'Missing D1 configuration');
async function query(sql, params = []) {
  const response = await fetch(`https://api.cloudflare.com/client/v4/accounts/${account}/d1/database/${database}/query`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ sql, params }),
    signal: AbortSignal.timeout(30000),
  });
  const data = await response.json();
  if (!response.ok || !data.success || data.result?.some(r => r.success === false)) throw new Error(`D1 reset query failed (${response.status})`);
  return data.result[0];
}
const preserved = ['auth_users', 'auth_recovery', 'members', 'board_settings', 'custom_columns', 'task_groups', 'd1_migrations'];
async function fingerprints() {
  const result = {};
  for (const table of preserved) {
    const { results } = await query(`SELECT * FROM "${table}" ORDER BY rowid`);
    result[table] = createHash('sha256').update(JSON.stringify(results)).digest('hex');
  }
  return result;
}
async function counts() {
  const { results: [row] } = await query('SELECT (SELECT COUNT(*) FROM tasks) AS tasks, (SELECT COUNT(*) FROM task_updates) AS updates, (SELECT COUNT(*) FROM attachments) AS attachments, (SELECT COUNT(*) FROM task_update_files) AS update_images, (SELECT COUNT(*) FROM auth_users) AS users, (SELECT COUNT(*) FROM auth_sessions) AS sessions');
  return row;
}
const before = await counts();
assert.equal(before.attachments + before.update_images, 0, 'Files detected; stop before deletion to plan R2 cleanup');
const retained = await fingerprints();
const { results: tasks } = await query('SELECT id FROM tasks ORDER BY id');
assert.equal(tasks.length, before.tasks, 'Task count changed; retry after workspace activity stops');
if (tasks.length) {
  assert.ok(tasks.length <= 90, 'Large reset requires chunked maintenance plan');
  await query(`DELETE FROM tasks WHERE id IN (${tasks.map(() => '?').join(',')}) AND NOT EXISTS (SELECT 1 FROM attachments) AND NOT EXISTS (SELECT 1 FROM task_update_files)`, tasks.map(t => t.id));
}
const after = await counts();
assert.equal(after.tasks, 0, 'Tasks remain or new tasks were created; review before retry');
assert.equal(after.updates + after.attachments + after.update_images, 0, 'Dependent records remain');
assert.deepEqual(await fingerprints(), retained, 'Preserved account or board data changed during reset');
console.log(JSON.stringify({ completed: true, before, after, users_and_board_unchanged: true, r2_deletions: 0 }, null, 2));
