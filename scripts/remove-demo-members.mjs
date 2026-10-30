import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
const account = process.env.CLOUDFLARE_ACCOUNT_ID;
const database = process.env.CLOUDFLARE_D1_DATABASE_ID;
const token = process.env.CLOUDFLARE_API_TOKEN;
assert.ok(account && database && token, 'Missing D1 configuration');
async function query(sql) {
  const response = await fetch(`https://api.cloudflare.com/client/v4/accounts/${account}/d1/database/${database}/query`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ sql }),
    signal: AbortSignal.timeout(30000),
  });
  const data = await response.json();
  if (!response.ok || !data.success || data.result?.some(r => r.success === false)) throw new Error(`D1 member cleanup failed (${response.status})`);
  return data.result[0];
}
async function retainedFingerprint() {
  const data = [];
  for (const sql of ['SELECT * FROM auth_users ORDER BY id', 'SELECT * FROM members WHERE user_id IS NOT NULL ORDER BY id']) {
    data.push((await query(sql)).results);
  }
  return createHash('sha256').update(JSON.stringify(data)).digest('hex');
}
const { results: demos } = await query('SELECT id,name FROM members WHERE user_id IS NULL ORDER BY id');
const { results: [references] } = await query(`SELECT COUNT(*) AS count FROM tasks t JOIN members m ON m.user_id IS NULL AND (t.person=m.id OR t.created_by=m.id OR EXISTS (SELECT 1 FROM json_each(t.assignees) a WHERE a.value=m.id))`);
console.log(JSON.stringify({ demo_members: demos, referenced_tasks: references.count, mode: process.argv.includes('--apply') ? 'apply' : 'read-only' }));
if (process.argv.includes('--apply')) {
  assert.equal(references.count, 0, 'Demo members still referenced by tasks; stop for review');
  const retained = await retainedFingerprint();
  const result = await query(`DELETE FROM members WHERE user_id IS NULL AND NOT EXISTS (SELECT 1 FROM tasks t WHERE t.person=members.id OR t.created_by=members.id OR EXISTS (SELECT 1 FROM json_each(t.assignees) a WHERE a.value=members.id))`);
  const { results: [after] } = await query('SELECT (SELECT COUNT(*) FROM members WHERE user_id IS NULL) AS demo_members, (SELECT COUNT(*) FROM members WHERE user_id IS NOT NULL) AS registered_members, (SELECT COUNT(*) FROM auth_users) AS accounts');
  assert.equal(after.demo_members, 0);
  assert.equal(await retainedFingerprint(), retained, 'Registered data changed during cleanup');
  console.log(JSON.stringify({ completed: true, removed: result.meta.changes, ...after, registered_accounts_unchanged: true }));
}
