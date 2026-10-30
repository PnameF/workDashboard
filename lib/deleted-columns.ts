import type { Task } from "./types";
import type { BoardLayout } from "./board";
export function applyDeletedColumns(task: Task, layout: BoardLayout): Task {
  const deleted = new Set(layout.deletedColumns || []),
    next = { ...task, custom: { ...task.custom } };
  for (const id of deleted) {
    delete next.custom[id];
    delete next.custom["view:" + id];
  }
  if (deleted.has("assignees")) {
    next.assignees = [];
    next.person = -1;
  }
  if (deleted.has("status")) next.status = -1;
  if (deleted.has("date")) next.date = "";
  if (deleted.has("priority")) next.priority = "";
  if (deleted.has("project")) next.project = "";
  if (deleted.has("hours")) next.hours = null;
  return next;
}
export function withoutColumn(layout: BoardLayout, id: string): BoardLayout {
  const omit = <T>(record: Record<string, T> | undefined) =>
    Object.fromEntries(
      Object.entries(record || {}).filter(([key]) => key !== id),
    );
  const result: BoardLayout = {
    ...layout,
    deletedColumns: [...new Set([...(layout.deletedColumns || []), id])],
    order: layout.order.filter((key) => key !== id),
    hidden: layout.hidden.filter((key) => key !== id),
    overrides: omit(layout.overrides),
    widths: omit(layout.widths),
    numberSummaries: omit(layout.numberSummaries),
    optionColors: omit(layout.optionColors),
  };
  if (layout.calendarFields) {
    result.calendarFields = layout.calendarFields.filter((key) => key !== id);
    if (!result.calendarFields.length) result.calendarFields = ["name"];
  }
  if (id === "project") delete result.projectOptions;
  return result;
}
