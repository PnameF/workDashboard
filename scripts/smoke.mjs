import assert from "node:assert/strict";
import { installTestSession } from "./test-session.mjs";
const testUser = await installTestSession();
const origin = "http://localhost:3000";
async function call(path, method = "GET", body) {
  const res = await fetch(origin + path, {
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
  const data = await res.json();
  assert.ok(res.ok, JSON.stringify(data));
  return data;
}
const before = await call("/api/workspace");
let task;
const columns = [];
const extraTasks = [];
let customGroup;
try {
  task = await call("/api/tasks", "POST", {
    name: "Smoke test — temporary",
    person: 0,
    assignees: [0, 1],
    status: 0,
    date: "2026-10-30",
    priority: "ต่ำ",
    project: "QA",
    hours: 1.5,
    custom: {},
  });
  for (const name of ["QA move A", "QA move B"])
    extraTasks.push(
      await call("/api/tasks", "POST", { ...task, name, status: 0 }),
    );
  const [a, b] = extraTasks;
  await call("/api/tasks/move", "POST", {
    id: b.id,
    group: "todo",
    anchorId: a.id,
  });
  let moved = await call("/api/workspace");
  assert.deepEqual(
    moved.tasks.filter((t) => [a.id, b.id].includes(t.id)).map((t) => t.id),
    [b.id, a.id],
  );
  await call("/api/tasks/move", "POST", {
    id: b.id,
    group: "todo",
    anchorId: a.id,
    after: true,
  });
  moved = await call("/api/workspace");
  assert.deepEqual(
    moved.tasks.filter((t) => [a.id, b.id].includes(t.id)).map((t) => t.id),
    [a.id, b.id],
  );
  await call("/api/tasks/move", "POST", { id: b.id, group: "done" });
  assert.equal(
    (await call("/api/workspace")).tasks.find((t) => t.id === b.id).status,
    0,
  );
  await call("/api/tasks/move", "POST", {
    id: b.id,
    group: "todo",
    anchorId: a.id,
  });
  assert.equal(
    (await call("/api/workspace")).tasks.find((t) => t.id === b.id).status,
    0,
  );
  customGroup = await call("/api/groups", "POST", {
    name: "QA custom group",
    color: "#847a9d",
  });
  await call("/api/tasks/move", "POST", { id: b.id, group: customGroup.id });
  assert.equal(
    (await call("/api/workspace")).tasks.find((t) => t.id === b.id).group_id,
    customGroup.id,
  );
  const direct = await call("/api/tasks", "POST", {
    ...a,
    name: "QA direct group task",
    group_id: customGroup.id,
  });
  extraTasks.push(direct);
  assert.equal(
    (await call("/api/workspace")).tasks.find((t) => t.id === direct.id)
      .group_id,
    customGroup.id,
  );
  const blank = await call("/api/tasks", "POST", {
    name: "QA empty new task",
    group_id: "todo",
    created_by: 0,
  });
  extraTasks.push(blank);
  let blankSaved = (await call("/api/workspace")).tasks.find(
    (t) => t.id === blank.id,
  );
  assert.deepEqual(
    {
      assignees: blankSaved.assignees,
      status: blankSaved.status,
      date: blankSaved.date,
      priority: blankSaved.priority,
      project: blankSaved.project,
      hours: blankSaved.hours,
    },
    {
      assignees: [],
      status: -1,
      date: "",
      priority: "",
      project: "",
      hours: null,
    },
  );
  await call("/api/tasks", "PATCH", {
    ...blankSaved,
    name: "QA empty new task edited",
  });
  blankSaved = (await call("/api/workspace")).tasks.find(
    (t) => t.id === blank.id,
  );
  assert.equal(blankSaved.status, -1);
  assert.equal(blankSaved.hours, null);
  assert.equal(blankSaved.created_by, testUser.memberId);
  assert.deepEqual(blankSaved.assignees, []);
  for (const type of [
    "text",
    "number",
    "status",
    "date",
    "checkbox",
    "url",
    "email",
    "multiselect",
    "select",
    "files",
  ])
    columns.push(
      await call("/api/columns", "POST", {
        name: "QA " + type,
        type,
        options:
          type === "multiselect" || type === "select"
            ? ["Design", "Development", "Marketing"]
            : [],
      }),
    );
  const values = [
    "บันทึกข้อมูล",
    "123.5",
    "เสร็จแล้ว",
    "2026-11-01",
    true,
    "https://example.com",
    "qa@example.com",
    ["Design", "Development"],
    "Design",
    "",
  ];
  task = await call("/api/tasks", "PATCH", {
    ...task,
    status: 2,
    assignees: [0, 1, 2],
    custom: Object.fromEntries(columns.map((c, i) => [c.id, values[i]])),
  });
  const png = Buffer.from(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII=",
    "base64",
  );
  const form = new FormData();
  form.set("taskId", task.id);
  form.set("file", new Blob([png], { type: "image/png" }), "test.png");
  const image = await call("/api/images", "POST", form);
  assert.ok(image.url);
  if (process.env.CLOUDFLARE_STORAGE_MODE === "remote") {
    assert.ok(image.url.startsWith("https://"));
    const publicImage = await fetch(image.url);
    assert.equal(publicImage.status, 200);
    assert.deepEqual(Buffer.from(await publicImage.arrayBuffer()), png);
  }
  const fileColumn = columns.find((c) => c.type === "files");
  const fileForm = new FormData();
  fileForm.set("taskId", task.id);
  fileForm.set("columnId", fileColumn.id);
  fileForm.set(
    "file",
    new Blob([png], { type: "image/png" }),
    "files-column-test.png",
  );
  const columnImage = await call("/api/files", "POST", fileForm);
  assert.equal(columnImage.column_id, fileColumn.id);
  assert.ok(columnImage.url);
  await call(`/api/files/${columnImage.id}`, "DELETE");
  assert.equal(
    (await fetch(origin + `/api/files/${columnImage.id}`)).status,
    404,
  );
  const tooLarge = new FormData();
  tooLarge.set("taskId", task.id);
  tooLarge.set(
    "file",
    new Blob([new Uint8Array(2 * 1024 * 1024 + 1)], { type: "image/png" }),
    "too-large.png",
  );
  assert.equal(
    (await fetch(origin + "/api/files", { method: "POST", body: tooLarge }))
      .status,
    400,
  );
  if (process.env.CLOUDFLARE_STORAGE_MODE === "remote") {
    const account = process.env.CLOUDFLARE_ACCOUNT_ID,
      token = process.env.CLOUDFLARE_API_TOKEN,
      database = process.env.CLOUDFLARE_D1_DATABASE_ID,
      bucket = process.env.R2_BUCKET_NAME;
    const headers = {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    };
    const query = await fetch(
      `https://api.cloudflare.com/client/v4/accounts/${account}/d1/database/${database}/query`,
      {
        method: "POST",
        headers,
        body: JSON.stringify({
          sql: "SELECT id FROM tasks WHERE id=?",
          params: [task.id],
        }),
      },
    );
    const queried = await query.json();
    assert.ok(queried.success);
    assert.equal(queried.result[0].results[0].id, task.id);
    const verify = await (
      await fetch(
        `https://api.cloudflare.com/client/v4/accounts/${account}/tokens/verify`,
        { headers },
      )
    ).json();
    assert.ok(verify.success);
    const { AwsClient } = await import("aws4fetch");
    const { createHash } = await import("node:crypto");
    const aws = new AwsClient({
      accessKeyId: verify.result.id,
      secretAccessKey: createHash("sha256").update(token).digest("hex"),
      service: "s3",
      region: "auto",
    });
    const remoteImage = await aws.fetch(
      `https://${account}.r2.cloudflarestorage.com/${bucket}/${image.id}`,
    );
    assert.equal(remoteImage.status, 200);
    assert.deepEqual(Buffer.from(await remoteImage.arrayBuffer()), png);
    console.log(
      "PASS: app-created task independently verified on remote D1; app-uploaded image independently verified on remote R2.",
    );
  }
  const imageResponse = await fetch(origin + "/api/images/" + image.id);
  assert.equal(imageResponse.status, 200);
  assert.equal(imageResponse.headers.get("Content-Type"), "image/png");
  assert.deepEqual(Buffer.from(await imageResponse.arrayBuffer()), png);
  const invalid = new FormData();
  invalid.set("taskId", task.id);
  invalid.set(
    "file",
    new Blob(["not a png"], { type: "image/png" }),
    "fake.png",
  );
  assert.equal(
    (await fetch(origin + "/api/images", { method: "POST", body: invalid }))
      .status,
    400,
  );
  const persisted = await call("/api/workspace");
  const found = persisted.tasks.find((t) => t.id === task.id);
  assert.equal(found.status, 2);
  assert.equal(
    found.group_id,
    "todo",
    "Changing status must not move the task automatically",
  );
  assert.deepEqual(found.assignees, [0, 1, 2]);
  assert.deepEqual(found.custom, task.custom);
  assert.ok(persisted.attachments.some((a) => a.id === image.id));
  const invalidOwners = await fetch(origin + "/api/tasks", {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ ...task, assignees: [99] }),
  });
  assert.equal(invalidOwners.status, 400);
  const originalLayout = before.layout || {
    order: [],
    hidden: [],
    overrides: {},
  };
  try {
    const layout = {
      numberSummaries: {
        hours: { unit: "ชิ้น", position: "right", calculation: "sum" },
      },
      groupOrder: ["done", customGroup.id, "todo"],
      widths: { name: 360, assignees: 210 },
      groupNames: {
        todo: "งานที่ต้องทำ",
        done: "งานเสร็จแล้ว",
        [customGroup.id]: "QA renamed group",
      },
      groupColors: {
        todo: "#826bc2",
        done: "#c78d63",
        [customGroup.id]: "#dba756",
      },
      order: ["hours", "name", "assignees"],
      hidden: ["project"],
      overrides: {
        hours: {
          id: "hours",
          name: "ระยะเวลาทำงาน",
          type: "text",
          options: [],
        },
      },
    };
    await call("/api/table-layout", "PUT", layout);
    assert.deepEqual((await call("/api/workspace")).layout, layout);
  } finally {
    await call("/api/table-layout", "PUT", originalLayout);
  }
  for (const path of ["/", "/my-work", "/tasks", "/reports"]) {
    const page = await fetch(origin + path);
    assert.equal(page.status, 200);
    const html = await page.text();
    assert.equal(
      html.includes("<h2>ผลงานของแต่ละคน</h2>"),
      path === "/reports",
    );
    assert.ok(!html.includes('title="สร้างโปรเจกต์"'));
  }
  await call("/api/tasks", "DELETE", { id: task.id });
  task = null;
  assert.equal((await fetch(origin + "/api/images/" + image.id)).status, 404);
  console.log(
    "PASS: blank task fields, multiple assignees, manual group moves, 10 column types, units/calculations, Files links and 2 MB limit, report isolation, and D1/R2 persistence.",
  );
} finally {
  if (task) await call("/api/tasks", "DELETE", { id: task.id });
  for (const t of extraTasks) await call("/api/tasks", "DELETE", { id: t.id });
  if (customGroup) await call("/api/groups", "DELETE", { id: customGroup.id });
  for (const col of columns)
    await call("/api/columns", "DELETE", { id: col.id });
}
const after = await call("/api/workspace");
assert.equal(after.tasks.length, before.tasks.length);
assert.equal(after.columns.length, before.columns.length);
assert.equal(after.attachments.length, before.attachments.length);
console.log("PASS: temporary test data removed.");
