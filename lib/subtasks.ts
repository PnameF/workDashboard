import type { Task } from "./types";
export function isSubtaskExpanded(
  parent: string,
  matches: Task[],
  collapsed: Record<string, boolean>,
) {
  if (collapsed[parent] !== undefined) return !collapsed[parent];
  return (
    !matches.some((t) => t.id === parent) &&
    matches.some((t) => t.parent_id === parent)
  );
}
export function subtaskRows(
  all: Task[],
  matches: Task[],
  collapsed: Record<string, boolean>,
): Task[] {
  const ids = new Set(matches.map((t) => t.id));
  const roots = new Set(matches.map((t) => t.parent_id || t.id));
  const rows: Task[] = [];
  for (const root of all.filter((t) => roots.has(t.id) && !t.parent_id)) {
    rows.push(root);
    const children = all.filter(
      (t) => t.parent_id === root.id && ids.has(t.id),
    );
    if (isSubtaskExpanded(root.id, matches, collapsed)) rows.push(...children);
  }
  return rows;
}
export const taskTreeSql =
  "WITH RECURSIVE tree(id) AS (SELECT value FROM json_each(?) UNION SELECT t.id FROM tasks t JOIN tree p ON t.parent_id=p.id)";
