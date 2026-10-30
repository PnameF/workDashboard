import fs from "node:fs";
import assert from "node:assert/strict";
import { installTestSession } from "./test-session.mjs";
await installTestSession();
import { randomUUID } from "node:crypto";
const origin = "http://127.0.0.1:3000",
  owned = [];
async function api(path, method = "GET", body) {
  const r = await fetch(origin + path, {
    method,
    headers:
      body instanceof FormData
        ? undefined
        : { "Content-Type": "application/json" },
    body:
      body === undefined
        ? undefined
        : body instanceof FormData
          ? body
          : JSON.stringify(body),
  });
  const data = await r.json();
  if (!r.ok) throw Error(`${path}: ${r.status} ${data.error}`);
  return data;
}
const fixturePath = ".wrangler/bulk-ui-fixture.json";
if (process.argv.includes("--prepare-ui")) {
  if (fs.existsSync(fixturePath)) throw Error("Clean up the old fixture first");
  const name = "QA archive UI " + randomUUID().slice(0, 8),
    task = await api("/api/tasks", "POST", { name, created_by: 0 });
  fs.writeFileSync(fixturePath, JSON.stringify({ id: task.id, name }));
  console.log(name);
  process.exit(0);
}
if (process.argv.includes("--cleanup-ui")) {
  const fixture = JSON.parse(fs.readFileSync(fixturePath, "utf8")),
    workspace = await api("/api/workspace"),
    archived = await api("/api/tasks/bulk");
  const rows = [...workspace.tasks, ...archived].filter(
    (t) => t.id === fixture.id || t.name === fixture.name + " (สำเนา)",
  );
  for (const row of rows) await api("/api/tasks", "DELETE", { id: row.id });
  fs.unlinkSync(fixturePath);
  console.log("UI bulk fixtures removed.");
  process.exit(0);
}
const tag = randomUUID().slice(0, 8);
try {
  const source = await api("/api/tasks", "POST", {
    name: `QA bulk ${tag}`,
    assignees: [0, 1],
    status: 2,
    date: "2026-10-29",
    hours: 2.5,
    priority: "สูง",
    project: "QA bulk",
    group_id: "todo",
    custom: { "qa-note": "kept" },
  });
  owned.push(source.id);
  const neighbor = await api("/api/tasks", "POST", {
    name: `QA unaffected ${tag}`,
  });
  owned.push(neighbor.id);
  const bytes = Buffer.from(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=",
    "base64",
  );
  for (const [body, type, name] of [
    [bytes, "image/png", "QA.png"],
    [Buffer.from("QA attachment content"), "text/plain", "QA.txt"],
  ]) {
    const form = new FormData();
    form.set("taskId", source.id);
    form.set("file", new Blob([body], { type }), name);
    await api("/api/files", "POST", form);
  }
  const result = await api("/api/tasks/bulk", "POST", {
    action: "duplicate",
    ids: [source.id],
    createdBy: 0,
  });
  assert.equal(result.ids.length, 1);
  const copyId = result.ids[0];
  owned.push(copyId);
  let workspace = await api("/api/workspace"),
    copy = workspace.tasks.find((t) => t.id === copyId);
  assert.ok(copy);
  assert.ok(copy.name.endsWith("(สำเนา)"));
  for (const field of [
    "assignees",
    "status",
    "date",
    "hours",
    "priority",
    "project",
    "group_id",
    "custom",
  ])
    assert.deepEqual(copy[field], source[field]);
  const originals = workspace.attachments.filter(
      (f) => f.task_id === source.id,
    ),
    files = workspace.attachments.filter((f) => f.task_id === copyId);
  assert.equal(files.length, 2);
  for (const f of files) {
    assert.ok(!originals.some((o) => o.id === f.id || o.url === f.url));
    const content = Buffer.from(await (await fetch(f.url)).arrayBuffer());
    assert.deepEqual(
      content,
      f.content_type === "image/png"
        ? bytes
        : Buffer.from("QA attachment content"),
    );
  }
  assert.equal(
    workspace.tasks.filter((t) => t.name === neighbor.name).length,
    1,
  );
  await api("/api/tasks/bulk", "POST", { action: "archive", ids: [copyId] });
  workspace = await api("/api/workspace");
  assert.ok(!workspace.tasks.some((t) => t.id === copyId));
  assert.ok(!workspace.attachments.some((f) => f.task_id === copyId));
  const archived = await api("/api/tasks/bulk");
  assert.equal(archived.find((t) => t.id === copyId)?.file_count, 2);
  assert.ok(workspace.tasks.some((t) => t.id === neighbor.id));
  await api("/api/tasks/bulk", "POST", { action: "restore", ids: [copyId] });
  workspace = await api("/api/workspace");
  copy = workspace.tasks.find((t) => t.id === copyId);
  assert.equal(copy.status, 2);
  assert.equal(copy.group_id, "todo");
  assert.deepEqual(
    workspace.attachments
      .filter((f) => f.task_id === copyId)
      .map((f) => f.id)
      .sort(),
    files.map((f) => f.id).sort(),
  );
  await api("/api/tasks/bulk", "POST", {
    action: "archive",
    ids: [source.id, copyId],
  });
  await api("/api/tasks/bulk", "POST", {
    action: "restore",
    ids: [source.id, copyId],
  });
  const invalid = await fetch(origin + "/api/tasks/bulk", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      action: "archive",
      ids: [neighbor.id, "missing-id"],
    }),
  });
  assert.equal(invalid.status, 409);
  assert.ok(
    (await api("/api/workspace")).tasks.some((t) => t.id === neighbor.id),
  );
  console.log(
    "PASS: selected-only duplication with independent R2 files; archive/restore preserves data, group, status and files; invalid requests leave other tasks intact.",
  );
} finally {
  for (const id of owned.reverse()) await api("/api/tasks", "DELETE", { id });
  console.log("Bulk action test data removed.");
}
