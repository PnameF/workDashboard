import { boardColumns, taskGroupInfo, type BoardLayout } from "./board";
import { parseDay, parseRange, rangeLabel } from "./timeline";
import { memberIds } from "./member-columns";
import { statusLabel, statusValue } from "./status-options";
import {
  type Task,
  type CustomColumn,
  type Attachment,
  type WorkGroup,
} from "./types";
export const calendarContextFields = [
  { id: "meta:group", name: "ชื่อกลุ่ม" },
  { id: "meta:parent", name: "ชื่องานแม่" },
];
export function isCalendarContextField(id: string) {
  return calendarContextFields.some((field) => field.id === id);
}
export function calendarDisplayOptions(
  columns: CustomColumn[],
  layout: BoardLayout,
) {
  return [...calendarContextFields, ...calendarColumns(columns, layout)];
}
export function calendarColumns(columns: CustomColumn[], layout: BoardLayout) {
  const all = boardColumns(columns, layout),
    ids = [...new Set([...layout.order, ...all.map((c) => c.id)])];
  return ids.flatMap((id) => {
    const field = all.find((c) => c.id === id);
    return field
      ? [{ id, name: layout.overrides[id]?.name || field.name }]
      : [];
  });
}
export function calendarFieldValue(
  task: Task,
  id: string,
  columns: CustomColumn[],
  layout: BoardLayout,
  people: string[],
  attachments: Attachment[],
  context: { groups?: WorkGroup[]; tasks?: Task[] } = {},
) {
  if (id === "meta:group")
    return taskGroupInfo(task, context.groups || [], layout).name;
  if (id === "meta:parent")
    return task.parent_id
      ? context.tasks?.find((parent) => parent.id === task.parent_id)?.name ||
          ""
      : context.tasks?.some((child) => child.parent_id === task.id)
        ? task.name
        : "";
  const custom = columns.find((c) => c.id === id),
    override = layout.overrides[id],
    type = override?.type || custom?.type;
  const base: Record<string, unknown> = {
    name: task.name,
    assignees: task.assignees.map((p) => people[p]).filter(Boolean),
    status: statusValue(task),
    date: task.date,
    priority: task.priority,
    project: task.project,
    hours: task.hours,
  };
  let value =
    id === "assignees" && (!override || type === "member")
      ? base.assignees
      : custom
        ? task.custom[id]
        : override
          ? (task.custom["view:" + id] ?? base[id])
          : base[id];
  if (type === "member" && id !== "assignees")
    return memberIds(value, people)
      .map((id) => people[Number(id)])
      .join(", ");
  if ((id === "images" && !override) || type === "files") {
    const count = attachments.filter(
      (f) => f.task_id === task.id && (f.column_id || "images") === id,
    ).length;
    return count ? `${count} ไฟล์` : "";
  }
  if (type === "timeline") {
    const range = parseRange(value);
    return range ? rangeLabel(range) : "";
  }
  if (
    (type === "date" || (id === "date" && !override)) &&
    typeof value === "string" &&
    parseDay(value)
  )
    return value.split("-").reverse().join("/");
  if (typeof value === "boolean") return value ? "เลือกแล้ว" : "ยังไม่เลือก";
  if (value === null || value === undefined) return "";
  if (type === "status" || (id === "status" && !override))
    return statusLabel(layout, id, String(value));
  if (Array.isArray(value))
    return value.filter((v) => typeof v === "string" && v.trim()).join(", ");
  if (type === "number" || (id === "hours" && !override)) {
    const config = layout.numberSummaries?.[id];
    if (config?.unit && value !== "")
      value =
        config.position === "left"
          ? `${config.unit} ${value}`
          : `${value} ${config.unit}`;
  }
  return String(value);
}
