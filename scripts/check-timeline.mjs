import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import ts from "typescript";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
const root = path.resolve(".wrangler/timeline-tests");
for (const file of [
  "lib/timeline.ts",
  "lib/timeline-validation.ts",
  "lib/types.ts",
  "lib/board.ts",
  "lib/calendar-display.ts",
  "lib/timeline-events.ts",
  "lib/member-color.ts",
  "lib/auth-types.ts",
  "lib/option-colors.ts",
  "lib/update-images.ts",
  "lib/files.ts",
  "lib/task-updates.ts",
  "components/floating-panel.ts",
  "components/app-select.tsx",
  "components/calendar-display-menu.tsx",
  "components/report-calendar.tsx",
  "components/task-details-drawer.tsx",
  "components/task-updates.tsx",
  "components/task-panel-tabs.tsx",
  "components/update-markdown.tsx",
  "components/image-viewer.tsx",
  "components/timeline-picker.tsx",
]) {
  let source = ts.transpileModule(fs.readFileSync(file, "utf8"), {
    compilerOptions: {
      module: ts.ModuleKind.ESNext,
      target: ts.ScriptTarget.ES2022,
      jsx: ts.JsxEmit.ReactJSX,
    },
  }).outputText;
  source = source
    .replace('from "next/image"', 'from "next/image.js"')
    .replace(
      /from (["'])@\/lib\/([^"']+)\1/g,
      (_, quote, name) => `from "../lib/${name}.mjs"`,
    )
    .replace(
      /from (["'])\.\/([^"']+)\1/g,
      (_, quote, name) => `from "./${name}.mjs"`,
    );
  const target = path.join(root, file.replace(/\.tsx?$/, ".mjs"));
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.writeFileSync(target, source);
}
const t = await import(pathToFileURL(path.join(root, "lib/timeline.mjs"))),
  { validTimelines } = await import(
    pathToFileURL(path.join(root, "lib/timeline-validation.mjs"))
  );
assert.deepEqual(t.parseRange(["2026-10-30", "2026-11-03"]), [
  "2026-10-30",
  "2026-11-03",
]);
for (const value of [
  ["2026-11-03", "2026-10-30"],
  ["2026-02-30", "2026-03-01"],
  ["2026-02-29", "2026-03-01"],
  ["2026-10-30"],
  true,
  "2026-10-30",
])
  assert.equal(t.parseRange(value), null);
assert.ok(t.parseRange(["2024-02-29", "2024-02-29"]));
for (let year = 2020; year <= 2030; year++)
  for (let month = 0; month < 12; month++) {
    const grid = t.monthGrid(year, month);
    assert.equal(t.parseDay(grid[0]).getUTCDay(), 1);
    assert.equal(grid.length % 7, 0);
    for (let i = 1; i < grid.length; i++)
      assert.equal(grid[i], t.addDays(grid[i - 1], 1));
    assert.equal(
      grid.filter((d) => Number(d.slice(5, 7)) === month + 1).length,
      new Date(Date.UTC(year, month + 1, 0)).getUTCDate(),
    );
  }
const event = (id, start, end) => ({
  id,
  taskId: id,
  name: id,
  column: "Timeline",
  start,
  end,
  status: 1,
  assignees: [],
});
const week = [
  "2026-10-26",
  "2026-10-27",
  "2026-10-28",
  "2026-10-29",
  "2026-10-30",
  "2026-10-31",
  "2026-11-01",
];
const result = t.weekSegments(week, [
  event("a", "2026-10-24", "2026-11-03"),
  event("b", "2026-10-28", "2026-10-29"),
  event("c", "2026-10-30", "2026-10-31"),
]);
assert.equal(result.laneCount, 2);
assert.deepEqual(
  [
    result.segments[0].start,
    result.segments[0].span,
    result.segments[0].continuesBefore,
    result.segments[0].continuesAfter,
  ],
  [0, 7, true, true],
);
assert.equal(result.segments[1].lane, result.segments[2].lane);
const db = {
  prepare(sql) {
    return {
      async all() {
        return {
          results: [
            { id: "timeline", type: "timeline" },
            { id: "plain", type: "text" },
          ],
        };
      },
      async first() {
        return {
          layout: JSON.stringify({
            overrides: { hours: { type: "timeline" } },
          }),
        };
      },
    };
  },
};
assert.ok(
  await validTimelines(db, {
    timeline: ["2026-10-30", "2026-11-03"],
    "view:hours": ["2026-10-01", "2026-10-02"],
  }),
);
assert.ok(await validTimelines(db, { timeline: [] }));
assert.ok(
  !(await validTimelines(db, { timeline: ["2026-10-02", "2026-10-01"] })),
);
assert.ok(!(await validTimelines(db, { "view:hours": ["bad", "date"] })));
const ReportCalendar = (
    await import(
      pathToFileURL(path.join(root, "components/report-calendar.mjs"))
    )
  ).default,
  TimelinePicker = (
    await import(
      pathToFileURL(path.join(root, "components/timeline-picker.mjs"))
    )
  ).default;
const now = t.todayKey(),
  task = {
    id: "fixture",
    name: "Timeline fixture",
    assignees: [0, 9],
    status: 1,
    custom: { timeline: [now, t.addDays(now, 9)] },
  };
assert.deepEqual(t.rangeDuration(["2026-10-21", "2026-10-29"]), {
  apart: 8,
  inclusive: 9,
});
assert.deepEqual(t.rangeDuration(["2026-10-30", "2026-10-30"]), {
  apart: 0,
  inclusive: 1,
});
assert.deepEqual(t.rangeDuration(["2024-02-28", "2024-03-01"]), {
  apart: 2,
  inclusive: 3,
});
const markup = renderToStaticMarkup(
  React.createElement(ReportCalendar, {
    tasks: [task],
    columns: [{ id: "timeline", name: "Delivery", type: "timeline" }],
    layout: { overrides: {}, hidden: [], order: [] },
    people: ["Member"],
  }),
);
assert.ok(markup.indexOf("จันทร์") < markup.indexOf("อังคาร"));
assert.ok(markup.includes("Timeline fixture"));
assert.ok(!markup.includes("undefined"));
assert.ok(!markup.includes("admin"));
assert.ok(markup.includes("1 งานในเดือนนี้"));
const controlledCalendar = renderToStaticMarkup(
  React.createElement(ReportCalendar, {
    tasks: [],
    columns: [],
    layout: { overrides: {}, hidden: [], order: [] },
    people: [],
    month: { year: 2024, month: 1 },
    onMonthChange() {},
    activeColumn: "*",
    onColumnChange() {},
  }),
);
assert.ok(controlledCalendar.includes("กุมภาพันธ์ 2024"));
const picker = renderToStaticMarkup(
  React.createElement(TimelinePicker, {
    label: "Delivery fixture",
    value: [now, t.addDays(now, 2)],
    disabled: false,
    onChange() {},
  }),
);
assert.ok(picker.includes("บันทึกช่วงเวลา"));
assert.ok(!picker.includes('role="tooltip"'));
assert.ok(picker.includes(">3D</span>"));
for (const [value, count] of [
  [["2026-10-06", "2026-10-07"], 2],
  [["2026-10-06", "2026-10-06"], 1],
]) {
  const html = renderToStaticMarkup(
    React.createElement(TimelinePicker, {
      label: "Day count",
      value,
      disabled: false,
      onChange() {},
    }),
  );
  assert.ok(html.includes(`>${count}D</span>`));
}
assert.ok(!picker.includes('type="date"'));
const { calendarColumns, calendarFieldValue } = await import(
    pathToFileURL(path.join(root, "lib/calendar-display.mjs"))
  ),
  { memberColor } = await import(
    pathToFileURL(path.join(root, "lib/member-color.mjs"))
  );
const custom = [{ id: "timeline", name: "Delivery", type: "timeline" }],
  layout = {
    overrides: { name: { id: "name", name: "หัวข้องาน", type: "text" } },
    hidden: [],
    order: ["project", "name"],
    calendarFields: ["project", "name"],
  };
assert.equal(calendarColumns(custom, layout)[0].id, "project");
assert.equal(
  calendarColumns(custom, layout).find((c) => c.id === "name").name,
  "หัวข้องาน",
);
assert.equal(
  calendarFieldValue(
    { ...task, project: "Project Alpha" },
    "project",
    custom,
    layout,
    ["Member"],
    [],
  ),
  "Project Alpha",
);
assert.equal(
  calendarFieldValue(task, "assignees", custom, layout, ["Member"], []),
  "Member",
);
const configured = renderToStaticMarkup(
  React.createElement(ReportCalendar, {
    tasks: [{ ...task, project: "Project Alpha" }],
    columns: custom,
    layout,
    people: ["Member"],
  }),
);
assert.ok(
  configured
    .replace(/<!--.*?-->/g, "")
    .includes("Project Alpha | Timeline fixture"),
);
assert.ok(!configured.includes("หัวข้องาน: Timeline fixture"));
assert.ok(
  configured.indexOf("ปฏิทิน เดือนถัดไป") <
    configured.indexOf("ตั้งค่าข้อมูลหลักและรองบนปฏิทิน"),
);
assert.equal(new Set([0, 1, 2, 3].map(memberColor)).size, 4);
const Drawer = (
  await import(
    pathToFileURL(path.join(root, "components/task-details-drawer.mjs"))
  )
).default;
const drawerHtml = renderToStaticMarkup(
  React.createElement(Drawer, {
    task: { ...task, project: "Design", hours: 0 },
    columns: custom,
    layout: { ...layout, hidden: ["priority"] },
    people: ["Member"],
    attachments: [],
    onClose() {},
  }),
);
assert.ok(drawerHtml.includes("<dialog"));
assert.ok(drawerHtml.includes("task-details-drawer"));
assert.ok(drawerHtml.includes("Member"));
assert.ok(!drawerHtml.includes("ความสำคัญ"));
assert.ok(
  drawerHtml.indexOf('data-field-id="project"') <
    drawerHtml.indexOf('data-field-id="assignees"'),
);
assert.match(drawerHtml, /data-field-id="hours"[\s\S]*?<dd>0<\/dd>/);
assert.ok(!drawerHtml.includes('data-field-id="name"'));
assert.ok(drawerHtml.includes("Delivery"));
assert.ok(!drawerHtml.includes("admin"));
const { taskInCalendarMonth } = await import(
  pathToFileURL(path.join(root, "lib/timeline-events.mjs"))
);
const spanning = {
  ...task,
  custom: { timeline: ["2026-10-30", "2026-11-03"] },
};
assert.ok(
  taskInCalendarMonth(spanning, custom, layout, { year: 2026, month: 9 }),
);
assert.ok(
  taskInCalendarMonth(spanning, custom, layout, { year: 2026, month: 10 }),
);
assert.ok(
  !taskInCalendarMonth(spanning, custom, layout, { year: 2026, month: 11 }),
);
assert.ok(
  !taskInCalendarMonth(
    spanning,
    custom,
    layout,
    { year: 2026, month: 10 },
    "other",
  ),
);
console.log(
  "PASS: Monday-first months 2020–2030, leap years, invalid/reversed ranges, multi-week/month clipping, overlapping event lanes, Timeline validation including overrides, calendar/picker rendering, hidden assignees.",
);
