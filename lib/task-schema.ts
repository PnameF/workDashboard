import type { Database } from "./database";
import type { BoardLayout } from "./board";
import type { ColumnType, Task } from "./types";
export type TaskSchema = {
  layout: BoardLayout;
  columns: { id: string; type: ColumnType }[];
  members: Set<number>;
  registeredMembers: Set<string>;
  groups: Set<string>;
  parent: Pick<Task, "id" | "parent_id" | "group_id" | "status"> | null;
};
// One fresh, consistent snapshot per save; never cache schemas across requests.
export async function loadTaskSchema(
  db: Database,
  parentId: string | null = null,
): Promise<TaskSchema> {
  const row = await db
    .prepare(
      `SELECT
    (SELECT layout FROM board_settings WHERE id=1) AS layout,
    (SELECT json_group_array(json_object('id',id,'type',type)) FROM custom_columns) AS columns,
    (SELECT json_group_array(id) FROM members) AS members,
    (SELECT json_group_array(m.id) FROM members m JOIN auth_users u ON u.id=m.user_id WHERE u.role<>'admin') AS registered_members,
    (SELECT json_group_array(id) FROM task_groups) AS groups,
    (SELECT json_object('id',id,'parent_id',parent_id,'group_id',group_id,'status',status) FROM tasks WHERE id=? AND archived_at IS NULL) AS parent
  `,
    )
    .bind(parentId)
    .first<{
      layout: string | null;
      columns: string;
      members: string;
      registered_members: string;
      groups: string;
      parent: string | null;
    }>();
  if (!row) throw new Error("Cannot read task schema");
  return {
    layout: JSON.parse(row.layout || '{"order":[],"hidden":[],"overrides":{}}'),
    columns: JSON.parse(row.columns),
    members: new Set(JSON.parse(row.members)),
    registeredMembers: new Set(
      (JSON.parse(row.registered_members) as number[]).map(String),
    ),
    groups: new Set(JSON.parse(row.groups)),
    parent: row.parent ? JSON.parse(row.parent) : null,
  };
}
