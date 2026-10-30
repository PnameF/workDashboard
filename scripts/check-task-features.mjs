import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { createInterface } from "node:readline";
import { build } from "esbuild";
const python = process.argv[2];
if (!python) throw Error("Pass the bundled Python executable path");
const child = spawn(python, ["scripts/sqlite-unit-worker.py"], {
    stdio: ["pipe", "pipe", "pipe"],
    env: { ...process.env, PYTHONIOENCODING: "utf-8" },
  }),
  pending = new Map();
let seq = 0,
  readyResolve;
const ready = new Promise((resolve) => (readyResolve = resolve));
let stderr = "";
child.stderr.on("data", (chunk) => (stderr += chunk));
createInterface({ input: child.stdout }).on("line", (line) => {
  const data = JSON.parse(line);
  if (data.ready) {
    readyResolve();
    return;
  }
  const item = pending.get(data.id);
  pending.delete(data.id);
  if (data.error) item.reject(Error(data.error));
  else item.resolve(data.result);
});
child.on("exit", (code) => {
  for (const item of pending.values())
    item.reject(Error(stderr || "SQLite worker exited " + code));
});
function queries(queries, batch = false) {
  return new Promise((resolve, reject) => {
    const id = ++seq;
    pending.set(id, { resolve, reject });
    child.stdin.write(JSON.stringify({ id, queries, batch }) + "\n");
  });
}
class Statement {
  constructor(sql, params = []) {
    this.sql = sql;
    this.params = params;
  }
  bind(...params) {
    return new Statement(this.sql, params);
  }
  async all() {
    return (await queries([{ sql: this.sql, params: this.params }]))[0];
  }
  async first() {
    return (await this.all()).results[0] ?? null;
  }
  async run() {
    return this.all();
  }
}
const db = {
    prepare: (sql) => new Statement(sql),
    batch: (statements) =>
      queries(
        statements.map((s) => ({ sql: s.sql, params: s.params })),
        true,
      ),
  },
  objects = new Map();
globalThis.unitDb = db;
globalThis.unitBucket = {
  put: async (id, bytes) => objects.set(id, bytes),
  delete: async (id) => {
    for (const value of Array.isArray(id) ? id : [id]) objects.delete(value);
  },
};
globalThis.unitUser = {
  id: "unit-member",
  memberId: 0,
  name: "Unit Member",
  role: "member",
  email: "unit@example.test",
};
async function module(file, stub = false) {
  const result = await build({
    entryPoints: [file],
    bundle: true,
    write: false,
    format: "esm",
    platform: "node",
    plugins: stub
      ? [
          {
            name: "unit-storage",
            setup(b) {
              b.onResolve({ filter: /^@\/lib\/(auth|db)$/ }, (args) => ({
                path: args.path,
                namespace: "unit",
              }));
              b.onLoad({ filter: /.*/, namespace: "unit" }, (args) => ({
                contents: args.path.endsWith("/auth")
                  ? `export async function checkAccess(){return globalThis.unitUser?null:Response.json({error:'Unauthorized'},{status:401});}export async function getSessionUser(){return globalThis.unitUser;}export async function rateLimit(){return true;}export async function validMembers(){return true;}`
                  : `export async function getDb(){return globalThis.unitDb;}export async function getBucket(){return globalThis.unitBucket;}export async function getPublicFileUrl(id){return 'https://assets.example.test/'+id;}`,
              }));
            },
          },
        ]
      : [],
  });
  return import(
    "data:text/javascript;base64," +
      Buffer.from(result.outputFiles[0].text).toString("base64")
  );
}
const req = (url, method = "GET", body) =>
  new Request("http://localhost" + url, {
    method,
    headers:
      body instanceof FormData
        ? undefined
        : body
          ? { "Content-Type": "application/json" }
          : undefined,
    body:
      body instanceof FormData ? body : body ? JSON.stringify(body) : undefined,
  });
