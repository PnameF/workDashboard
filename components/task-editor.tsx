"use client";
import { useState, useId } from "react";
import TaskUpdates from "./task-updates";
import TaskPanelTabs from "./task-panel-tabs";
import {
  FiX,
  FiEdit3,
  FiSave,
  FiTrash2,
  FiUsers,
  FiFile,
} from "react-icons/fi";
import type { Task, CustomColumn, Attachment } from "@/lib/types";
import { statuses } from "@/lib/types";
import type { BoardLayout } from "@/lib/board";
import {
  editorFields,
  editorValue,
  setEditorValue,
  type EditorField,
} from "@/lib/task-editor";
import AppSelect from "./app-select";
import MultiChoice from "./choice-picker";
import DatePicker from "./date-picker";
import TimelinePicker from "./timeline-picker";
import TextSuggest from "./text-suggest";
export default function TaskEditor({
  task,
  columns,
  layout,
  people,
  attachments,
  busy,
  projects,
  onSave,
  onDelete,
  onCancel,
  onPreview,
  group,
  onEditOption,
  parentTask,
  subtasks = [],
  onOpenTask,
}: {
  task: Task;
  columns: CustomColumn[];
  layout: BoardLayout;
  people: string[];
  attachments: Attachment[];
  busy: boolean;
  projects: string[];
  onSave: (task: Task) => void;
  onDelete?: () => void;
  onCancel: () => void;
  onPreview: (file: Attachment) => void;
  group: { name: string; color: string };
  onEditOption?: (
    columnId: string,
    value: string,
    onRename?: (next: string) => void,
  ) => void;
  parentTask?: Task;
  subtasks?: Task[];
  onOpenTask?: (task: Task) => void;
}) {
  const [draft, setDraft] = useState(task),
    [confirmDelete, setConfirmDelete] = useState(false),
    [tab, setTab] = useState<"details" | "updates">("details"),
    tabsId = useId(),
    [error, setError] = useState(""),
    fields = editorFields(columns, layout),
    members = people.flatMap((name, id) => (name ? [{ name, id }] : []));
  if (!task.id && !fields.some((f) => f.id === "name" && !f.key))
    fields.unshift({
      id: "name",
      name: layout.overrides.name?.name || "ชื่องาน",
      type: "text",
    });
  function change(field: EditorField, value: string | boolean | string[]) {
    setDraft((current) => setEditorValue(current, field, value));
  }
  function input(field: EditorField) {
    const value = editorValue(draft, field, people),
      label = field.name;
    if (field.type === "people")
      return (
        <MultiChoice
          label={label}
          options={members.map((m) => m.name)}
          optionValues={members.map((m) => String(m.id))}
          selected={draft.assignees.filter((id) => people[id]).map(String)}
          disabled={busy}
          avatars
          onChange={(values) =>
            change(field, [
              ...values,
              ...draft.assignees.filter((id) => !people[id]).map(String),
            ])
          }
        />
      );
    if (field.type === "files") {
      const files = attachments.filter(
        (f) => f.task_id === task.id && (f.column_id || "images") === field.id,
      );
      return files.length ? (
        <div className="task-editor-files">
          {files.map((file) =>
            file.content_type.startsWith("image/") ? (
              <button
                type="button"
                key={file.id}
                onClick={() => onPreview(file)}
              >
                <FiFile />
                {file.name}
              </button>
            ) : (
              <a
                key={file.id}
                href={file.url || `/api/files/${file.id}`}
                target="_blank"
                rel="noopener noreferrer"
              >
                <FiFile />
                {file.name}
              </a>
            ),
          )}
        </div>
      ) : (
        <span className="task-editor-no-files">ยังไม่มีไฟล์แนบ</span>
      );
    }
    if (field.type === "date")
      return (
        <DatePicker
          aria-label={label}
          value={typeof value === "string" ? value : ""}
          disabled={busy}
          onChange={(value) => change(field, value)}
        />
      );
    if (field.type === "timeline")
      return (
        <TimelinePicker
          label={label}
          value={value}
          disabled={busy}
          onChange={(value) => change(field, value)}
        />
      );
    if (field.type === "status")
      return (
        <AppSelect
          aria-label={label}
          value={String(value)}
          disabled={busy}
          onChange={(value) => change(field, value)}
        >
          <option value="">ยังไม่ระบุ</option>
          {statuses.map((s) => (
            <option key={s} value={s}>
              {s}
            </option>
          ))}
        </AppSelect>
      );
    if (field.type === "checkbox")
      return (
        <label className="task-editor-checkbox">
          <input
            type="checkbox"
            className="task-checkbox"
            checked={value === true}
            disabled={busy}
            onChange={(e) => change(field, e.target.checked)}
          />
          เลือก
        </label>
      );
    if (field.id === "project" && !field.key)
      return (
        <TextSuggest
          id="task-project"
          defaultValue={String(value)}
          name="project"
          maxLength={100}
          options={projects}
          onChange={(value) => change(field, value)}
        />
      );
    if (field.type === "select" || field.type === "multiselect") {
      const options =
        field.options ||
        (field.id === "priority"
          ? ["สูง", "ปานกลาง", "ต่ำ"]
          : field.id === "project"
            ? projects
            : []);
      return (
        <MultiChoice
          label={label}
          options={options}
          selected={
            Array.isArray(value)
              ? value
              : typeof value === "string" && value
                ? [value]
                : []
          }
          single={field.type === "select"}
          colors={layout.optionColors?.[field.id]}
          onEditOption={
            field.key && onEditOption
              ? (old) =>
                  onEditOption(field.id, old, (next) => {
                    const current = editorValue(draft, field, people);
                    change(
                      field,
                      Array.isArray(current)
                        ? current.map((v) => (v === old ? next : v))
                        : current === old
                          ? next
                          : current,
                    );
                  })
              : undefined
          }
          disabled={busy}
          onChange={(values) =>
            change(field, field.type === "select" ? values[0] || "" : values)
          }
        />
      );
    }

    return (
      <input
        aria-label={label}
        type={
          field.type === "number"
            ? "number"
            : field.type === "url"
              ? "url"
              : field.type === "email"
                ? "email"
                : "text"
        }
        value={
          typeof value === "string"
            ? value
            : Array.isArray(value)
              ? value.join(", ")
              : String(value)
        }
        disabled={busy}
        required={field.id === "name" && !field.key}
        maxLength={field.id === "name" ? 250 : 1000}
        step={field.type === "number" ? "any" : undefined}
        min={field.id === "hours" && !field.key ? 0 : undefined}
        onChange={(e) => change(field, e.target.value)}
        placeholder={`ระบุ${label}`}
      />
    );
  }
  return (
    <form
      className="task-editor-form"
      onSubmit={(e) => {
        e.preventDefault();
        if (!draft.name.trim()) {
          setError("กรุณาระบุชื่องาน");
          return;
        }
        setError("");
        onSave({ ...draft, name: draft.name.trim() });
      }}
    >
      <header className="task-editor-header">
        <div className="task-editor-heading-icon">
          <FiEdit3 size={20} />
        </div>
        <div>
          <h2>
            {task.parent_id
              ? task.id
                ? "แก้ไขงานย่อย"
                : "เพิ่มงานย่อย"
              : task.id
                ? "แก้ไขงาน"
                : "เพิ่มงานใหม่"}
          </h2>
          <p>
            <span className="task-group-chip">
              <i style={{ background: group.color }} />
              {group.name}
            </span>
          </p>
          {parentTask && (
            <button
              type="button"
              className="task-parent-link"
              onClick={() => onOpenTask?.(parentTask)}
            >
              ↳ งานแม่: {parentTask.name}
            </button>
          )}
        </div>
        <button type="button" aria-label="ปิดแก้ไขงาน" onClick={onCancel}>
          <FiX size={20} />
        </button>
      </header>
      <TaskPanelTabs active={tab} onChange={setTab} id={tabsId} />
      <div
        className="task-editor-body"
        role="tabpanel"
        id={`${tabsId}-panel`}
        aria-labelledby={`${tabsId}-${tab}`}
      >
        {tab === "updates" ? (
          <TaskUpdates key={task.id} taskId={task.id} />
        ) : (
          <>
            <div className="task-editor-grid">
              {fields.map((field) => (
                <div
                  className={`task-editor-field ${["name", "assignees"].includes(field.id) || ["timeline", "files", "multiselect"].includes(field.type) ? "is-wide" : ""}`}
                  key={field.id}
                  data-editor-field={field.id}
                >
                  <div className="task-editor-label">
                    {field.type === "people" && <FiUsers />}
                    {field.name}
                    {field.id === "name" && !field.key && <span>*</span>}
                  </div>
                  {input(field)}
                </div>
              ))}
            </div>
            {error && (
              <p className="task-editor-error" role="alert">
                {error}
              </p>
            )}
          </>
        )}
      </div>
      <footer className="task-editor-footer">
        {confirmDelete && (
          <div className="subtask-delete-confirm" role="alert">
            <p>
              {task.parent_id
                ? "ลบงานย่อยนี้ รวมไฟล์และอัปเดตถาวร?"
                : "ลบงานนี้และงานย่อยทั้งหมด รวมงานย่อยที่เก็บถาวร ไฟล์และอัปเดตถาวร?"}
            </p>
            <button
              type="button"
              disabled={busy}
              onClick={() => setConfirmDelete(false)}
            >
              ยกเลิก
            </button>
            <button
              type="button"
              className="danger-button"
              disabled={busy}
              onClick={onDelete}
            >
              ยืนยันลบถาวร
            </button>
          </div>
        )}
        {tab === "details" && onDelete && subtasks.length > 0 && (
          <p className="subtask-delete-note">
            ลบงานแม่จะลบงานย่อยทั้งหมด รวมงานย่อยที่เก็บถาวร
          </p>
        )}
        {tab === "details" && onDelete && (
          <button
            type="button"
            className="task-editor-delete"
            disabled={busy}
            onClick={() => setConfirmDelete(true)}
          >
            <FiTrash2 />
            ลบงาน
          </button>
        )}
        <button
          type="button"
          className="secondary"
          disabled={busy}
          onClick={onCancel}
        >
          ยกเลิก
        </button>
        {tab === "details" && (
          <button type="submit" className="primary" disabled={busy}>
            <FiSave />
            {busy ? "กำลังบันทึก…" : "บันทึกงาน"}
          </button>
        )}
      </footer>
    </form>
  );
}
