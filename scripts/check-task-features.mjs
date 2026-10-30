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
  const bulkApi = await module("app/api/tasks/bulk/route.ts", true);
  const moveApi = await module("app/api/tasks/move/route.ts", true);
  async function createTask(name, parent_id = null, group_id = "todo") {
    const res = await taskApi.POST(
      req("/api/tasks", "POST", { name, parent_id, group_id }),
    );
    assert.equal(res.status, 201, await res.clone().text());
    return res.json();
  }
  async function bulk(action, ids) {
    const res = await bulkApi.POST(
      req("/api/tasks/bulk", "POST", { action, ids }),
    );
    assert.equal(
      res.status,
      action === "duplicate" ? 201 : 200,
      await res.clone().text(),
    );
    return res.json();
  }
  const parent = await createTask("Parent"),
    child = await createTask("Child", parent.id, "done"),
    secondChild = await createTask("Second child", parent.id);
  assert.equal(child.parent_id, parent.id);
  assert.equal(child.group_id, parent.group_id);
  assert.equal(
    (
      await taskApi.POST(
        req("/api/tasks", "POST", { name: "Nested", parent_id: child.id }),
      )
    ).status,
    400,
  );
  assert.equal(
    (
      await taskApi.POST(
        req("/api/tasks", "POST", { name: "Missing", parent_id: "not-found" }),
      )
    ).status,
    400,
  );
  assert.equal(
    (
      await taskApi.PATCH(
        req("/api/tasks", "PATCH", {
          ...child,
          parent_id: child.id,
          status: 2,
        }),
      )
    ).status,
    200,
  );
  assert.equal(
    (
      await db
        .prepare("SELECT parent_id FROM tasks WHERE id=?")
        .bind(child.id)
        .first()
    ).parent_id,
    parent.id,
  );
  assert.equal(
    (
      await db
        .prepare("SELECT status FROM tasks WHERE id=?")
        .bind(parent.id)
        .first()
    ).status,
    -1,
  );
  assert.equal(
    (
      await moveApi.POST(
        req("/api/tasks/move", "POST", { id: child.id, group: "done" }),
      )
    ).status,
    400,
  );
  assert.equal(
    (
      await moveApi.POST(
        req("/api/tasks/move", "POST", { id: parent.id, group: "done" }),
      )
    ).status,
    200,
  );
  assert.equal(
    (
      await db
        .prepare("SELECT group_id FROM tasks WHERE id=?")
        .bind(child.id)
        .first()
    ).group_id,
    "done",
  );
  await bulk("archive", [child.id]);
  await bulk("archive", [parent.id]);
  assert.equal(
    (
      await db
        .prepare(
          "SELECT COUNT(*) AS count FROM tasks WHERE parent_id=? AND archived_at IS NOT NULL",
        )
        .bind(parent.id)
        .first()
    ).count,
    2,
  );
  await bulk("restore", [parent.id]);
  assert.ok(
    (
      await db
        .prepare("SELECT archived_at FROM tasks WHERE id=?")
        .bind(child.id)
        .first()
    ).archived_at,
  );
  assert.equal(
    (
      await db
        .prepare("SELECT archived_at FROM tasks WHERE id=?")
        .bind(secondChild.id)
        .first()
    ).archived_at,
    null,
  );
  await bulk("restore", [child.id]);
  await bulk("archive", [parent.id]);
  await bulk("restore", [child.id]);
  assert.equal(
    (
      await db
        .prepare(
          "SELECT COUNT(*) AS count FROM tasks WHERE (id=? OR parent_id=?) AND archived_at IS NOT NULL",
        )
        .bind(parent.id, parent.id)
        .first()
    ).count,
    0,
  );
  const copied = await bulk("duplicate", [parent.id, child.id]);
  assert.equal(copied.ids.length, 3);
  const { results: copies } = await db
    .prepare(
      "SELECT id,parent_id FROM tasks WHERE id IN(SELECT value FROM json_each(?))",
    )
    .bind(JSON.stringify(copied.ids))
    .all();
  const copiedParent = copies.find((t) => !t.parent_id);
  assert.equal(copies.filter((t) => t.parent_id === copiedParent.id).length, 2);
  const tree = await module("lib/subtasks.ts");
  const familyGroup = await (
    await groups.POST(
      req("/api/groups", "POST", { name: "Subtask group", color: "#3159a5" }),
    )
  ).json();
  const groupedParent = await createTask(
    "Grouped parent",
    null,
    familyGroup.id,
  );
  await createTask("Grouped child", groupedParent.id);
  assert.equal(
    (
      await groups.PATCH(
        req("/api/groups", "PATCH", {
          id: familyGroup.id,
          action: "archive",
          expectedCount: 2,
        }),
      )
    ).status,
    200,
  );
  await bulk("restore", [groupedParent.id]);
  assert.equal(
    (
      await db
        .prepare(
          "SELECT COUNT(*) AS count FROM tasks WHERE group_id=? AND archived_at IS NULL",
        )
        .bind(familyGroup.id)
        .first()
    ).count,
    2,
  );
  assert.equal(
    (
      await groups.PATCH(
        req("/api/groups", "PATCH", {
          id: familyGroup.id,
          action: "delete",
          expectedCount: 2,
        }),
      )
    ).status,
    200,
  );
  assert.equal(
    (
      await db
        .prepare("SELECT COUNT(*) AS count FROM tasks WHERE group_id=?")
        .bind(familyGroup.id)
        .first()
    ).count,
    0,
  );
  assert.equal(tree.isSubtaskExpanded(parent.id, [parent, child], {}), false);
  assert.equal(
    tree.isSubtaskExpanded(parent.id, [parent, child], { [parent.id]: false }),
    true,
  );
  assert.equal(
    tree.isSubtaskExpanded(parent.id, [child], { [parent.id]: true }),
    false,
  );
  assert.deepEqual(
    tree
      .subtaskRows([parent, child, secondChild], [child], {})
      .map((t) => t.id),
    [parent.id, child.id],
  );
  assert.deepEqual(
    tree
      .subtaskRows([parent, child, secondChild], [parent, child, secondChild], {
        [parent.id]: true,
      })
      .map((t) => t.id),
    [parent.id],
  );
  // Even a separately archived child's files must be deleted with its parent.
  await bulk("archive", [child.id]);
  await db
    .prepare(
      "INSERT INTO attachments(id,task_id,name,content_type,size) VALUES('child-file',?,'image.png','image/png',8)",
    )
    .bind(child.id)
    .run();
  objects.set("child-file", new Uint8Array([1]));
  await db
    .prepare(
      "INSERT INTO task_updates(id,task_id,body,created_at,updated_at) VALUES('child-update',?,'Note',1,1)",
    )
    .bind(child.id)
    .run();
  await db
    .prepare(
      "INSERT INTO task_update_files(id,task_id,update_id,name,content_type,size,url) VALUES('child-update-image',?,'child-update','image.png','image/png',8,'https://assets.example.test/child-update-image')",
    )
    .bind(child.id)
    .run();
  objects.set("child-update-image", new Uint8Array([1]));
  assert.equal(
    (await taskApi.DELETE(req("/api/tasks", "DELETE", { id: parent.id })))
      .status,
    200,
  );
  assert.equal(
    (
      await db
        .prepare(
          "SELECT COUNT(*) AS count FROM tasks WHERE parent_id=? OR id=?",
        )
        .bind(parent.id, parent.id)
        .first()
    ).count,
    0,
  );
  assert.equal(objects.has("child-file"), false);
  assert.equal(objects.has("child-update-image"), false);
  assert.equal(
    (
      await db
        .prepare(
          "SELECT COUNT(*) AS count FROM task_updates WHERE id='child-update'",
        )
        .first()
    ).count,
    0,
  );
  // Member columns store stable registered-member IDs, not editable display names.
  await db
    .prepare(
      "UPDATE members SET user_id='unit-member',name='Unit Member' WHERE id=0",
    )
    .run();
  await db
    .prepare(
      "UPDATE auth_users SET avatar_url='https://assets.example.test/avatar.png' WHERE id='unit-member'",
    )
    .run();
  await db
    .prepare(
      "INSERT INTO auth_users(id,email,name,password_hash,role,created_at) VALUES('unit-second','second@example.test','Unit Member','unit','member',0),('unit-admin','admin@example.test','Hidden admin','unit','admin',0)",
    )
    .run();
  await db
    .prepare(
      "INSERT INTO members(id,name,user_id) VALUES(4,'Unit Member','unit-second'),(5,'Hidden admin','unit-admin')",
    )
    .run();
  response = await columns.POST(
    req("/api/columns", "POST", { name: "Reviewers", type: "member" }),
  );
  assert.equal(response.status, 201);
  const memberColumn = await response.json();
  const memberBody = {
    name: "Member task",
    custom: { [memberColumn.id]: ["0", "4"] },
  };
  response = await taskApi.POST(req("/api/tasks", "POST", memberBody));
  assert.equal(response.status, 201, await response.clone().text());
  const memberTask = await response.json();
  for (const bad of [["1"], ["5"], ["9999"], ["0", "0"], ["Unit Member"]]) {
    assert.equal(
      (
        await taskApi.POST(
          req("/api/tasks", "POST", {
            ...memberBody,
            custom: { [memberColumn.id]: bad },
          }),
        )
      ).status,
      400,
    );
  }
  const directory = await (await workspaceApi.GET()).json();
  assert.deepEqual(
    directory.members.map((m) => m.id),
    [0, 4],
  );
  assert.equal(
    directory.members[0].avatarUrl,
    "https://assets.example.test/avatar.png",
  );
  assert.equal(
    directory.members.filter((m) => m.name === "Unit Member").length,
    2,
  );
  response = await columns.POST(
    req("/api/columns", "POST", { name: "Legacy owner", type: "text" }),
  );
  const legacyMember = await response.json();
  await db
    .prepare("UPDATE tasks SET custom=json_set(custom,?,?) WHERE id=?")
    .bind("$." + JSON.stringify(legacyMember.id), "Unit Member", memberTask.id)
    .run();
  const archivedMember = await createTask("Archived member conversion");
  await db
    .prepare(
      "UPDATE tasks SET archived_at=CURRENT_TIMESTAMP,custom=json_set(custom,?,?) WHERE id=?",
    )
    .bind(
      "$." + JSON.stringify(legacyMember.id),
      "Unit Member",
      archivedMember.id,
    )
    .run();
  let memberLayout = JSON.parse(
    (await db.prepare("SELECT layout FROM board_settings WHERE id=1").first())
      .layout,
  );
  memberLayout.overrides.assignees = {
    id: "assignees",
    name: "ผู้รับผิดชอบ",
    type: "text",
  };
  assert.equal(
    (await layoutApi.PUT(req("/api/table-layout", "PUT", memberLayout))).status,
    200,
  );
  memberLayout.overrides[legacyMember.id] = {
    id: legacyMember.id,
    name: "Legacy owner",
    type: "member",
  };
  memberLayout.overrides.assignees.type = "member";
  response = await layoutApi.PUT(req("/api/table-layout", "PUT", memberLayout));
  assert.equal(response.status, 200, await response.clone().text());
  for (const id of [memberTask.id, archivedMember.id]) {
    const savedMemberData = JSON.parse(
      (await db.prepare("SELECT custom FROM tasks WHERE id=?").bind(id).first())
        .custom,
    );
    assert.deepEqual(savedMemberData[legacyMember.id], ["0", "4"]);
  }
  const memberFields = editor.editorFields(
    [memberColumn, legacyMember],
    memberLayout,
  );
  assert.equal(memberFields.find((f) => f.id === "assignees").type, "member");
  assert.equal(memberFields.find((f) => f.id === "assignees").key, undefined);
  const customMemberField = memberFields.find((f) => f.id === memberColumn.id);
  assert.deepEqual(
    editor.setEditorValue(memberTask, customMemberField, ["4"]).custom[
      memberColumn.id
    ],
    ["4"],
  );
  await db.prepare("UPDATE members SET name='Renamed member' WHERE id=4").run();
  const memberCalendar = await module("lib/calendar-display.ts");
  assert.equal(
    memberCalendar.calendarFieldValue(
      memberTask,
      memberColumn.id,
      [memberColumn],
      memberLayout,
      ["Unit Member", "", "", "", "Renamed member"],
      [],
    ),
    "Unit Member, Renamed member",
  );
  assert.deepEqual(memberTask.custom[memberColumn.id], ["0", "4"]);
  const completionParent = await createTask("Completion parent");
  const completionChild = await createTask(
    "Completion child",
    completionParent.id,
  );
  const unfinishedChild = await createTask(
    "Still working",
    completionParent.id,
  );
  response = await taskApi.PATCH(
    req("/api/tasks", "PATCH", { ...completionChild, status: 2 }),
  );
  assert.equal(response.status, 200);
  assert.equal((await response.json()).group_id, "todo");
  assert.equal(
    (
      await db
        .prepare("SELECT status,group_id FROM tasks WHERE id=?")
        .bind(completionParent.id)
        .first()
    ).group_id,
    "todo",
  );
  await db
    .prepare(
      "UPDATE board_settings SET layout=json_set(layout,'$.hiddenGroups',json('[\"done\"]')) WHERE id=1",
    )
    .run();
  response = await taskApi.PATCH(
    req("/api/tasks", "PATCH", { ...completionParent, status: 2 }),
  );
  assert.equal(response.status, 200);
  assert.equal((await response.json()).group_id, "done");
  assert.equal(
    (
      await db
        .prepare(
          "SELECT COUNT(*) AS count FROM tasks WHERE parent_id=? AND group_id='done'",
        )
        .bind(completionParent.id)
        .first()
    ).count,
    2,
  );
  assert.equal(
    (
      await db
        .prepare("SELECT status FROM tasks WHERE id=?")
        .bind(unfinishedChild.id)
        .first()
    ).status,
    -1,
  );
  assert.ok(
    !JSON.parse(
      (await db.prepare("SELECT layout FROM board_settings WHERE id=1").first())
        .layout,
    ).hiddenGroups.includes("done"),
  );
  assert.equal(
    (
      await moveApi.POST(
        req("/api/tasks/move", "POST", {
          id: completionParent.id,
          group: "todo",
        }),
      )
    ).status,
    400,
  );
  await bulk("archive", [completionParent.id]);
  await db
    .prepare("UPDATE tasks SET group_id='todo' WHERE id=?")
    .bind(completionParent.id)
    .run();
  await bulk("restore", [completionParent.id]);
  assert.equal(
    (
      await db
        .prepare("SELECT group_id FROM tasks WHERE id=?")
        .bind(completionParent.id)
        .first()
    ).group_id,
    "done",
  );
  response = await taskApi.POST(
    req("/api/tasks", "POST", {
      name: "Initially completed",
      status: 2,
      group_id: "todo",
    }),
  );
  assert.equal(response.status, 201);
  assert.equal((await response.json()).group_id, "done");
  response = await taskApi.PATCH(
    req("/api/tasks", "PATCH", { ...completionParent, status: 1 }),
  );
  assert.equal((await response.json()).group_id, "done");
  assert.equal(
    (
      await moveApi.POST(
        req("/api/tasks/move", "POST", {
          id: completionParent.id,
          group: "todo",
        }),
      )
    ).status,
    200,
  );
  const completedLayout = JSON.parse(
    (await db.prepare("SELECT layout FROM board_settings WHERE id=1").first())
      .layout,
  );
  completedLayout.overrides.status = {
    id: "status",
    name: "ความคืบหน้า",
    type: "status",
  };
  assert.equal(
    (await layoutApi.PUT(req("/api/table-layout", "PUT", completedLayout)))
      .status,
    200,
  );
  response = await taskApi.PATCH(
    req("/api/tasks", "PATCH", {
      ...completionParent,
      status: 1,
      custom: { "view:status": "เสร็จแล้ว" },
    }),
  );
  const visibleCompletion = await response.json();
  assert.equal(response.status, 200);
  assert.equal(visibleCompletion.status, 2);
  assert.equal(visibleCompletion.group_id, "done");
  console.log(
    "PASS: automatic Completed placement on creation/edit/restore, visible status overrides, existing migration backfill, hidden group visibility, and parent/subtask integrity.",
  );
  console.log(
    "PASS: registered-only Member columns, stable IDs with duplicate/renamed names, avatars, native assignees, and legacy conversion including archived tasks.",
  );
  console.log(
    "PASS: subtask create/validation, independent status, sibling moves, parent archive/restore/duplicate, filtered hierarchy, and cascading file/update cleanup.",
  );
  console.log(
    "PASS: all migrations, authenticated updates, author enforcement, R2 image metadata, image-only posts, 2MB limit, image cleanup, global label renames, group archive/restore, permanent column deletion, preserved updates, and column rename/reload with orphan layout references. No remote records were created.",
  );
} finally {
  child.stdin.end();
}
