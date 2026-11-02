import assert from "node:assert/strict";
import { build } from "esbuild";
const bundled = await build({
  entryPoints: ["lib/remote-storage.ts"],
  bundle: true,
  write: false,
  platform: "node",
  format: "esm",
});
const { RemoteDatabase } = await import(
  "data:text/javascript;base64," +
    Buffer.from(bundled.outputFiles[0].text).toString("base64")
);
const db = new RemoteDatabase();
const sql = [
  "SELECT COUNT(*) AS count FROM custom_columns",
  "SELECT COUNT(*) AS count FROM board_settings",
  "SELECT COUNT(*) AS count FROM task_groups",
];
const start = performance.now();
const sequential = [];
for (const query of sql) sequential.push(await db.prepare(query).all());
const sequentialMs = Math.round(performance.now() - start);
const batchStart = performance.now();
const batch = await db.batch(sql.map((query) => db.prepare(query)));
const batchMs = Math.round(performance.now() - batchStart);
assert.deepEqual(
  batch.map((r) => r.results),
  sequential.map((r) => r.results),
);
const schemaCode = await build({
  entryPoints: ["lib/task-schema.ts"],
  bundle: true,
  write: false,
  platform: "node",
  format: "esm",
});
const { loadTaskSchema } = await import(
  "data:text/javascript;base64," +
    Buffer.from(schemaCode.outputFiles[0].text).toString("base64")
);
const schemaStart = performance.now();
const schema = await loadTaskSchema(db);
assert.ok(schema.groups.has("done"));
assert.ok(schema.registeredMembers.size <= schema.members.size);
console.log(
  JSON.stringify({
    mode: "read-only",
    sequential_requests: 3,
    batch_requests: 1,
    sequential_ms: sequentialMs,
    batch_ms: batchMs,
    results_equal: true,
    save_schema_valid: true,
    schema_ms: Math.round(performance.now() - schemaStart),
  }),
);
