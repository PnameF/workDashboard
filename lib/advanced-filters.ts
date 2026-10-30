import { boardColumns, type BoardLayout } from "./board";
import {
  statuses,
  type Task,
  type CustomColumn,
  type Attachment,
} from "./types";
import { parseDay, parseRange } from "./timeline";
import { memberIds } from "./member-columns";
export type FilterRule = {
  id: string;
  column: string;
  operator: string;
  value: string;
  to: string;
};
export type FilterGroup = {
  id: string;
  match: "all" | "any";
  rules: FilterRule[];
};
export type AdvancedFilter = { match: "all" | "any"; groups: FilterGroup[] };
export type FilterField = {
  id: string;
  name: string;
  type: string;
  options: { value: string; label: string }[];
};
export type FilterContext = {
  columns: CustomColumn[];
  layout: BoardLayout;
  people: string[];
  attachments: Attachment[];
};
export const emptyFilters: AdvancedFilter = { match: "all", groups: [] };
export type TaskFilters = { advanced: AdvancedFilter; quick: AdvancedFilter };
export const emptyTaskFilters: TaskFilters = {
  advanced: emptyFilters,
  quick: emptyFilters,
};
export function matchesTaskFilters(
  task: Task,
  filter: TaskFilters,
  fields: FilterField[],
  context: FilterContext,
) {
  return (
    matchesAdvanced(task, filter.advanced, fields, context) &&
    matchesAdvanced(task, filter.quick, fields, context)
  );
}
const defaults: Record<string, string> = {
  name: "text",
  assignees: "member",
  status: "status",
  date: "date",
  priority: "select",
  project: "select",
  hours: "number",
  images: "files",
};
export function filterRaw(
  task: Task,
  field: FilterField,
  context: FilterContext,
): unknown {
  if (field.type === "files")
    return context.attachments
      .filter(
        (f) => f.task_id === task.id && (f.column_id || "images") === field.id,
      )
      .map((f) => f.name);
  const base: Record<string, unknown> = {
    name: task.name,
    assignees: task.assignees.filter((id) => context.people[id]).map(String),
    status: statuses[task.status] || "",
    date: task.date,
    priority: task.priority,
    project: task.project,
    hours: task.hours,
  };
  const value =
    field.id === "assignees" && field.type === "member"
      ? base.assignees
      : context.columns.some((c) => c.id === field.id)
        ? task.custom[field.id]
        : (task.custom["view:" + field.id] ?? base[field.id]);
  return field.type === "timeline"
    ? parseRange(value) || []
    : field.type === "member"
      ? memberIds(value, context.people)
      : value;
}
export function filterFields(
  tasks: Task[],
  context: FilterContext,
): FilterField[] {
  const all = boardColumns(context.columns, context.layout),
    ids = [...new Set([...context.layout.order, ...all.map((c) => c.id)])];
  return ids.flatMap((id) => {
    const column = all.find((c) => c.id === id);
    if (!column) return [];
    const custom = context.columns.find((c) => c.id === id),
      override = context.layout.overrides[id],
      type = String(override?.type || custom?.type || defaults[id] || "text"),
      field: FilterField = {
        id,
        name: override?.name || column.name,
        type,
        options: [],
      };
    if (type === "people" || type === "member")
      field.options = context.people.flatMap((name, id) =>
        name ? [{ value: String(id), label: name }] : [],
      );
    else if (type === "status")
      field.options = statuses.map((label) => ({ value: label, label }));
    else if (type === "checkbox")
      field.options = [
        { value: "true", label: "เลือกแล้ว" },
        { value: "false", label: "ยังไม่เลือก" },
      ];
    else if (type === "select" || type === "multiselect") {
      const values = [
        ...(override?.options || custom?.options || []),
        ...(id === "priority" ? ["สูง", "ปานกลาง", "ต่ำ"] : []),
        ...tasks.flatMap((t) => {
          const raw = filterRaw(t, field, context);
          return Array.isArray(raw)
            ? raw
            : typeof raw === "string"
              ? [raw]
              : [];
        }),
      ];
      field.options = [
        ...new Set(
          values.filter(
            (v): v is string => typeof v === "string" && !!v.trim(),
          ),
        ),
      ].map((label) => ({ value: label, label }));
    }
    return [field];
  });
}
const blank = [
  { value: "empty", label: "ว่าง" },
  { value: "not_empty", label: "ไม่ว่าง" },
];
export function filterOperators(type: string) {
  const equal = [
    { value: "eq", label: "เท่ากับ / เป็น" },
    { value: "neq", label: "ไม่เท่ากับ / ไม่เป็น" },
  ];
  if (type === "number")
    return [
      ...equal,
      { value: "gt", label: "มากกว่า" },
      { value: "gte", label: "มากกว่าหรือเท่ากับ" },
      { value: "lt", label: "น้อยกว่า" },
      { value: "lte", label: "น้อยกว่าหรือเท่ากับ" },
      { value: "between", label: "อยู่ระหว่าง" },
      ...blank,
    ];
  if (type === "date")
    return [
      ...equal,
      { value: "lt", label: "ก่อนวันที่" },
      { value: "gt", label: "หลังวันที่" },
      { value: "between", label: "อยู่ระหว่างวันที่" },
      ...blank,
    ];
  if (type === "timeline")
    return [
      { value: "overlaps", label: "ทับซ้อนช่วงวันที่" },
      { value: "on", label: "ครอบคลุมวันที่" },
      { value: "lt", label: "สิ้นสุดก่อนวันที่" },
      { value: "gt", label: "เริ่มหลังวันที่" },
      ...blank,
    ];
  if (
    [
      "people",
      "member",
      "status",
      "select",
      "multiselect",
      "checkbox",
    ].includes(type)
  )
    return [...equal, ...blank];
  return [
    { value: "contains", label: "มีข้อความ" },
    { value: "not_contains", label: "ไม่มีข้อความ" },
    ...equal,
    { value: "starts", label: "ขึ้นต้นด้วย" },
    { value: "ends", label: "ลงท้ายด้วย" },
    ...blank,
  ];
}
export function completeRule(rule: FilterRule, fields: FilterField[]) {
  const field = fields.find((f) => f.id === rule.column);
  if (
    !field ||
    !filterOperators(field.type).some((o) => o.value === rule.operator)
  )
    return false;
  if (["empty", "not_empty"].includes(rule.operator)) return true;
  if (!rule.value.trim()) return false;
  const range = ["between", "overlaps"].includes(rule.operator);
  if (range && !rule.to.trim()) return false;
  if (field.type === "number")
    return (
      Number.isFinite(Number(rule.value)) &&
      (!range ||
        (Number.isFinite(Number(rule.to)) &&
          Number(rule.to) >= Number(rule.value)))
    );
  if (["date", "timeline"].includes(field.type))
    return (
      !!parseDay(rule.value) &&
      (!range || (!!parseDay(rule.to) && rule.to >= rule.value))
    );
  return (
    !field.options.length || field.options.some((o) => o.value === rule.value)
  );
}
export function matchesRule(
  task: Task,
  rule: FilterRule,
  field: FilterField,
  context: FilterContext,
) {
  const raw = filterRaw(task, field, context),
    empty =
      raw === null ||
      raw === undefined ||
      raw === "" ||
      (Array.isArray(raw) && !raw.length),
    op = rule.operator;
  if (op === "empty") return empty;
  if (op === "not_empty") return !empty;
  if (empty) return op === "neq" || op === "not_contains";
  if (field.type === "timeline") {
    const range = parseRange(raw);
    if (!range) return false;
    return op === "overlaps"
      ? range[0] <= rule.to && range[1] >= rule.value
      : op === "on"
        ? range[0] <= rule.value && range[1] >= rule.value
        : op === "lt"
          ? range[1] < rule.value
          : range[0] > rule.value;
  }
  if (field.type === "number" || field.type === "date") {
    const actual = field.type === "number" ? Number(raw) : String(raw),
      value = field.type === "number" ? Number(rule.value) : rule.value,
      to = field.type === "number" ? Number(rule.to) : rule.to;
    if (field.type === "number" && !Number.isFinite(actual)) return false;
    switch (op) {
      case "eq":
        return actual === value;
      case "neq":
        return actual !== value;
      case "gt":
        return actual > value;
      case "gte":
        return actual >= value;
      case "lt":
        return actual < value;
      case "lte":
        return actual <= value;
      case "between":
        return actual >= value && actual <= to;
      default:
        return false;
    }
  }
  const values = (Array.isArray(raw) ? raw : [raw]).map((v) =>
      String(v).toLocaleLowerCase(),
    ),
    value = rule.value.toLocaleLowerCase();
  switch (op) {
    case "eq":
      return values.includes(value);
    case "neq":
      return !values.includes(value);
    case "contains":
      return values.some((v) => v.includes(value));
    case "not_contains":
      return values.every((v) => !v.includes(value));
    case "starts":
      return values.some((v) => v.startsWith(value));
    case "ends":
      return values.some((v) => v.endsWith(value));
    default:
      return false;
  }
}
export function matchesAdvanced(
  task: Task,
  filter: AdvancedFilter,
  fields: FilterField[],
  context: FilterContext,
) {
  const groups = filter.groups
    .map((group) => ({
      group,
      rules: group.rules.filter((rule) => completeRule(rule, fields)),
    }))
    .filter((g) => g.rules.length);
  if (!groups.length) return true;
  const results = groups.map(({ group, rules }) => {
    const values = rules.map((rule) =>
      matchesRule(
        task,
        rule,
        fields.find((f) => f.id === rule.column)!,
        context,
      ),
    );
    return group.match === "all" ? values.every(Boolean) : values.some(Boolean);
  });
  return filter.match === "all"
    ? results.every(Boolean)
    : results.some(Boolean);
}
