import type { Database } from "./database";
import { defaultLayout, type BoardLayout } from "./board";
import type { CustomColumn, Task } from "./types";
import type { TaskSchema } from "./task-schema";

export function memberIds(value: unknown, people?: string[]): string[] {
  return Array.isArray(value)
    ? [
        ...new Set(
          value.filter(
            (id): id is string =>
              typeof id === "string" &&
              /^(0|[1-9]\d*)$/.test(id) &&
              Number.isSafeInteger(Number(id)) &&
              (!people || !!people[Number(id)]),
          ),
        ),
      ]
    : [];
}

export async function validMemberColumns(
  db: Database,
  task: Task,
  schema?: TaskSchema,
) {
  if (schema)
    return validateMemberValues(
      task,
      schema.layout,
      schema.columns,
      schema.registeredMembers,
    );
  const settings = await db
    .prepare("SELECT layout FROM board_settings WHERE id=1")
    .first<{ layout: string }>();
  const layout: BoardLayout = settings
    ? JSON.parse(settings.layout)
    : defaultLayout;
  const { results: columns } = await db
    .prepare("SELECT id,type FROM custom_columns")
    .all<Pick<CustomColumn, "id" | "type">>();
  const members = (
    await db
      .prepare(
        "SELECT m.id FROM members m JOIN auth_users u ON u.id=m.user_id WHERE u.role<>'admin'",
      )
      .all<{ id: number }>()
  ).results;
  return validateMemberValues(
    task,
    layout,
    columns,
    new Set(members.map((m) => String(m.id))),
  );
}
function validateMemberValues(
  task: Task,
  layout: BoardLayout,
  columns: Pick<CustomColumn, "id" | "type">[],
  allowed: Set<string>,
) {
  const ids = [
    ...new Set([...columns.map((c) => c.id), ...Object.keys(layout.overrides)]),
  ];
  const keys = ids
    .filter(
      (id) =>
        !layout.deletedColumns?.includes(id) &&
        (layout.overrides[id]?.type ||
          columns.find((c) => c.id === id)?.type) === "member" &&
        id !== "assignees",
    )
    .map((id) => (columns.some((c) => c.id === id) ? id : "view:" + id));
  if (!keys.length) return true;
  for (const key of keys) {
    const raw = task.custom[key];
    if (raw === undefined) continue;
    if (raw === "") {
      task.custom[key] = [];
      continue;
    }
    const values = memberIds(raw);
    if (
      !Array.isArray(raw) ||
      raw.length > 50 ||
      values.length !== raw.length ||
      values.some((id) => !allowed.has(id))
    )
      return false;
  }
  return true;
}

export function convertMemberColumn(db: Database, id: string, custom: boolean) {
  const key = "$." + JSON.stringify(custom ? id : "view:" + id);
  if (id === "assignees" && !custom)
    return db
      .prepare("UPDATE tasks SET custom=json_remove(custom,?)")
      .bind(key);
  return db
    .prepare(
      "UPDATE tasks SET custom=json_set(custom,?,json((SELECT json_group_array(CAST(id AS TEXT)) FROM (SELECT DISTINCT m.id FROM json_each(tasks.custom,?) j JOIN members m ON CAST(m.id AS TEXT)=CAST(j.value AS TEXT) OR m.name=CAST(j.value AS TEXT) JOIN auth_users u ON u.id=m.user_id WHERE u.role<>'admin' AND j.type IN('text','integer') ORDER BY m.id LIMIT 50))))",
    )
    .bind(key, key);
}
