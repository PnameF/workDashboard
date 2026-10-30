import type { CustomColumn, Task } from "./types";
import type { BoardLayout } from "./board";
import { parseRange, dayKey } from "./timeline";
export type CalendarMonth = { year: number; month: number };
export function timelineDefinitions(
  columns: CustomColumn[],
  layout: BoardLayout,
) {
  return [
    ...columns.map((c) => ({
      id: c.id,
      name: layout.overrides[c.id]?.name || c.name,
      type: layout.overrides[c.id]?.type || c.type,
      key: c.id,
    })),
    ...Object.entries(layout.overrides)
      .filter(([id]) => !columns.some((c) => c.id === id))
      .map(([id, c]) => ({
        id,
        name: c.name,
        type: c.type,
        key: "view:" + id,
      })),
  ].filter((c) => c.type === "timeline");
}
export function taskInCalendarMonth(
  task: Task,
  columns: CustomColumn[],
  layout: BoardLayout,
  month: CalendarMonth,
  column = "*",
) {
  const first = dayKey(new Date(Date.UTC(month.year, month.month, 1))),
    last = dayKey(new Date(Date.UTC(month.year, month.month + 1, 0)));
  return timelineDefinitions(columns, layout)
    .filter((c) => column === "*" || c.id === column)
    .some((c) => {
      const range = parseRange(task.custom[c.key]);
      return !!range && range[0] <= last && range[1] >= first;
    });
}
