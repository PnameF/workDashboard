import type { BoardLayout } from "./board";
import { statuses, type Task } from "./types";
import { optionColor } from "./option-colors";

export const statusPalette = ["#71829c", "#d79722", "#18ac89", "#e15876"];
export function statusOptions(layout: BoardLayout, id: string) {
  return layout.statusOptions?.[id] ?? statuses;
}
export function statusValue(task: Task) {
  const value = task.custom["view:status"];
  return typeof value === "string" ? value : statuses[task.status] || "";
}
// Extra statuses are open work; the original completed status keeps code 2.
export function statusCode(value: string) {
  return value ? Math.max(0, statuses.indexOf(value)) : -1;
}

// Stored values stay fixed so renaming a label never changes completion logic.
export function statusLabel(layout: BoardLayout, id: string, value: string) {
  return layout.statusLabels?.[id]?.[value] || value;
}
export function statusColor(layout: BoardLayout, id: string, value: string) {
  return (
    optionColor(layout.optionColors?.[id], value) ||
    statusPalette[statuses.indexOf(value)] ||
    statusPalette[0]
  );
}
export function statusColors(layout: BoardLayout, id: string) {
  return Object.fromEntries(
    statusOptions(layout, id).map((value) => [
      value,
      statusColor(layout, id, value),
    ]),
  );
}
export function validStatusOptions(value: unknown, ids: Set<string>) {
  return (
    value === undefined ||
    (!!value &&
      typeof value === "object" &&
      !Array.isArray(value) &&
      Object.entries(value).every(
        ([id, choices]) =>
          ids.has(id) &&
          Array.isArray(choices) &&
          choices.length <= 50 &&
          new Set(choices).size === choices.length &&
          choices.every(
            (key) =>
              typeof key === "string" &&
              (statuses.includes(key) || /^status:[0-9a-f-]{36}$/.test(key)),
          ),
      ))
  );
}
export function validStatusLabels(
  value: unknown,
  ids: Set<string>,
  options?: Record<string, string[]>,
) {
  return (
    value === undefined ||
    (!!value &&
      typeof value === "object" &&
      !Array.isArray(value) &&
      Object.entries(value).every(([id, labels]) => {
        if (
          !ids.has(id) ||
          !labels ||
          typeof labels !== "object" ||
          Array.isArray(labels)
        )
          return false;
        if (
          !Object.entries(labels).every(
            ([key, label]) =>
              (options?.[id] ?? statuses).includes(key) &&
              typeof label === "string" &&
              !!label.trim() &&
              label === label.trim() &&
              label.length <= 100,
          )
        )
          return false;
        const names = (options?.[id] ?? statuses).map(
          (key) => (labels as Record<string, string>)[key] || key,
        );
        return new Set(names).size === names.length;
      }))
  );
}
