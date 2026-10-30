import type { ColumnType, CustomColumn, Task, WorkGroup } from "./types";
export const columnTypes: Record<ColumnType, string> = {
  member: "สมาชิก",
  text: "ข้อความ",
  number: "ตัวเลข",
  status: "สถานะ",
  date: "วันที่",
  checkbox: "เช็กบ็อกซ์",
  url: "ลิงก์",
  email: "อีเมล",
  multiselect: "หลายตัวเลือก",
  select: "เลือกหนึ่งตัวเลือก",
  files: "ไฟล์แนบ",
  timeline: "ช่วงเวลา",
};
export const baseColumns = [
  { id: "name", name: "ชื่องาน" },
  { id: "assignees", name: "ผู้รับผิดชอบ" },
  { id: "status", name: "สถานะ" },
  { id: "date", name: "กำหนดส่ง" },
  { id: "priority", name: "ความสำคัญ" },
  { id: "project", name: "โปรเจกต์" },
  { id: "hours", name: "ชั่วโมง" },
  { id: "images", name: "ไฟล์" },
];
export type BoardLayout = {
  deletedColumns?: string[];
  optionColors?: Record<string, Record<string, string>>;
  projectOptions?: string[];
  hiddenGroups?: string[];
  archivedGroups?: string[];
  calendarFields?: string[];
  numberSummaries?: Record<
    string,
    import("./column-summary").NumberSummaryConfig
  >;
  groupOrder?: string[];
  groupNames?: Record<string, string>;
  groupColors?: Record<string, string>;
  widths?: Record<string, number>;
  order: string[];
  hidden: string[];
  overrides: Record<string, CustomColumn>;
};
export const defaultLayout: BoardLayout = {
  order: [],
  hidden: [],
  overrides: {},
};
export function boardColumns(columns: CustomColumn[], layout: BoardLayout) {
  return [...baseColumns, ...columns].filter(
    (c) => !layout.deletedColumns?.includes(c.id),
  );
}
export function taskGroupInfo(
  task: Pick<Task, "group_id" | "status">,
  groups: WorkGroup[],
  layout: BoardLayout,
) {
  const id = task.group_id || (task.status === 2 ? "done" : "todo"),
    group = [
      { id: "todo", name: "To-Do", color: "#7197d0" },
      { id: "done", name: "Completed", color: "#64aa91" },
      ...groups,
    ].find((g) => g.id === id);
  return {
    name: layout.groupNames?.[id] || group?.name || "กลุ่มงาน",
    color: layout.groupColors?.[id] || group?.color || "#7197d0",
  };
}
export function reorderColumn(
  order: readonly string[],
  source: string,
  target: string,
  after = false,
) {
  if (source === target || !order.includes(source) || !order.includes(target))
    return [...order];
  const next = order.filter((id) => id !== source);
  next.splice(next.indexOf(target) + (after ? 1 : 0), 0, source);
  return next;
}
