"use client";
import { useState, type ReactNode } from "react";
import { FiChevronRight } from "react-icons/fi";
import type { Task } from "@/lib/types";

export default function SubtaskTable({
  parent,
  tasks,
  columns,
  busy,
  selected,
  onSelect,
  renderCell,
  onOpen,
  onAdd,
}: {
  parent: Task;
  tasks: Task[];
  columns: { id: string; name: string; width: number }[];
  busy: boolean;
  selected: string[];
  onSelect: (ids: string[]) => void;
  renderCell: (task: Task, column: string) => ReactNode;
  onOpen: (task: Task) => void;
  onAdd: (name: string) => Promise<boolean>;
}) {
  const [name, setName] = useState("");
  return (
    <div className="subtask-table-wrap">
      <table className="subtask-table" aria-label={`งานย่อยของ ${parent.name}`}>
        <colgroup>
          <col style={{ width: 42 }} />
          {columns.map((column) => (
            <col key={column.id} style={{ width: column.width }} />
          ))}
          <col style={{ width: 42 }} />
        </colgroup>
        <thead>
          <tr>
            <th>
              <input
                type="checkbox"
                className="task-checkbox"
                aria-label={`เลือกงานย่อยทั้งหมดของ ${parent.name}`}
                checked={
                  tasks.length > 0 &&
                  tasks.every((task) => selected.includes(task.id))
                }
                disabled={busy || !tasks.length}
                ref={(element) => {
                  if (element)
                    element.indeterminate =
                      tasks.some((task) => selected.includes(task.id)) &&
                      !tasks.every((task) => selected.includes(task.id));
                }}
                onChange={() => onSelect(tasks.map((task) => task.id))}
              />
            </th>
            {columns.map((column) => (
              <th key={column.id} scope="col">
                {column.id === "name" ? "งานย่อย" : column.name}
              </th>
            ))}
            <th aria-label="เปิดรายละเอียด" />
          </tr>
        </thead>
        <tbody>
          {tasks.map((task) => (
            <tr
              key={task.id}
              data-task-id={task.id}
              data-selected={selected.includes(task.id) || undefined}
            >
              <td>
                <input
                  type="checkbox"
                  className="task-checkbox"
                  aria-label={`เลือกงานย่อย ${task.name}`}
                  checked={selected.includes(task.id)}
                  disabled={busy}
                  onChange={() => onSelect([task.id])}
                />
              </td>
              {columns.map((column) => (
                <td key={column.id}>{renderCell(task, column.id)}</td>
              ))}
              <td>
                <button
                  type="button"
                  aria-label={`แก้ไขงานย่อย ${task.name}`}
                  onClick={() => onOpen(task)}
                >
                  <FiChevronRight />
                </button>
              </td>
            </tr>
          ))}
          <tr className="subtask-add-row">
            <td />
            <td colSpan={columns.length + 1}>
              <form
                onSubmit={async (event) => {
                  event.preventDefault();
                  if (!name.trim() || busy) return;
                  if (await onAdd(name.trim())) setName("");
                }}
              >
                <input
                  aria-label={`เพิ่มงานย่อยใน ${parent.name}`}
                  placeholder="＋ เพิ่มงานย่อย · พิมพ์แล้วกด Enter"
                  value={name}
                  maxLength={250}
                  disabled={busy}
                  onChange={(event) => setName(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter" && event.nativeEvent.isComposing)
                      event.preventDefault();
                  }}
                />
              </form>
            </td>
          </tr>
        </tbody>
      </table>
    </div>
  );
}
