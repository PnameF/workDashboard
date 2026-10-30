import assert from "node:assert/strict";
import { build } from "esbuild";
const result = await build({
  entryPoints: ["lib/advanced-filters.ts"],
  bundle: true,
  write: false,
  platform: "node",
  format: "esm",
});
const f = await import(
  `data:text/javascript;base64,${Buffer.from(result.outputFiles[0].text).toString("base64")}`
);
const context = {
  columns: [
    { id: "timeline", name: "Timeline", type: "timeline" },
    {
      id: "tags",
      name: "Tags",
      type: "multiselect",
      options: ["API", "Design"],
    },
    { id: "check", name: "Check", type: "checkbox" },
  ],
  layout: { order: [], hidden: [], overrides: {} },
  people: ["Member A", "Member B"],
  attachments: [
    { id: "file", task_id: "a", column_id: "images", name: "Design.pdf" },
  ],
};
const tasks = [
  {
    id: "a",
    name: "Build API",
    assignees: [0, 9],
    status: 2,
    date: "2026-10-30",
    priority: "สูง",
    project: "Design",
    hours: 0,
    custom: {
      timeline: ["2026-10-30", "2026-11-03"],
      tags: ["API", "Design"],
      check: false,
    },
  },
  {
    id: "b",
    name: "Design review",
    assignees: [1],
    status: 1,
    date: "2026-11-01",
    priority: "ต่ำ",
    project: "Development",
    hours: 8,
    custom: {},
  },
];
const fields = f.filterFields(tasks, context),
  rule = (column, operator, value = "", to = "") => ({
    id: "r",
    column,
    operator,
    value,
    to,
  }),
  match = (task, r) =>
    f.matchesRule(
      task,
      r,
      fields.find((c) => c.id === r.column),
      context,
    );
assert.ok(match(tasks[0], rule("hours", "eq", "0")));
assert.ok(!match(tasks[0], rule("hours", "empty")));
assert.ok(match(tasks[0], rule("check", "eq", "false")));
assert.ok(!match(tasks[0], rule("check", "empty")));
assert.ok(match(tasks[0], rule("tags", "eq", "API")));
assert.ok(match(tasks[0], rule("name", "contains", "api")));
assert.ok(match(tasks[0], rule("images", "contains", "design.pdf")));
assert.ok(match(tasks[1], rule("images", "empty")));
assert.ok(
  match(tasks[0], rule("timeline", "overlaps", "2026-11-03", "2026-11-03")),
);
assert.ok(
  !match(tasks[0], rule("timeline", "overlaps", "2026-11-04", "2026-11-05")),
);
assert.ok(match(tasks[0], rule("timeline", "on", "2026-11-01")));
assert.ok(match(tasks[0], rule("date", "between", "2026-10-30", "2026-10-30")));
assert.ok(match(tasks[1], rule("hours", "between", "0", "8")));
assert.ok(!f.completeRule(rule("hours", "between", "8", "0"), fields));
assert.ok(!f.completeRule(rule("date", "eq", "2026-02-30"), fields));
assert.ok(
  !f.completeRule(
    rule("timeline", "overlaps", "2026-11-03", "2026-10-30"),
    fields,
  ),
);
assert.deepEqual(
  fields.find((c) => c.id === "assignees").options.map((o) => o.value),
  ["0", "1"],
);
assert.deepEqual(
  f.filterRaw(
    tasks[0],
    fields.find((c) => c.id === "assignees"),
    context,
  ),
  ["0"],
);
const g1 = {
    id: "g1",
    match: "all",
    rules: [rule("status", "eq", "เสร็จแล้ว"), rule("project", "eq", "Design")],
  },
  g2 = {
    id: "g2",
    match: "any",
    rules: [rule("hours", "gt", "5"), rule("name", "contains", "nonexistent")],
  };
assert.deepEqual(
  tasks
    .filter((t) =>
      f.matchesAdvanced(t, { match: "any", groups: [g1, g2] }, fields, context),
    )
    .map((t) => t.id),
  ["a", "b"],
);
assert.ok(
  !tasks.some((t) =>
    f.matchesAdvanced(t, { match: "all", groups: [g1, g2] }, fields, context),
  ),
);
assert.ok(
  tasks.every((t) => f.matchesAdvanced(t, f.emptyFilters, fields, context)),
);
const overridden = {
    ...context,
    layout: {
      ...context.layout,
      overrides: { project: { id: "project", name: "Score", type: "number" } },
    },
  },
  scored = { ...tasks[0], custom: { "view:project": "12" } };
const score = f
  .filterFields([scored], overridden)
  .find((c) => c.id === "project");
assert.equal(score.type, "number");
assert.ok(
  f.matchesRule(scored, rule("project", "gte", "10"), score, overridden),
);
const quickBuild = await build({
    entryPoints: ["lib/quick-filters.ts"],
    bundle: true,
    write: false,
    platform: "node",
    format: "esm",
  }),
  q = await import(
    `data:text/javascript;base64,${Buffer.from(quickBuild.outputFiles[0].text).toString("base64")}`
  );
const timeline = fields.find((c) => c.id === "timeline"),
  presets = q.quickOptions(timeline, tasks, context, "2026-10-30"),
  week = presets.find((o) => o.label === "สัปดาห์นี้");
assert.equal(week.value, "2026-10-26");
assert.equal(week.to, "2026-11-01");
assert.equal(week.operator, "overlaps");
assert.equal(
  q.quickOptions(
    fields.find((c) => c.id === "assignees"),
    tasks,
    context,
    "2026-10-30",
    0,
  )[0].label,
  "ฉัน (Member A)",
);
const quick = {
  match: "all",
  groups: [
    {
      id: "quick:project",
      match: "any",
      rules: [
        rule("project", "eq", "Design"),
        rule("project", "eq", "Development"),
      ],
    },
  ],
};
assert.ok(
  f.matchesTaskFilters(
    tasks[0],
    { advanced: { match: "all", groups: [g1] }, quick },
    fields,
    context,
  ),
);
assert.ok(
  !f.matchesTaskFilters(
    tasks[1],
    { advanced: { match: "all", groups: [g1] }, quick },
    fields,
    context,
  ),
);
assert.equal(
  q.quickOptions(
    fields.find((c) => c.id === "hours"),
    tasks,
    context,
  )[0].value,
  "0",
);
const memberContext = {
  ...context,
  columns: [
    ...context.columns,
    { id: "reviewers", name: "Reviewers", type: "member" },
  ],
};
const memberTask = {
  ...tasks[0],
  custom: { ...tasks[0].custom, reviewers: ["1", "9"] },
};
const memberField = f
  .filterFields([memberTask], memberContext)
  .find((field) => field.id === "reviewers");
assert.deepEqual(
  memberField.options.map((option) => option.value),
  ["0", "1"],
);
assert.deepEqual(f.filterRaw(memberTask, memberField, memberContext), ["1"]);
assert.ok(
  f.matchesRule(
    memberTask,
    rule("reviewers", "eq", "1"),
    memberField,
    memberContext,
  ),
);
assert.ok(
  !f.matchesRule(
    memberTask,
    rule("reviewers", "eq", "9"),
    memberField,
    memberContext,
  ),
);
assert.ok(
  q
    .quickOptions(memberField, [memberTask], memberContext, "2026-10-30", 1)
    .some((option) => option.label === "ฉัน (Member B)"),
);
console.log(
  "PASS: AND/OR groups, zero/false values, numeric/date boundaries, Timeline overlap, file names, multi-select, hidden admin, validation, and column overrides.",
);