try {
  await ready;
  await db
    .prepare(
      "INSERT INTO auth_users(id,email,name,password_hash,role,created_at) VALUES(?,?,?,?,?,?)",
    )
    .bind(
      "unit-member",
      "unit@example.test",
      "Unit Member",
      "unit-only",
      "member",
      0,
    )
    .run();
  await db
    .prepare(
      "INSERT INTO tasks(id,name,person,status,date,priority,project,hours,custom,assignees,group_id) VALUES('unit-task','Unit Task',0,1,'2026-10-30','สูง','Development',0,'{}','[0]','todo')",
    )
    .run();
  const updates = await module("app/api/tasks/[id]/updates/route.ts", true),
    route = { params: Promise.resolve({ id: "unit-task" }) };
  assert.equal(
    (await updates.GET(req("/api/tasks/unit-task/updates"), route)).status,
    200,
  );
  const missingUser = globalThis.unitUser;
  globalThis.unitUser = null;
  assert.equal(
    (
      await updates.POST(
        req("/api/tasks/unit-task/updates", "POST", { body: "blocked" }),
        route,
      )
    ).status,
    401,
  );
  globalThis.unitUser = missingUser;
  let response = await updates.POST(
    req("/api/tasks/unit-task/updates", "POST", {
      body: "**Progress**",
      author_id: "forged",
    }),
    route,
  );
  assert.equal(response.status, 201);
  const comment = await response.json();
  assert.equal(comment.authorName, "Unit Member");
  assert.equal(
    (
      await db
        .prepare("SELECT author_id FROM task_updates WHERE id=?")
        .bind(comment.id)
        .first()
    ).author_id,
    "unit-member",
  );
  globalThis.unitUser = { ...missingUser, id: "other-member" };
  assert.equal(
    (
      await updates.PATCH(
        req("/api/tasks/unit-task/updates", "PATCH", {
          updateId: comment.id,
          body: "forbidden",
        }),
        route,
      )
    ).status,
    403,
  );
  globalThis.unitUser = missingUser;
  const form = new FormData();
  form.set("body", "");
  form.append(
    "images",
    new File([new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10])], "unit.png", {
      type: "image/png",
    }),
  );
  response = await updates.POST(
    req("/api/tasks/unit-task/updates", "POST", form),
    route,
  );
  assert.equal(response.status, 201);
  const imageComment = await response.json();
  assert.equal(imageComment.images.length, 1);
  assert.ok(
    imageComment.images[0].url.startsWith("https://assets.example.test/"),
  );
  assert.equal(objects.size, 1);
  const big = new FormData();
  big.set("body", "");
  big.append(
    "images",
    new File([new Uint8Array(2097153)], "too-big.png", { type: "image/png" }),
  );
  assert.equal(
    (
      await updates.POST(
        req("/api/tasks/unit-task/updates", "POST", big),
        route,
      )
    ).status,
    400,
  );
  assert.equal(objects.size, 1);
  response = await updates.GET(req("/api/tasks/unit-task/updates"), route);
  assert.equal(
    (await response.json()).items.find((item) => item.id === imageComment.id)
      .images.length,
    1,
  );
  response = await updates.PATCH(
    req("/api/tasks/unit-task/updates", "PATCH", {
      updateId: imageComment.id,
      body: "Image caption",
    }),
    route,
  );
  assert.equal((await response.json()).images.length, 1);
  response = await updates.DELETE(
    req("/api/tasks/unit-task/updates", "DELETE", {
      updateId: imageComment.id,
    }),
    route,
  );
  assert.equal(response.status, 200);
  assert.equal(objects.size, 0);
  assert.equal(
    (
      await db
        .prepare("SELECT count(*) AS count FROM task_update_files")
        .first()
    ).count,
    0,
  );
  const options = await module("app/api/options/route.ts", true);
  response = await options.PATCH(
    req("/api/options", "PATCH", {
      columnId: "project",
      oldValue: "Development",
      value: "Software",
      color: "#7543b6",
    }),
  );
  assert.equal(response.status, 200);
  assert.equal(
    (await db.prepare("SELECT project FROM tasks WHERE id='unit-task'").first())
      .project,
    "Software",
  );
  await db
    .prepare(
      "INSERT INTO custom_columns(id,name,type,options) VALUES('unit-labels','Labels','multiselect','[\"A\",\"B\"]')",
    )
    .run();
  await db
    .prepare("UPDATE tasks SET custom=? WHERE id='unit-task'")
    .bind(JSON.stringify({ "unit-labels": ["A", "B"] }))
    .run();
  response = await options.PATCH(
    req("/api/options", "PATCH", {
      columnId: "unit-labels",
      oldValue: "A",
      value: "Renamed",
      color: "#a33e83",
    }),
  );
  assert.equal(response.status, 200);
  assert.deepEqual(
    JSON.parse(
      (
        await db
          .prepare("SELECT custom FROM tasks WHERE id='unit-task'")
          .first()
      ).custom,
    )["unit-labels"],
    ["Renamed", "B"],
  );
  const groups = await module("app/api/groups/route.ts", true);
  response = await groups.PATCH(
    req("/api/groups", "PATCH", {
      id: "todo",
      action: "archive",
      expectedCount: 1,
    }),
  );
  assert.equal(response.status, 200);
  assert.equal(
    (
      await db
        .prepare("SELECT archived_group_id FROM tasks WHERE id='unit-task'")
        .first()
    ).archived_group_id,
    "todo",
  );
  assert.equal(
    (await db.prepare("SELECT count(*) AS count FROM task_updates").first())
      .count,
    1,
  );
  response = await groups.PATCH(
    req("/api/groups", "PATCH", {
      id: "todo",
      action: "restore",
      expectedCount: 1,
    }),
  );
  assert.equal(response.status, 200);
  assert.equal(
    (
      await db
        .prepare("SELECT archived_at FROM tasks WHERE id='unit-task'")
        .first()
    ).archived_at,
    null,
  );
  const columns = await module("app/api/columns/route.ts", true);
  response = await columns.DELETE(
    req("/api/columns", "DELETE", { id: "unit-labels" }),
  );
  assert.equal(response.status, 200);
  assert.equal(
    await db
      .prepare("SELECT id FROM custom_columns WHERE id='unit-labels'")
      .first(),
    null,
  );
  assert.equal(
    JSON.parse(
      (
        await db
          .prepare("SELECT custom FROM tasks WHERE id='unit-task'")
          .first()
      ).custom,
    )["unit-labels"],
    undefined,
  );
  assert.equal(
    (await columns.DELETE(req("/api/columns", "DELETE", { id: "name" })))
      .status,
    400,
  );
  const helpers = await module("lib/deleted-columns.ts"),
    layout = JSON.parse(
      (await db.prepare("SELECT layout FROM board_settings WHERE id=1").first())
        .layout,
    );
  assert.ok(layout.deletedColumns.includes("unit-labels"));
  assert.equal(
    helpers.applyDeletedColumns(
      {
        name: "Keep",
        assignees: [0],
        person: 0,
        status: 2,
        date: "2026-10-30",
        priority: "สูง",
        project: "Old",
        hours: 5,
        custom: { "unit-labels": "old" },
      },
      { ...layout, deletedColumns: [...layout.deletedColumns, "project"] },
    ).project,
    "",
  );

  const taskApi = await module("app/api/tasks/route.ts", true),
    stored = await db
      .prepare("SELECT * FROM tasks WHERE id='unit-task'")
      .first();
  response = await taskApi.PATCH(
    req("/api/tasks", "PATCH", {
      ...stored,
      assignees: JSON.parse(stored.assignees),
      custom: { "unit-labels": "resurrect" },
    }),
  );
  assert.equal(response.status, 200);
  assert.equal((await response.json()).custom["unit-labels"], undefined);
  response = await columns.DELETE(
    req("/api/columns", "DELETE", { id: "hours" }),
  );
  assert.equal(response.status, 200);
  assert.equal(
    (await db.prepare("SELECT hours FROM tasks WHERE id='unit-task'").first())
      .hours,
    null,
  );
  const editor = await module("lib/task-editor.ts"),
    editorLayout = {
      order: ["hours", "date", "timeline", "name"],
      hidden: [],
      overrides: {
        hours: { id: "hours", name: "ชิ้น", type: "number" },
        date: { id: "date", name: "เสร็จงาน", type: "date" },
      },
    },
    editorColumns = [{ id: "timeline", name: "dateline", type: "timeline" }],
    editorSchema = editor.editorFields(editorColumns, editorLayout);
  assert.deepEqual(
    editorSchema.slice(0, 3).map((f) => f.name),
    ["ชิ้น", "เสร็จงาน", "dateline"],
  );
  const edited = editor.setEditorValue(
    { ...stored, custom: {} },
    editorSchema[0],
    "9",
  );
  assert.equal(edited.custom["view:hours"], "9");
  assert.equal(edited.project, "Software");
  const emptyGroup = await (
    await groups.POST(
      req("/api/groups", "POST", {
        name: "Empty unit group",
        color: "#3159a5",
      }),
    )
  ).json();
  assert.equal(
    (
      await groups.PATCH(
        req("/api/groups", "PATCH", {
          id: emptyGroup.id,
          action: "archive",
          expectedCount: 0,
        }),
      )
    ).status,
    200,
  );
  assert.equal(
    (
      await groups.PATCH(
        req("/api/groups", "PATCH", {
          id: emptyGroup.id,
          action: "restore",
          expectedCount: 0,
        }),
      )
    ).status,
    200,
  );
  // Regression: older column removal left orphan IDs in persisted layout.
  const layoutApi = await module("app/api/table-layout/route.ts", true);
  const workspaceApi = await module("app/api/workspace/route.ts", true);
  const priorLayout = JSON.parse(
    (await db.prepare("SELECT layout FROM board_settings WHERE id=1").first())
      .layout,
  );
  const staleLayout = {
    ...priorLayout,
    order: [
      ...new Set([...priorLayout.order, "name", "date", "orphan-column"]),
    ],
    hidden: [...new Set([...priorLayout.hidden, "orphan-column"])],
    overrides: {
      ...priorLayout.overrides,
      "orphan-column": { id: "orphan-column", name: "Removed", type: "text" },
    },
    widths: { ...priorLayout.widths, "orphan-column": 150 },
    optionColors: {
      ...priorLayout.optionColors,
      "orphan-column": { Old: "#3159a5" },
    },
    calendarFields: ["name", "orphan-column"],
  };
  await db
    .prepare("UPDATE board_settings SET layout=? WHERE id=1")
    .bind(JSON.stringify(staleLayout))
    .run();
  const loaded = await (await workspaceApi.GET()).json();
  assert.ok(!loaded.layout.order.includes("orphan-column"));
  assert.ok(!loaded.layout.hidden.includes("orphan-column"));
  assert.equal(loaded.layout.overrides["orphan-column"], undefined);
  const renamedLayout = {
    ...staleLayout,
    overrides: {
      ...staleLayout.overrides,
      date: { id: "date", name: "วันส่งงานใหม่", type: "date", options: [] },
    },
  };
  response = await layoutApi.PUT(
    req("/api/table-layout", "PUT", renamedLayout),
  );
  assert.equal(response.status, 200, await response.clone().text());
  const savedRename = await response.json();
  assert.equal(savedRename.overrides.date.name, "วันส่งงานใหม่");
  assert.ok(!savedRename.order.includes("orphan-column"));
  assert.equal(savedRename.widths["orphan-column"], undefined);
  assert.equal(savedRename.optionColors["orphan-column"], undefined);
  const reloaded = await (await workspaceApi.GET()).json();
  assert.equal(reloaded.layout.overrides.date.name, "วันส่งงานใหม่");
  assert.equal(
    (
      await layoutApi.PUT(
        req("/api/table-layout", "PUT", {
          ...savedRename,
          order: [...savedRename.order, "unknown-new-column"],
        }),
      )
    ).status,
    400,
  );
  console.log(
    "PASS: all migrations, authenticated updates, author enforcement, R2 image metadata, image-only posts, 2MB limit, image cleanup, global label renames, group archive/restore, permanent column deletion, preserved updates, and column rename/reload with orphan layout references. No remote records were created.",
  );
} finally {
  child.stdin.end();
}
