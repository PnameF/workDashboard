"use client";
import { useEffect, useId, useRef, useState } from "react";
import {
  FiX,
  FiFile,
  FiChevronRight,
  FiType,
  FiUsers,
  FiFlag,
  FiCalendar,
  FiLayers,
  FiHash,
  FiLink,
  FiMail,
  FiCheckSquare,
  FiClock,
  FiFileText,
} from "react-icons/fi";
import type { IconType } from "react-icons";
import type { Task, CustomColumn, Attachment } from "@/lib/types";
import type { BoardLayout } from "@/lib/board";
import { calendarColumns, calendarFieldValue } from "@/lib/calendar-display";
import ImageViewer from "./image-viewer";
import TaskUpdates from "./task-updates";
import TaskPanelTabs from "./task-panel-tabs";
import { optionColor } from "@/lib/option-colors";
import { taskGroupInfo } from "@/lib/board";
import type { WorkGroup } from "@/lib/types";
import { statuses } from "@/lib/types";
import { memberColor } from "@/lib/member-color";
import { nameInitials } from "@/lib/auth-types";
import { parseRange, rangeDuration } from "@/lib/timeline";
const icons: Record<string, IconType> = {
  text: FiType,
  people: FiUsers,
  status: FiFlag,
  date: FiCalendar,
  timeline: FiClock,
  number: FiHash,
  url: FiLink,
  email: FiMail,
  checkbox: FiCheckSquare,
  files: FiFile,
  select: FiLayers,
  multiselect: FiLayers,
};
const baseTypes: Record<string, string> = {
  name: "text",
  assignees: "people",
  status: "status",
  date: "date",
  priority: "select",
  project: "select",
  hours: "number",
  images: "files",
};
function tone(value: string) {
  const names: Record<string, number> = {
    สูง: 0,
    ปานกลาง: 1,
    ต่ำ: 2,
    Development: 0,
    Design: 1,
    Marketing: 2,
  };
  return (
    names[value] ??
    Array.from(value).reduce((sum, char) => sum + char.codePointAt(0)!, 0) % 6
  );
}
type Props = {
  task: Task;
  columns: CustomColumn[];
  layout: BoardLayout;
  people: string[];
  attachments: Attachment[];
  onClose: () => void;
  groups?: WorkGroup[];
};
export default function TaskDetailsDrawer({
  task,
  columns,
  layout,
  people,
  attachments,
  onClose,
  groups = [],
}: Props) {
  const dialog = useRef<HTMLDialogElement>(null),
    titleId = useId(),
    [image, setImage] = useState<Attachment | null>(null),
    [tab, setTab] = useState<"details" | "updates">("details"),
    tabsId = useId(),
    group = taskGroupInfo(task, groups, layout);
  useEffect(() => {
    const element = dialog.current;
    if (!element) return;
    element.showModal();
    const overflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      element.close();
      document.body.style.overflow = overflow;
    };
  }, []);
  function closeDrawer() {
    dialog.current?.close();
    onClose();
  }
  return (
    <>
      <dialog
        ref={dialog}
        className="task-details-drawer"
        aria-labelledby={titleId}
        data-pdf-exclude="true"
        onCancel={(event) => {
          event.preventDefault();
          closeDrawer();
        }}
        onClick={(event) => {
          if (event.target !== event.currentTarget) return;
          const r = event.currentTarget.getBoundingClientRect();
          if (
            event.clientX < r.left ||
            event.clientX > r.right ||
            event.clientY < r.top ||
            event.clientY > r.bottom
          )
            closeDrawer();
        }}
      >
        <header className="task-drawer-header">
          <div>
            <span className="task-drawer-eyebrow">
              <FiFileText size={13} />
              รายละเอียดงาน
            </span>
            <h2 id={titleId}>{task.name}</h2>
            <span className="task-group-chip">
              <i style={{ background: group.color }} />
              {group.name}
            </span>
          </div>
          <button
            type="button"
            className="task-drawer-close"
            aria-label="ปิดรายละเอียดงาน"
            onClick={closeDrawer}
          >
            <FiX size={22} />
          </button>
        </header>
        <TaskPanelTabs active={tab} onChange={setTab} id={tabsId} />
        {tab === "updates" ? (
          <div
            className="task-drawer-updates"
            role="tabpanel"
            id={`${tabsId}-panel`}
            aria-labelledby={`${tabsId}-updates`}
          >
            <TaskUpdates key={task.id} taskId={task.id} />
          </div>
        ) : (
          <dl
            className="task-drawer-fields"
            role="tabpanel"
            id={`${tabsId}-panel`}
            aria-labelledby={`${tabsId}-details`}
          >
            {calendarColumns(columns, layout)
              .filter((field) => !layout.hidden.includes(field.id))
              .filter(
                (field) =>
                  field.id !== "name" ||
                  calendarFieldValue(
                    task,
                    field.id,
                    columns,
                    layout,
                    people,
                    attachments,
                  ) !== task.name,
              )
              .map((field) => {
                const type = String(
                    layout.overrides[field.id]?.type ||
                      columns.find((c) => c.id === field.id)?.type ||
                      baseTypes[field.id] ||
                      "text",
                  ),
                  files = attachments.filter(
                    (f) =>
                      f.task_id === task.id &&
                      (f.column_id || "images") === field.id,
                  ),
                  value = calendarFieldValue(
                    task,
                    field.id,
                    columns,
                    layout,
                    people,
                    attachments,
                  ),
                  Icon =
                    field.id === "priority" ? FiFlag : icons[type] || FiType,
                  raw = columns.some((c) => c.id === field.id)
                    ? task.custom[field.id]
                    : task.custom["view:" + field.id],
                  range = type === "timeline" ? parseRange(raw) : null,
                  tags = Array.isArray(raw)
                    ? raw.filter(
                        (v): v is string => typeof v === "string" && !!v.trim(),
                      )
                    : value
                      ? [value]
                      : [];
                return (
                  <div
                    className="task-drawer-field"
                    key={field.id}
                    data-field-id={field.id}
                    data-field-type={type}
                  >
                    <dt>
                      <span className="task-field-icon">
                        <Icon size={16} />
                      </span>
                      <span>{field.name}</span>
                    </dt>
                    <dd>
                      {type === "people" &&
                      task.assignees.some((id) => people[id]) ? (
                        <div className="drawer-value-tags">
                          {task.assignees
                            .filter((id) => people[id])
                            .map((id) => (
                              <span className="drawer-person" key={id}>
                                <i style={{ background: memberColor(id) }}>
                                  {nameInitials(people[id])}
                                </i>
                                <span>{people[id]}</span>
                              </span>
                            ))}
                        </div>
                      ) : type === "status" && value ? (
                        <span
                          className={`label-chip drawer-status status-${statuses.indexOf(value)}`}
                        >
                          {value}
                        </span>
                      ) : (type === "select" || type === "multiselect") &&
                        tags.length ? (
                        <div className="drawer-value-tags">
                          {tags.map((tag, index) => (
                            <span
                              key={`${tag}-${index}`}
                              className={`label-chip tone-${tone(tag)}`}
                              style={{
                                background: optionColor(
                                  layout.optionColors?.[field.id],
                                  tag,
                                ),
                              }}
                            >
                              {tag}
                            </span>
                          ))}
                        </div>
                      ) : type === "timeline" && range ? (
                        <div className="drawer-timeline-value">
                          <span>{value}</span>
                          <small>{rangeDuration(range)!.inclusive} วัน</small>
                        </div>
                      ) : type === "files" && files.length ? (
                        <ul className="task-drawer-files">
                          {files.map((file) => (
                            <li key={file.id}>
                              {file.content_type.startsWith("image/") ? (
                                <button
                                  type="button"
                                  onClick={() => setImage(file)}
                                >
                                  <FiFile />
                                  <span>{file.name}</span>
                                  <FiChevronRight />
                                </button>
                              ) : (
                                <a
                                  href={file.url || `/api/files/${file.id}`}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                >
                                  <FiFile />
                                  <span>{file.name}</span>
                                  <FiChevronRight />
                                </a>
                              )}
                            </li>
                          ))}
                        </ul>
                      ) : type === "url" && /^https?:\/\//i.test(value) ? (
                        <a
                          href={value}
                          target="_blank"
                          rel="noopener noreferrer"
                        >
                          {value}
                        </a>
                      ) : type === "email" && value ? (
                        <a href={`mailto:${value}`}>{value}</a>
                      ) : (
                        value || (
                          <span className="task-drawer-empty">ยังไม่ระบุ</span>
                        )
                      )}
                    </dd>
                  </div>
                );
              })}
          </dl>
        )}
      </dialog>
      {image && <ImageViewer file={image} onClose={() => setImage(null)} />}
    </>
  );
}
