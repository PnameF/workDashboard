import { boardColumns, type BoardLayout } from "./board";
import {
  statuses,
  type ColumnType,
  type CustomColumn,
  type Task,
} from "./types";
export type EditorField = {
  id: string;
  name: string;
  type: ColumnType | "people";
  key?: string;
  options?: string[];
};
const types: Record<string, EditorField["type"]> = {
  name: "text",
  assignees: "member",
  status: "status",
  date: "date",
  priority: "select",
  project: "select",
  hours: "number",
  images: "files",
};
export function editorFields(
  columns: CustomColumn[],
  layout: BoardLayout,
): EditorField[] {
  const all = boardColumns(columns, layout),
    ids = [...new Set([...layout.order, ...all.map((c) => c.id)])];
  return ids
    .filter((id) => !layout.hidden.includes(id))
    .flatMap((id) => {
      const c = all.find((c) => c.id === id);
      if (!c) return [];
      const custom = columns.find((c) => c.id === id),
        override = layout.overrides[id];
      return [
        {
          id,
          name: override?.name || c.name,
          type: override?.type || custom?.type || types[id] || "text",
          key: custom
            ? id
            : id === "assignees" && (!override || override.type === "member")
              ? undefined
              : override
                ? "view:" + id
                : undefined,
          options: override?.options || custom?.options,
        },
      ];
    });
}
export function editorValue(
  task: Task,
  field: EditorField,
  people: string[],
): string | boolean | string[] {
  if (field.key && task.custom[field.key] !== undefined)
    return task.custom[field.key];
  switch (field.id) {
    case "name":
      return task.name;
    case "assignees":
      return field.type === "people" || field.type === "member"
        ? task.assignees.map(String)
        : task.assignees.map((id) => people[id]).filter(Boolean);
    case "status":
      return statuses[task.status] || "";
    case "date":
      return task.date;
    case "priority":
      return task.priority;
    case "project":
      return task.project;
    case "hours":
      return task.hours === null ? "" : String(task.hours);
    default:
      return "";
  }
}
export function setEditorValue(
  task: Task,
  field: EditorField,
  value: string | boolean | string[],
): Task {
  if (field.key)
    return { ...task, custom: { ...task.custom, [field.key]: value } };
  switch (field.id) {
    case "assignees": {
      const assignees = Array.isArray(value) ? value.map(Number) : [];
      return { ...task, assignees, person: assignees[0] ?? -1 };
    }
    case "status":
      return { ...task, status: statuses.indexOf(String(value)) };
    case "hours":
      return { ...task, hours: value === "" ? null : Number(value) };
    case "name":
    case "date":
    case "priority":
    case "project":
      return { ...task, [field.id]: String(value) };
    default:
      return task;
  }
}
