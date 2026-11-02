import type { BoardLayout } from "./board";
import { statuses, type Task } from "./types";
import { statusCode, statusOptions, statusValue } from "./status-options";
export function syncTaskStatus(task: Task, layout: BoardLayout) {
  const override = layout.overrides.status;
  if (!override || ["status", "select"].includes(override.type)) {
    const value = task.custom["view:status"];
    if (typeof value === "string")
      task.status =
        override?.type === "select"
          ? statuses.indexOf(value)
          : statusCode(value);
  }
}
export function validTaskStatuses(
  task: Task,
  schema: { layout: BoardLayout; columns: { id: string; type: string }[] },
) {
  const override = schema.layout.overrides.status;
  if (
    !schema.layout.deletedColumns?.includes("status") &&
    (!override || override.type === "status")
  ) {
    const value = statusValue(task);
    if (value && !statusOptions(schema.layout, "status").includes(value))
      return false;
  }
  return (
    schema.columns.every((column) => {
      if (
        (schema.layout.overrides[column.id]?.type || column.type) !== "status"
      )
        return true;
      const value = task.custom[column.id];
      return (
        value === undefined ||
        value === "" ||
        (typeof value === "string" &&
          statusOptions(schema.layout, column.id).includes(value))
      );
    }) &&
    Object.entries(schema.layout.overrides).every(([id, column]) => {
      if (
        id === "status" ||
        schema.columns.some((c) => c.id === id) ||
        column.type !== "status"
      )
        return true;
      const value = task.custom["view:" + id];
      return (
        value === undefined ||
        value === "" ||
        (typeof value === "string" &&
          statusOptions(schema.layout, id).includes(value))
      );
    })
  );
}
