import { boardColumns, type BoardLayout } from "./board";
import { parseDay, parseRange, rangeLabel } from "./timeline";
import {
  statuses,
  type Task,
  type CustomColumn,
  type Attachment,
} from "./types";
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
) {
  const custom = columns.find((c) => c.id === id),
    override = layout.overrides[id],
    type = override?.type || custom?.type;
  const base: Record<string, unknown> = {
    name: task.name,
    assignees: task.assignees.map((p) => people[p]).filter(Boolean),
    status: statuses[task.status] || "",
    date: task.date,
    priority: task.priority,
    project: task.project,
    hours: task.hours,
  };
  let value = custom
    ? task.custom[id]
    : override
      ? (task.custom["view:" + id] ?? base[id])
      : base[id];
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
