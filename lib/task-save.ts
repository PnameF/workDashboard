import type { Task, TaskSaveResult, Workspace } from "./types";
import { defaultLayout } from "./board";
import { applyDeletedColumns } from "./deleted-columns";
import { syncTaskStatus } from "./task-status";

export function applyTaskSave(
  workspace: Workspace,
  result: TaskSaveResult,
): Workspace {
  const { layout, ...task } = result;
  const previous = workspace.tasks.find((t) => t.id === task.id);
  const moved =
    previous &&
    previous.group_id !== task.group_id &&
    !task.parent_id &&
    task.group_id === "done";
  let tasks = workspace.tasks
    .filter((t) => !(moved && t.id === task.id))
    .map((current) =>
      current.id === task.id
        ? task
        : !task.parent_id &&
            current.parent_id === task.id &&
            current.group_id !== task.group_id
          ? { ...current, group_id: task.group_id }
          : current,
    );
  if (!tasks.some((t) => t.id === task.id)) tasks = [...tasks, task];
  return { ...workspace, tasks, ...(layout ? { layout } : {}) };
}

export function optimisticTaskSave(
  workspace: Workspace,
  source: Task,
): Workspace {
  const layout = workspace.layout || defaultLayout;
  const task = applyDeletedColumns(source, layout);
  syncTaskStatus(task, layout);
  if (!task.parent_id && task.status === 2) {
    task.group_id = "done";
    return applyTaskSave(workspace, {
      ...task,
      layout: {
        ...layout,
        hiddenGroups: (layout.hiddenGroups || []).filter((id) => id !== "done"),
      },
    });
  }
  return applyTaskSave(workspace, task);
}

// Roll back only objects from this optimistic save; retain newer unrelated work.
export function rollbackTaskSave(
  current: Workspace,
  before: Workspace,
  optimistic: Workspace,
): Workspace {
  const pending = new Map(optimistic.tasks.map((task) => [task.id, task]));
  const originals = new Map(before.tasks.map((task) => [task.id, task]));
  const tasks = current.tasks.map((task) =>
    task === pending.get(task.id) ? originals.get(task.id) || task : task,
  );
  // Preserve the original position of a parent that was optimistically completed.
  const changed = new Set(
    before.tasks
      .filter((task) => pending.get(task.id) !== task)
      .map((task) => task.id),
  );
  for (const id of changed) {
    const restored = originals.get(id);
    if (!restored || !tasks.includes(restored)) continue;
    const previousIndex = before.tasks.findIndex((task) => task.id === id);
    const anchor = before.tasks
      .slice(previousIndex + 1)
      .find((task) => tasks.some((current) => current.id === task.id));
    const index = tasks.indexOf(restored);
    tasks.splice(index, 1);
    tasks.splice(
      anchor ? tasks.findIndex((task) => task.id === anchor.id) : tasks.length,
      0,
      restored,
    );
  }
  return {
    ...current,
    tasks,
    layout:
      current.layout === optimistic.layout ? before.layout : current.layout,
  };
}
