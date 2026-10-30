import type { BoardLayout } from "./board";
import { statuses, type Task } from "./types";
export function syncTaskStatus(task: Task, layout: BoardLayout) {
  const override = layout.overrides.status;
  if (override && ["status", "select"].includes(override.type)) {
    const value = task.custom["view:status"];
    if (typeof value === "string") task.status = statuses.indexOf(value);
  }
}
