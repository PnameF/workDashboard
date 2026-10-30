"use client";

import { Fragment, useEffect, useId, useRef, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import MultiChoice from "./choice-picker";
import ColumnFooter from "./column-footer";
import ImageViewer from "./image-viewer";
import AppSelect from "./app-select";
import DatePicker from "./date-picker";
import TimelinePicker from "./timeline-picker";
import ReportCalendar from "./report-calendar";
import ColorPicker from "./color-picker";
import { useSidebar } from "./use-sidebar";
import AdvancedFilters from "./advanced-filters";
import TaskEditor from "./task-editor";
import SubtaskTable from "./subtask-table";
import OptionEditor from "./option-editor";
import { optionColor, optionPalette } from "@/lib/option-colors";
import {
  emptyTaskFilters,
  filterFields,
  matchesTaskFilters,
  type TaskFilters,
} from "@/lib/advanced-filters";
import OptionTagsEditor from "./option-tags-editor";
import { fileAccept, MAX_FILE_SIZE } from "@/lib/files";
import {
  defaultNumberSummary,
  type NumberSummaryConfig,
} from "@/lib/column-summary";
import {
  boardColumns,
  defaultLayout,
  reorderColumn,
  type BoardLayout,
  taskGroupInfo,
} from "@/lib/board";
import {
  FiCheckSquare,
  FiLayers,
  FiPlus,
  FiBell,
  FiSearch,
  FiClock,
  FiFlag,
  FiHelpCircle,
  FiX,
  FiFile,
  FiActivity,
  FiChevronRight,
  FiChevronLeft,
  FiLoader,
  FiTrash2,
  FiUploadCloud,
  FiCopy,
  FiArchive,
  FiRotateCcw,
  FiDownload,
  FiLogOut,
  FiShield,
} from "react-icons/fi";
import {
  statuses,
  type Task,
  type Workspace,
  type CustomColumn,
  type ColumnType,
  type Attachment,
  type WorkGroup,
  type ArchivedTask,
} from "@/lib/types";
import { nameInitials, type AuthUser } from "@/lib/auth-types";
import { memberColor } from "@/lib/member-color";
import { memberIds } from "@/lib/member-columns";
import { isSubtaskExpanded, subtaskRows } from "@/lib/subtasks";
import { todayKey, parseDay, monthNames } from "@/lib/timeline";
import {
  taskInCalendarMonth,
  timelineDefinitions,
} from "@/lib/timeline-events";

const empty: Workspace = { tasks: [], columns: [], attachments: [] };
const statusClasses = ["todo", "doing", "done", "stuck"];
const colors = ["#71829c", "#d79722", "#18ac89", "#e15876"];
type View = "my" | "board" | "reports" | "archive";
const viewPaths: Record<View, string> = {
  my: "/my-work",
  board: "/tasks",
  reports: "/reports",
  archive: "/archive",
};
async function api<T>(url: string, method = "GET", body?: unknown): Promise<T> {
  const res = await fetch(url, {
    method,
    headers:
      body instanceof FormData
        ? undefined
        : { "Content-Type": "application/json" },
    body:
      body === undefined
        ? undefined
        : body instanceof FormData
          ? body
          : JSON.stringify(body),
  });
  const data = await res.json();
  if (res.status === 401) window.location.assign("/login");
  if (!res.ok) throw new Error(data.error || "เกิดข้อผิดพลาด กรุณาลองใหม่");
  return data;
}

export default function Dashboard({
  view = "my",
  user,
}: {
  view?: View;
  user: AuthUser;
}) {
  const [collapsedGroups, setCollapsedGroups] = useState<
    Record<string, boolean>
  >({});
  const groupColorTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [groupDrafts, setGroupDrafts] = useState<Record<string, string>>({});
  const [activeFileColumn, setActiveFileColumn] = useState("images");
  const [previewFile, setPreviewFile] = useState<Attachment | null>(null);
  const [newTaskGroup, setNewTaskGroup] = useState<string | null>(null);
  const [newGroupColor, setNewGroupColor] = useState("#7197d0");
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [archivedTasks, setArchivedTasks] = useState<ArchivedTask[]>([]);
  const [archiveQuery, setArchiveQuery] = useState("");
  const [reportMonth, setReportMonth] = useState(() => {
      const day = parseDay(todayKey())!;
      return { year: day.getUTCFullYear(), month: day.getUTCMonth() };
    }),
    [reportTimeline, setReportTimeline] = useState("*");
  const reportContent = useRef<HTMLDivElement>(null),
    [exportingPdf, setExportingPdf] = useState(false);
  async function downloadReportPdf() {
    if (!reportContent.current || exportingPdf) return;
    setExportingPdf(true);
    try {
      const { exportReportPdf } = await import("@/lib/export-report-pdf");
      await exportReportPdf(reportContent.current);
      toast("ส่งออก PDF หน้าเดียวแล้ว");
    } catch {
      toast("ส่งออก PDF ไม่สำเร็จ กรุณาลองอีกครั้ง");
    } finally {
      setExportingPdf(false);
    }
  }
  const [quickTaskNames, setQuickTaskNames] = useState<Record<string, string>>(
    {},
  );
  const [newTaskStatus, setNewTaskStatus] = useState(0);
  const [editingColumn, setEditingColumn] = useState<CustomColumn | null>(null);
  const [newTaskParent, setNewTaskParent] = useState<string | null>(null);
  const [collapsedSubtasks, setCollapsedSubtasks] = useState<
    Record<string, boolean>
  >({});
  const [dragItem, setDragItem] = useState<{
    kind: "task" | "group";
    id: string;
  } | null>(null);
  const [dropHint, setDropHint] = useState<{
    group: string;
    row?: string;
    after: boolean;
  } | null>(null);
  const { collapsed: sidebarCollapsed, setCollapsed: setSidebarCollapsed } =
    useSidebar();
  const [draggedColumn, setDraggedColumn] = useState<string | null>(null);
  const [columnDrop, setColumnDrop] = useState<{
    group: string;
    id: string;
    after: boolean;
    height: number;
  } | null>(null);
  const [columnType, setColumnType] = useState<ColumnType>("text");
  const [optionEdit, setOptionEdit] = useState<{
    columnId: string;
    value: string;
    color: string;
    onRename?: (next: string) => void;
  } | null>(null);
  const [data, setData] = useState<Workspace>(empty),
    [query, setQuery] = useState(""),
    [tab, setTab] = useState<string>(
      view === "reports" || view === "archive"
        ? "all"
        : user.preferences?.taskTab || "all",
    ),
    [loaded, setLoaded] = useState(false),
    [error, setError] = useState(""),
    [notice, setNotice] = useState(""),
    [busy, setBusy] = useState(false),
    [editing, setEditing] = useState<Task | null>(null),
    [modal, setModal] = useState<
      | "task"
      | "column"
      | "columnedit"
      | "images"
      | "group"
      | "bulk-delete"
      | "column-delete"
      | "group-action"
      | null
    >(null),
    [imageTask, setImageTask] = useState<Task | null>(null);
  const currentUser = user.memberId,
    members = data.members || [],
    memberEntries = members.map((m) => [m.name, m.id] as const),
    people = members.reduce((names, m) => {
      names[m.id] = m.name;
      return names;
    }, [] as string[]),
    initials = people.map(nameInitials);
  async function logout() {
    await mutate(async () => {
      await api("/api/auth/logout", "POST");
      window.location.assign("/login");
    });
  }
  const dialog = useRef<HTMLDialogElement>(null);
  const dialogPointerStart = useRef<{
    x: number;
    y: number;
    outside: boolean;
  } | null>(null);
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const resizing = useRef<{
    id: string;
    start: number;
    width: number;
    last: number;
  } | null>(null);
  const [draftWidths, setDraftWidths] = useState<Record<string, number>>({});
  useEffect(() => {
    let active = true;
    Promise.all([
      api<Workspace>("/api/workspace"),
      view === "archive"
        ? api<ArchivedTask[]>("/api/tasks/bulk")
        : Promise.resolve([]),
    ])
      .then(([d, archived]) => {
        if (active) {
          setData(d);
          setArchivedTasks(archived);
          setSelectedIds([]);
          setLoaded(true);
        }
      })
      .catch((e) => {
        if (active) setError(e.message);
      });
    return () => {
      active = false;
      if (toastTimer.current) clearTimeout(toastTimer.current);
      if (groupColorTimer.current) clearTimeout(groupColorTimer.current);
    };
  }, [view]);
  useEffect(() => {
    if (modal) dialog.current?.showModal();
    else dialog.current?.close();
  }, [modal]);
  function toast(message: string) {
    setNotice(message);
    if (toastTimer.current) clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setNotice(""), 3500);
  }
  async function mutate(action: () => Promise<void>) {
    setBusy(true);
    try {
      await action();
      setError("");
      return true;
    } catch (e) {
      toast(e instanceof Error ? e.message : "บันทึกไม่สำเร็จ");
      return false;
    } finally {
      setBusy(false);
    }
  }
  const layout = data.layout || defaultLayout;
  const [groupAction, setGroupAction] = useState<{
    id: string;
    action: "archive" | "delete";
  } | null>(null);
  const selectedTasks = data.tasks.filter((t) => selectedIds.includes(t.id));
  function toggleTasks(ids: string[]) {
    setSelectedIds((current) =>
      ids.every((id) => current.includes(id))
        ? current.filter((id) => !ids.includes(id))
        : [...new Set([...current, ...ids])],
    );
  }
  async function bulkAction(action: "archive" | "duplicate") {
    await mutate(async () => {
      const ids = selectedTasks.map((t) => t.id);
      try {
        for (let i = 0; i < ids.length; i += 50)
          await api("/api/tasks/bulk", "POST", {
            action,
            ids: ids.slice(i, i + 50),
            createdBy: currentUser,
          });
      } finally {
        setData(await api<Workspace>("/api/workspace"));
      }
      setSelectedIds([]);
      toast(
        action === "archive"
          ? `เก็บถาวร ${ids.length} งานแล้ว`
          : `ทำสำเนา ${ids.length} งานพร้อมไฟล์แนบแล้ว`,
      );
    });
  }

  async function restoreTask(id: string) {
    await mutate(async () => {
      await api("/api/tasks/bulk", "POST", { action: "restore", ids: [id] });
      setData(await api<Workspace>("/api/workspace"));
      setArchivedTasks((tasks) => tasks.filter((t) => t.id !== id));
      toast("เรียกคืนงานแล้ว");
    });
  }
  async function moveSelected(group: string) {
    if (!group || busy) return;
    await mutate(async () => {
      for (const task of selectedTasks) {
        const moved = await api<{ sort_order: number }>(
          "/api/tasks/move",
          "POST",
          { id: task.id, group },
        );
        setData((d) => ({
          ...d,
          tasks: d.tasks.map((t) =>
            t.id === task.id
              ? { ...t, group_id: group, sort_order: moved.sort_order }
              : t,
          ),
        }));
      }
      setData(await api<Workspace>("/api/workspace"));
      toast(`ย้าย ${selectedTasks.length} งานแล้ว`);
      setSelectedIds([]);
    });
  }
  async function deleteSelected() {
    await mutate(async () => {
      for (const task of selectedTasks) {
        await api("/api/tasks", "DELETE", { id: task.id });
        setSelectedIds((ids) => ids.filter((id) => id !== task.id));
      }
      setData(await api<Workspace>("/api/workspace"));
      toast(`ลบ ${selectedTasks.length} งานแล้ว`);
      setModal(null);
    });
  }
  const layoutRef = useRef(layout);
  useEffect(() => {
    layoutRef.current = layout;
  }, [layout]);
  const allColumns = boardColumns(data.columns, layout);
  const orderedIds = [
    ...new Set([...layout.order, ...allColumns.map((c) => c.id)]),
  ];
  const visibleColumns = orderedIds
    .map((id) => allColumns.find((c) => c.id === id))
    .filter(
      (c): c is (typeof allColumns)[number] =>
        !!c && !layout.hidden.includes(c.id),
    );
  function columnWidth(id: string) {
    const defaults: Record<string, number> = {
      name: 320,
      assignees: 190,
      status: 150,
      date: 170,
      priority: 150,
      project: 180,
      hours: 110,
      images: 100,
    };
    return draftWidths[id] ?? layout.widths?.[id] ?? defaults[id] ?? 180;
  }
  async function saveLayout(
    next: BoardLayout,
    onSaved?: () => void | Promise<void>,
  ) {
    await mutate(async () => {
      const saved = await api<BoardLayout>("/api/table-layout", "PUT", next);
      setData((d) => ({ ...d, layout: saved }));
      await onSaved?.();
    });
  }
  function clearBoardDrag() {
    setDragItem(null);
    setDropHint(null);
  }
  async function moveTask(
    id: string,
    group: string,
    anchorId: string | null = null,
    after = false,
  ) {
    clearBoardDrag();
    await mutate(async () => {
      await api("/api/tasks/move", "POST", { id, group, anchorId, after });
      const workspace = await api<Workspace>("/api/workspace");
      setData(workspace);
    });
  }
  function moveGroup(id: string, target: string, after = false) {
    clearBoardDrag();
    if (id === target) return;
    const order = [
      ...new Set([
        ...(layoutRef.current.groupOrder || []),
        "todo",
        "done",
        ...(data.groups || []).map((g) => g.id),
      ]),
    ];
    order.splice(order.indexOf(id), 1);
    order.splice(order.indexOf(target) + (after ? 1 : 0), 0, id);
    void saveLayout({ ...layoutRef.current, groupOrder: order });
  }
  function changeGroupColor(id: string, color: string) {
    setGroupDrafts((d) => ({ ...d, [id]: color }));
    if (groupColorTimer.current) clearTimeout(groupColorTimer.current);
    groupColorTimer.current = setTimeout(async () => {
      await saveLayout({
        ...layoutRef.current,
        groupColors: {
          ...layoutRef.current.groupColors,
          ...groupDrafts,
          [id]: color,
        },
      });
      setGroupDrafts({});
    }, 450);
  }
  function moveColumn(id: string, offset: number) {
    const order = visibleColumns.map((c) => c.id);
    const i = order.indexOf(id),
      to = i + offset;
    if (i < 0 || to < 0 || to >= order.length) return;
    [order[i], order[to]] = [order[to], order[i]];
    void saveLayout({ ...layout, order });
  }
  function columnTypeFor(id: string): ColumnType {
    return (
      layout.overrides[id]?.type ||
      data.columns.find((c) => c.id === id)?.type ||
      (id === "assignees"
        ? "member"
        : id === "status"
          ? "status"
          : id === "hours"
            ? "number"
            : id === "images"
              ? "files"
              : "text")
    );
  }
  function editOption(
    columnId: string,
    value: string,
    onRename?: (next: string) => void,
  ) {
    const options =
      columnId === "project"
        ? projectNames
        : layout.overrides[columnId]?.options ||
          data.columns.find((c) => c.id === columnId)?.options ||
          [];
    setOptionEdit({
      columnId,
      value,
      color:
        optionColor(layout.optionColors?.[columnId], value) ||
        optionPalette[Math.max(0, options.indexOf(value)) % 6],
      onRename,
    });
  }
  function columnValue(t: Task, id: string): unknown {
    if (data.columns.some((c) => c.id === id)) return t.custom[id];
    if (layout.overrides[id] && t.custom["view:" + id] !== undefined)
      return t.custom["view:" + id];
    const values: Record<string, unknown> = {
      name: t.name,
      assignees: t.assignees.map((p) => people[p]).filter(Boolean),
      status: t.status >= 0 ? statuses[t.status] : "",
      date: t.date,
      priority: t.priority,
      project: t.project,
      hours: t.hours,
      images: data.attachments.filter((a) => a.task_id === t.id).length,
    };
    return values[id];
  }
  function fileMatches(a: Attachment, taskId: string, columnId: string) {
    return a.task_id === taskId && (a.column_id || "images") === columnId;
  }
  function renderFilesCell(t: Task, columnId: string) {
    const files = data.attachments.filter((a) =>
      fileMatches(a, t.id, columnId),
    );
    return (
      <div className="files-cell">
        {files.slice(0, 3).map((a) =>
          a.content_type.startsWith("image/") ? (
            <button
              type="button"
              key={a.id}
              className="file-thumb"
              aria-label={`ดูรูป ${a.name}`}
              onClick={() => setPreviewFile(a)}
            >
              <Image
                unoptimized
                src={a.url || `/api/files/${a.id}`}
                alt={a.name}
                width={30}
                height={30}
              />
            </button>
          ) : (
            <a
              key={a.id}
              href={`/api/files/${a.id}`}
              className="file-doc"
              download={a.name}
              title={a.name}
            >
              <FiFile size={18} />
            </a>
          ),
        )}
        <button
          type="button"
          className="file-add"
          aria-label={`แนบไฟล์ ${t.name}`}
          onClick={() => {
            setImageTask(t);
            setActiveFileColumn(columnId);
            setModal("images");
          }}
        >
          {files.length > 3 ? `+${files.length - 3}` : <FiPlus size={16} />}
        </button>
      </div>
    );
  }
  function renderCell(t: Task, id: string) {
    if (columnTypeFor(id) === "files") return renderFilesCell(t, id);
    const override = layout.overrides[id];
    const custom = data.columns.find((c) => c.id === id);
    if (
      (override || custom) &&
      !(id === "assignees" && !custom && override?.type === "member")
    ) {
      const c = override || custom!;
      if (custom)
        return (
          <CustomCell
            members={members}
            column={c}
            colors={layout.optionColors?.[id]}
            editOption={(value) => editOption(id, value)}
            numberConfig={layout.numberSummaries?.[id]}
            task={t}
            busy={busy}
            update={update}
            editOptions={() => {
              setEditingColumn(c);
              setColumnType(c.type);
              setModal("columnedit");
            }}
          />
        );
      const key = "view:" + id;
      const values: Record<string, string | boolean | string[]> = {
        name: t.name,
        assignees: t.assignees.map((p) => people[p]).filter(Boolean),
        status: statuses[t.status] || "",
        date: t.date,
        priority: t.priority,
        project: t.project,
        hours: t.hours === null ? "" : String(t.hours),
        images: String(
          data.attachments.filter((a) => a.task_id === t.id).length,
        ),
      };
      const raw = t.custom[key] ?? values[id] ?? "";
      const safe =
        c.type === "number" && !Number.isFinite(Number(raw))
          ? ""
          : c.type === "date" && !/^\d{4}-\d{2}-\d{2}$/.test(String(raw))
            ? ""
            : raw;
      return (
        <div>
          <CustomCell
            members={members}
            colors={layout.optionColors?.[id]}
            editOption={(value) => editOption(id, value)}
            editOptions={() => {
              setEditingColumn(c);
              setColumnType(c.type);
              setModal("columnedit");
            }}
            numberConfig={layout.numberSummaries?.[id]}
            column={{ ...c, id: key }}
            task={{ ...t, custom: { ...t.custom, [key]: safe } }}
            busy={busy}
            update={(next) =>
              update({ ...t, custom: { ...t.custom, [key]: next.custom[key] } })
            }
          />
          {safe !== raw && (
            <small className="muted">ค่าเดิม: {String(raw)}</small>
          )}
        </div>
      );
    }
    switch (id) {
      case "name":
        return (
          <button className="taskname" onClick={() => taskModal(t)}>
            {t.name}
          </button>
        );
      case "assignees":
        return (
          <MultiChoice
            avatarUrls={Object.fromEntries(
              members.map((m) => [String(m.id), m.avatarUrl]),
            )}
            label={`${layout.overrides.assignees?.name || "ผู้รับผิดชอบ"} ${t.name}`}
            options={members.map((m) => m.name)}
            selected={t.assignees.filter((id) => !!people[id]).map(String)}
            optionValues={members.map((m) => String(m.id))}
            disabled={busy}
            avatars
            onChange={(values) =>
              update({
                ...t,
                assignees: [
                  ...new Set([
                    ...values.map(Number),
                    ...t.assignees.filter((id) => !people[id]),
                  ]),
                ],
                person: Number(values[0]),
              })
            }
          />
        );
      case "status":
        return (
          <AppSelect
            disabled={busy}
            aria-label={`สถานะ ${t.name}`}
            className={`badge ${statusClasses[t.status]}`}
            value={t.status}
            onChange={(value) =>
              update({
                ...t,
                status: Number(value),
              })
            }
          >
            <option value={-1}></option>
            {statuses.map((v, i) => (
              <option key={v} value={i}>
                {v}
              </option>
            ))}
          </AppSelect>
        );
      case "date":
        return (
          <DatePicker
            disabled={busy}
            aria-label={`กำหนดส่ง ${t.name}`}
            value={t.date}
            onChange={(value) => {
              update({ ...t, date: value });
            }}
          />
        );
      case "priority":
        return (
          <MultiChoice
            label={`ความสำคัญ ${t.name}`}
            options={["สูง", "ปานกลาง", "ต่ำ"]}
            selected={t.priority ? [t.priority] : []}
            disabled={busy}
            single
            onChange={(values) => {
              void update({ ...t, priority: values[0] || "" });
            }}
          />
        );
      case "project":
        return (
          <MultiChoice
            label={`โปรเจกต์ ${t.name}`}
            options={projectNames}
            colors={layout.optionColors?.project}
            onEditOption={(value) => editOption("project", value)}
            selected={t.project ? [t.project] : []}
            disabled={busy}
            single
            onChange={(values) => {
              void update({ ...t, project: values[0] || "" });
            }}
          />
        );
      case "hours":
        return (
          <NumberCell
            label={`ชั่วโมง ${t.name}`}
            value={t.hours}
            disabled={busy}
            config={layout.numberSummaries?.hours}
            onChange={(hours) => update({ ...t, hours })}
          />
        );
      case "images":
        return renderFilesCell(t, id);
    }
  }
  const reportDefinitions = timelineDefinitions(data.columns, layout),
    activeTimeline =
      reportTimeline === "*" ||
      reportDefinitions.some((c) => c.id === reportTimeline)
        ? reportTimeline
        : "*";
  const [advanced, setAdvanced] = useState<TaskFilters>(emptyTaskFilters);
  const filterContext = {
    columns: data.columns,
    layout,
    people,
    attachments: data.attachments,
  };
  const advancedFields = filterFields(data.tasks, filterContext);
  const scopedTasks = data.tasks.filter(
    (t) =>
      (view !== "my" ||
        t.assignees.includes(currentUser) ||
        t.created_by === currentUser) &&
      (!query || t.name.toLowerCase().includes(query.toLowerCase())) &&
      (view !== "reports" ||
        taskInCalendarMonth(
          t,
          data.columns,
          layout,
          reportMonth,
          activeTimeline,
        )) &&
      (tab === "all" ||
        (tab === "done" && t.status === 2) ||
        (tab === "open" && t.status !== 2)),
  );
  const list = scopedTasks.filter((t) =>
    matchesTaskFilters(t, advanced, advancedFields, filterContext),
  );
  const groupDefinitions = [
    { id: "todo", name: "To-Do", color: "#7197d0" },
    { id: "done", name: "Completed", color: "#64aa91" },
    ...(data.groups || []),
  ];
  const groupOrder = [
    ...new Set([
      ...(layout.groupOrder || []),
      ...groupDefinitions.map((g) => g.id),
    ]),
  ];
  const groups = groupDefinitions
    .filter((g) => !layout.hiddenGroups?.includes(g.id))
    .map((g) => ({
      id: g.id,
      label: layout.groupNames?.[g.id] || g.name,
      color: groupDrafts[g.id] || layout.groupColors?.[g.id] || g.color,
      tasks: list.filter(
        (t) => (t.group_id || (t.status === 2 ? "done" : "todo")) === g.id,
      ),
    }))
    .map((g) => ({
      ...g,
      rows: subtaskRows(data.tasks, g.tasks, collapsedSubtasks),
    }))
    .sort((a, b) => groupOrder.indexOf(a.id) - groupOrder.indexOf(b.id));
  const done = list.filter((t) => t.status === 2).length,
    percent = list.length ? Math.round((done / list.length) * 100) : 0;
  const projectNames = [
    ...new Set([
      ...(layout.projectOptions || ["Development", "Design", "Marketing"]),
      ...data.tasks.map((t) => t.project),
    ]),
  ].filter((name) => name.trim() !== "");
  function taskModal(
    t: Task | null = null,
    status = 0,
    groupId: string | null = null,
    parentId: string | null = null,
  ) {
    setNewTaskParent(parentId);
    setNewTaskStatus(status);
    setNewTaskGroup(groupId);
    setEditing(t);
    setModal("task");
  }
  async function update(t: Task) {
    await mutate(async () => {
      const updated = await api<Task>("/api/tasks", "PATCH", t);
      setData((d) => ({
        ...d,
        tasks: d.tasks.map((x) => (x.id === t.id ? updated : x)),
      }));
    });
  }
  async function addSubtask(parent: Task, name: string) {
    return mutate(async () => {
      const child = await api<Task>("/api/tasks", "POST", {
        name,
        parent_id: parent.id,
      });
      setData((current) => ({ ...current, tasks: [...current.tasks, child] }));
      setCollapsedSubtasks((current) => ({ ...current, [parent.id]: false }));
    });
  }
  async function quickAddTask(groupId: string) {
    const name = quickTaskNames[groupId]?.trim();
    if (!name || busy) return;
    await mutate(async () => {
      const task = await api<Task>("/api/tasks", "POST", {
        name,
        created_by: currentUser,
        person: -1,
        assignees: [],
        status: -1,
        date: "",
        priority: "",
        project: "",
        hours: null,
        custom: {},
        group_id: groupId,
      });
      setData((d) => ({ ...d, tasks: [...d.tasks, task] }));
      setQuickTaskNames((d) => ({ ...d, [groupId]: "" }));
    });
  }
  async function deleteTask(t: Task) {
    await mutate(async () => {
      await api("/api/tasks", "DELETE", { id: t.id });
      setData(await api<Workspace>("/api/workspace"));
      toast("ลบงานเรียบร้อย");
      setModal(null);
    });
  }
  function filters() {
    return (
      <AdvancedFilters
        currentUser={currentUser}
        value={advanced}
        onChange={setAdvanced}
        fields={advancedFields}
        tasks={scopedTasks}
        context={filterContext}
        disabled={busy || !loaded}
      />
    );
  }

  let position = 0;
  const gradient =
    "conic-gradient(" +
    [2, 1, 0, 3]
      .map((i) => {
        const start = position;
        position +=
          (list.filter((t) => t.status === i).length / (list.length || 1)) *
          100;
        return `${colors[i]} ${start}% ${position}%`;
      })
      .join(",") +
    (list.length ? `,#343d4e ${position}% 100%` : ",#242c3a 0% 100%") +
    ")";
  const max = Math.max(
    4,
    ...memberEntries.map(
      ([, i]) => list.filter((t) => t.assignees.includes(i)).length,
    ),
  );
  return (
    <>
      <aside
        id="dashboard-sidebar"
        aria-label="เมนูหลัก"
        className={`dashboard-sidebar ${sidebarCollapsed ? "sidebar-collapsed" : ""}`}
      >
        <div className="sidebar-brand-row">
          <div className="brand">
            <i>
              <FiActivity />
            </i>
            <span className="brand-wordmark">
              workly<span>.</span>
            </span>
          </div>
          <button
            type="button"
            className="sidebar-toggle"
            aria-controls="dashboard-sidebar"
            aria-expanded={!sidebarCollapsed}
            aria-label={sidebarCollapsed ? "ขยายเมนู" : "พับเมนู"}
            title={sidebarCollapsed ? "ขยายเมนู" : "พับเมนู"}
            onClick={() => setSidebarCollapsed(!sidebarCollapsed)}
          >
            {sidebarCollapsed ? <FiChevronRight /> : <FiChevronLeft />}
          </button>
        </div>
        {(
          [
            [FiCheckSquare, "my", "My Work"],
            [FiLayers, "board", "ตารางงานทั้งหมด"],
            [FiActivity, "reports", "สรุปผลงาน"],
          ] as const
        ).map(([Icon, v, title]) => (
          <Link
            key={v}
            className={`nav ${view === v ? "active" : ""}`}
            href={viewPaths[v]}
            title={title}
            aria-label={title}
            aria-current={view === v ? "page" : undefined}
          >
            <Icon />
            <span>{title}</span>
            {v === "my" && (
              <span className="count">
                {
                  data.tasks.filter(
                    (t) => t.assignees.includes(currentUser) && t.status !== 2,
                  ).length
                }
              </span>
            )}
          </Link>
        ))}
        <div className="bottom">
          <div
            className="workspace"
            style={{
              marginBottom: 16,
              background: "var(--surface-raised)",
            }}
          >
            <b style={{ fontSize: "calc(12px * var(--ui-font-scale, 1))" }}>
              พื้นที่ดี ๆ สำหรับทุกงาน ✧
            </b>
            <p
              style={{
                fontSize: "calc(11px * var(--ui-font-scale, 1))",
                marginTop: 7,
              }}
            >
              ให้ทีมโฟกัสกับสิ่งที่สำคัญ
            </p>
          </div>
          <Link
            className={`nav ${view === "archive" ? "active" : ""}`}
            href="/archive"
            title="งานที่เก็บถาวร"
            aria-label="งานที่เก็บถาวร"
          >
            <FiArchive />
            <span>งานที่เก็บถาวร</span>
          </Link>
          <button
            className="nav"
            title="วิธีใช้งาน"
            aria-label="วิธีใช้งาน"
            onClick={() =>
              toast(
                "คลิกชื่องานเพื่อแก้ไข • เปลี่ยนสถานะในตาราง • กดไอคอนรูปเพื่อแนบภาพ",
              )
            }
          >
            <FiHelpCircle />
            <span>วิธีใช้งาน</span>
          </button>
        </div>
        {user.role === "admin" && (
          <Link
            className="nav"
            href="/admin"
            title="จัดการผู้ใช้ / รหัสกู้คืน"
            aria-label="จัดการผู้ใช้ / รหัสกู้คืน"
          >
            <FiShield />
            <span>จัดการผู้ใช้ / รหัสกู้คืน</span>
          </Link>
        )}
        <button
          type="button"
          className="nav logout-button"
          title="ออกจากระบบ"
          aria-label="ออกจากระบบ"
          disabled={busy}
          onClick={() => void logout()}
        >
          <FiLogOut />
          <span>ออกจากระบบ</span>
        </button>
        <Link
          href="/settings"
          aria-label="ตั้งค่าโปรไฟล์และทั่วไป"
          title="ตั้งค่าโปรไฟล์และทั่วไป"
          className="profile"
        >
          <span className={`avatar p${currentUser}`}>
            {user.avatarUrl ? (
              <Image
                src={user.avatarUrl}
                alt="รูปโปรไฟล์ของฉัน"
                width={32}
                height={32}
                unoptimized
              />
            ) : user.role === "admin" ? (
              <FiShield />
            ) : (
              initials[currentUser] || nameInitials(user.name)
            )}
          </span>
          <div>
            <strong className="profile-name">
              {user.role === "admin" ? "ผู้ดูแลระบบ" : user.name}
            </strong>
            <div className="muted profile-email">
              {user.role === "admin" ? "บัญชีผู้ดูแล" : user.email}
            </div>
          </div>
        </Link>
      </aside>
      {!sidebarCollapsed && (
        <button
          type="button"
          className="sidebar-backdrop"
          aria-label="พับเมนู"
          onClick={() => setSidebarCollapsed(true)}
        />
      )}
      <main
        data-sidebar-collapsed={sidebarCollapsed}
        className={`${view === "board" || view === "my" ? "board-view" : ""} ${user.preferences?.density === "compact" ? "density-compact" : ""}`}
      >
        <header className="topbar">
          <div className="flex items-center gap-3 text-xs text-[#9ea5b3]">
            Workspace <FiChevronRight />
            <span className="text-[#cbd0d9]">
              {view === "my"
                ? "My Work"
                : view === "board"
                  ? "ตารางงานทั้งหมด"
                  : view === "reports"
                    ? "สรุปผลงาน"
                    : view === "archive"
                      ? "งานที่เก็บถาวร"
                      : "งานของฉัน"}
            </span>
          </div>
          <div className="toptools">
            <button
              aria-label="การแจ้งเตือน"
              onClick={() =>
                toast(
                  `มี ${data.tasks.filter((t) => t.status === 3).length} งานที่ติดปัญหาและต้องติดตาม`,
                )
              }
            >
              <FiBell />
            </button>
            <span className="h-6 border-l border-[#262d3b]" />
            <Link
              href="/settings"
              aria-label="ตั้งค่าโปรไฟล์และทั่วไป"
              className={`avatar p${currentUser}`}
            >
              {user.avatarUrl ? (
                <Image
                  src={user.avatarUrl}
                  alt="รูปโปรไฟล์ของฉัน"
                  width={32}
                  height={32}
                  unoptimized
                />
              ) : user.role === "admin" ? (
                <FiShield />
              ) : (
                initials[currentUser] || nameInitials(user.name)
              )}
            </Link>
          </div>
        </header>
        <div className="content" ref={reportContent}>
          <div className="heading">
            <div>
              <div className="eyebrow">YOUR WORK, IN PERSPECTIVE</div>
              <h1 className="flex items-center gap-3">
                {view === "my"
                  ? "งานของฉัน"
                  : view === "board"
                    ? "ทุกงาน ในที่เดียว"
                    : view === "archive"
                      ? "งานที่เก็บถาวร"
                      : view === "reports"
                        ? "สรุปผลงาน"
                        : "งานของฉัน"}
              </h1>
              <p>
                {view === "my"
                  ? "จัดลำดับสิ่งสำคัญ แล้วเริ่มวันทำงานของคุณ"
                  : view === "board"
                    ? "วางแผน ติดตาม และจัดการงานให้ทีมไปต่อได้ง่ายขึ้น"
                    : view === "reports"
                      ? "ติดตามผลงานของทีม กรองตามสมาชิก โปรเจกต์ และช่วงวันที่"
                      : view === "archive"
                        ? "ค้นหาและเรียกคืนงานพร้อมข้อมูลและไฟล์แนบ กลับไปยังกลุ่มเดิม"
                        : "มองเห็นทุกความคืบหน้า พาทีมไปถึงเป้าหมายด้วยกัน"}
              </p>
            </div>
            {view === "reports" && (
              <div className="report-export-actions" data-pdf-exclude="true">
                <button
                  type="button"
                  className="primary"
                  disabled={!loaded || exportingPdf}
                  onClick={() => void downloadReportPdf()}
                >
                  {exportingPdf ? (
                    <FiLoader className="animate-spin" />
                  ) : (
                    <FiDownload />
                  )}
                  {exportingPdf ? "กำลังสร้าง PDF…" : "Export PDF"}
                </button>
              </div>
            )}
          </div>

          {error && (
            <div
              role="alert"
              className="mb-5 rounded-lg border border-red-900 bg-red-950 p-4 text-red-200"
            >
              {error}
            </div>
          )}
          {!loaded && !error && (
            <div className="mb-5 flex items-center gap-2 text-slate-400">
              <FiLoader className="animate-spin" />
              กำลังโหลดข้อมูล…
            </div>
          )}
          {view === "archive" ? (
            <section className="archive-page">
              <div className="archive-toolbar">
                <h2>
                  รายการเก็บถาวร <span>{archivedTasks.length} งาน</span>
                </h2>
                <div className="search">
                  <FiSearch />
                  <input
                    type="search"
                    aria-label="ค้นหางานที่เก็บถาวร"
                    placeholder="ค้นหางานที่เก็บถาวร…"
                    value={archiveQuery}
                    onChange={(e) => setArchiveQuery(e.target.value)}
                  />
                </div>
              </div>
              {!!layout.archivedGroups?.length && (
                <div className="archived-group-cards">
                  {layout.archivedGroups.map((id) => {
                    const group = taskGroupInfo(
                        { group_id: id, status: 0 },
                        data.groups || [],
                        layout,
                      ),
                      count = archivedTasks.filter(
                        (t) => t.archived_group_id === id,
                      ).length;
                    return (
                      <div className="archived-group-card" key={id}>
                        <span className="task-group-chip">
                          <i style={{ background: group.color }} />
                          {group.name}
                        </span>
                        <small>{count} งาน</small>
                        <button
                          type="button"
                          disabled={busy}
                          onClick={() =>
                            void mutate(async () => {
                              try {
                                await api("/api/groups", "PATCH", {
                                  id,
                                  action: "restore",
                                  expectedCount: count,
                                });
                              } finally {
                                const [workspace, archived] = await Promise.all(
                                  [
                                    api<Workspace>("/api/workspace"),
                                    api<ArchivedTask[]>("/api/tasks/bulk"),
                                  ],
                                );
                                setData(workspace);
                                setArchivedTasks(archived);
                              }
                              toast("กู้คืนกลุ่มแล้ว");
                            })
                          }
                        >
                          <FiRotateCcw />
                          กู้คืนกลุ่ม
                        </button>
                      </div>
                    );
                  })}
                </div>
              )}
              {archivedTasks.length ? (
                <div className="archive-table-wrap">
                  <table className="archive-table">
                    <thead>
                      <tr>
                        <th>ชื่องาน</th>
                        <th>กลุ่มเดิม</th>
                        <th>เก็บถาวรเมื่อ</th>
                        <th />
                      </tr>
                    </thead>
                    <tbody>
                      {archivedTasks
                        .filter((t) =>
                          t.name
                            .toLowerCase()
                            .includes(archiveQuery.trim().toLowerCase()),
                        )
                        .map((t) => (
                          <tr key={t.id}>
                            <td>
                              <strong>{t.name}</strong>
                              {t.parent_name && (
                                <small>↳ งานแม่: {t.parent_name}</small>
                              )}
                              {t.file_count > 0 && (
                                <small>
                                  <FiFile />
                                  {t.file_count} ไฟล์แนบ
                                </small>
                              )}
                            </td>
                            <td>
                              {groups.find((g) => g.id === t.group_id)?.label ||
                                "To-Do"}
                            </td>
                            <td>
                              {new Intl.DateTimeFormat("th-TH-u-ca-gregory", {
                                dateStyle: "medium",
                                timeStyle: "short",
                                timeZone: "Asia/Bangkok",
                              }).format(
                                new Date(t.archived_at.replace(" ", "T") + "Z"),
                              )}
                            </td>
                            <td>
                              <button
                                type="button"
                                className="archive-restore"
                                disabled={busy}
                                aria-label={`เรียกคืน ${t.name}`}
                                onClick={() => void restoreTask(t.id)}
                              >
                                <FiRotateCcw />
                                เรียกคืน
                              </button>
                            </td>
                          </tr>
                        ))}
                    </tbody>
                  </table>
                  {!archivedTasks.some((t) =>
                    t.name
                      .toLowerCase()
                      .includes(archiveQuery.trim().toLowerCase()),
                  ) && (
                    <div className="archive-empty">
                      ไม่พบงานที่ตรงกับคำค้นหา
                    </div>
                  )}
                </div>
              ) : (
                loaded && (
                  <div className="archive-empty">
                    <FiArchive size={34} />
                    <h3>ยังไม่มีงานที่เก็บถาวร</h3>
                    <p>
                      งานที่เก็บถาวรจะแสดงที่นี่ และสามารถเรียกคืนได้ทุกเมื่อ
                    </p>
                    <Link href="/tasks">กลับตารางงาน</Link>
                  </div>
                )
              )}
            </section>
          ) : (
            <>
              <div className="stats">
                {[
                  ["งานทั้งหมด", list.length, FiLayers, "งานในพื้นที่ทำงานนี้"],
                  [
                    "เสร็จเรียบร้อย",
                    done,
                    FiCheckSquare,
                    `${percent}% ของงานทั้งหมด`,
                  ],
                  [
                    "กำลังดำเนินการ",
                    list.filter((t) => t.status === 1).length,
                    FiClock,
                    "กำลังเดินหน้าไปด้วยกัน",
                  ],
                  [
                    "งานที่ติดปัญหา",
                    list.filter((t) => t.status === 3).length,
                    FiFlag,
                    "รอการติดตามจากทีม",
                  ],
                ].map(([title, num, Icon, sub]) => {
                  const StatIcon = Icon as typeof FiLayers;
                  return (
                    <div className="stat" key={String(title)}>
                      <div className="stathead">
                        {String(title)}
                        <i>
                          <StatIcon />
                        </i>
                      </div>
                      <div className="statnum">
                        {loaded ? String(num) : "–"}
                        <span className="ml-2 text-xs font-normal tracking-normal text-[#9ea5b3]">
                          งาน
                        </span>
                      </div>
                      <div className="trend">
                        <span>↗</span>
                        {String(sub)}
                      </div>
                    </div>
                  );
                })}
              </div>
              {view === "reports" && (
                <>
                  <div className="sectiontitle">
                    <h2>
                      ประสิทธิภาพของทีม{" "}
                      <span className="ml-2 text-[10px] font-normal text-[#9ca4b3]">
                        TEAM INSIGHTS
                      </span>
                    </h2>
                    <div className="filters" data-pdf-exclude="true">
                      {filters()}
                    </div>
                  </div>
                  <div className="datefilters">
                    <span className="report-period-label">
                      ช่วงรายงาน: {monthNames[reportMonth.month]}{" "}
                      {reportMonth.year} · เปลี่ยนเดือนที่ปฏิทินด้านล่าง
                    </span>
                  </div>
                </>
              )}

              {view === "reports" && (
                <>
                  <div className="grid">
                    <div className="card">
                      <div className="cardheader">
                        <div>
                          <h2>ผลงานของแต่ละคน</h2>
                          <p>จำนวนงานที่เสร็จสิ้น แยกตามสมาชิกในทีม</p>
                        </div>
                        <div className="legend">
                          <span>
                            <b />
                            เสร็จแล้ว
                          </span>
                          <span>
                            <b style={{ background: "#2d3749" }} />
                            งานทั้งหมด
                          </span>
                        </div>
                      </div>
                      <div
                        className="chart"
                        role="img"
                        aria-label={people
                          .map(
                            (p, i) =>
                              `${p} เสร็จ ${list.filter((t) => t.assignees.includes(i) && t.status === 2).length} งาน`,
                          )
                          .join(", ")}
                      >
                        <div className="axis">
                          {[1, 0.75, 0.5, 0.25, 0].map((n) => (
                            <span key={n}>{Math.round(max * n)}</span>
                          ))}
                        </div>
                        <div className="plot">
                          {memberEntries.map(([p, i]) => {
                            const all = list.filter((t) =>
                                t.assignees.includes(i),
                              ).length,
                              n = list.filter(
                                (t) =>
                                  t.assignees.includes(i) && t.status === 2,
                              ).length;
                            return (
                              <div key={p} className="barwrap">
                                <div
                                  className="bar alt"
                                  style={{
                                    height: `${(all / max) * 85}%`,
                                    background: `color-mix(in srgb, ${memberColor(i)} 24%, transparent)`,
                                  }}
                                  title={`${p}: งานทั้งหมด ${all} งาน`}
                                >
                                  <span
                                    className="barvalue"
                                    style={{ color: memberColor(i) }}
                                  >
                                    {all}
                                  </span>
                                </div>
                                <div
                                  className="bar"
                                  style={{
                                    height: `${(n / max) * 85}%`,
                                    transform: "translateX(-9px)",
                                    width: 25,
                                    background: memberColor(i),
                                  }}
                                  title={`${p}: เสร็จ ${n} จาก ${all} งาน`}
                                >
                                  <span
                                    className="barvalue"
                                    style={{ color: memberColor(i) }}
                                  >
                                    {n}
                                  </span>
                                </div>
                                <span
                                  className="barlabel"
                                  style={{ color: memberColor(i) }}
                                >
                                  {p}
                                </span>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                      <div className="chartfoot">
                        <span>จากงานที่ตรงกับตัวกรอง</span>
                        <span>
                          สมาชิก{" "}
                          {
                            new Set(
                              list
                                .flatMap((t) => t.assignees)
                                .filter((id) => !!people[id]),
                            ).size
                          }{" "}
                          คน
                        </span>
                      </div>
                    </div>
                    <div className="card">
                      <div className="cardheader">
                        <div>
                          <h2>สถานะงานโดยรวม</h2>
                          <p>ทุกความคืบหน้า ในมุมมองเดียว</p>
                        </div>
                        <FiActivity className="text-[#9da6b6]" />
                      </div>
                      <div className="progressbody">
                        <div className="donut" style={{ background: gradient }}>
                          <div className="donutinner">
                            {percent}%<small>งานที่เสร็จสมบูรณ์</small>
                          </div>
                        </div>
                        <div className="statuslist">
                          <option value={-1}></option>
                          {statuses.map((s, i) => (
                            <div key={s} className="statusline">
                              <i
                                className="dot"
                                style={{
                                  borderRadius: "50%",
                                  background: colors[i],
                                }}
                              />
                              {s}
                              <strong>
                                {list.filter((t) => t.status === i).length}
                              </strong>
                            </div>
                          ))}
                        </div>
                      </div>
                      <div className="chartfoot">
                        <span>ความสำเร็จเริ่มจากงานเล็ก ๆ</span>
                        <span>✧</span>
                      </div>
                    </div>
                  </div>
                  <ReportCalendar
                    memberAvatars={Object.fromEntries(
                      members.map((m) => [String(m.id), m.avatarUrl]),
                    )}
                    allTasks={data.tasks}
                    groups={data.groups || []}
                    tasks={list}
                    columns={data.columns}
                    layout={layout}
                    people={people}
                    month={reportMonth}
                    onMonthChange={setReportMonth}
                    activeColumn={activeTimeline}
                    onColumnChange={setReportTimeline}
                    attachments={data.attachments}
                    disabled={busy}
                    onFieldsChange={(calendarFields) => {
                      void saveLayout({ ...layoutRef.current, calendarFields });
                    }}
                  />
                </>
              )}
              {view !== "reports" && (
                <>
                  <div className="sectiontitle">
                    <h2>
                      {view === "my" ? "งานที่มอบหมายให้ฉัน" : "ตารางงานของทีม"}{" "}
                      <span className="ml-1 text-[11px] font-normal text-[#9ea5b3]">
                        {list.length} งาน
                      </span>
                    </h2>
                  </div>
                  <div className="card board-panel">
                    <div className="tabs">
                      {[
                        ["all", "งานทั้งหมด"],
                        ["open", "ยังไม่เสร็จ"],
                        ["done", "เสร็จแล้ว"],
                      ].map(([v, t]) => (
                        <button
                          key={v}
                          className={`tab ${tab === v ? "active" : ""}`}
                          onClick={() => setTab(v)}
                        >
                          {t}
                        </button>
                      ))}
                    </div>
                    <div className="toolbar">
                      <div className="relative">
                        <FiSearch className="absolute top-3 left-3 text-[#9da5b3]" />
                        <input
                          className="search pl-9!"
                          aria-label="ค้นหางาน"
                          placeholder="ค้นหางาน..."
                          value={query}
                          onChange={(e) => setQuery(e.target.value)}
                        />
                      </div>
                      {filters()}
                      <button
                        type="button"
                        disabled={!loaded || busy}
                        className="primary ml-auto inline-flex items-center gap-2"
                        onClick={() => setModal("group")}
                      >
                        <FiPlus />
                        เพิ่มกลุ่มใหม่
                      </button>
                    </div>
                    {groups.map((group) => (
                      <section
                        className={`task-group ${dragItem?.kind === "group" && dragItem.id === group.id ? "is-dragging-group" : ""}`}
                        data-group-id={group.id}
                        data-collapsed={!!collapsedGroups[group.id]}
                        data-group-drop={
                          dropHint?.group === group.id && !dropHint.row
                            ? dropHint.after
                              ? "after"
                              : "before"
                            : undefined
                        }
                        onDragOver={(e) => {
                          if (!dragItem || busy) return;
                          e.preventDefault();
                          if (
                            (e.target as HTMLElement).closest(
                              "[data-task-id]",
                            ) &&
                            dragItem.kind === "task"
                          )
                            return;
                          const rect = e.currentTarget.getBoundingClientRect();
                          setDropHint({
                            group: group.id,
                            after:
                              dragItem.kind === "group" &&
                              e.clientY > rect.top + rect.height / 2,
                          });
                        }}
                        onDragLeave={(e) => {
                          if (
                            !e.currentTarget.contains(
                              e.relatedTarget as Node | null,
                            )
                          )
                            setDropHint(null);
                        }}
                        onDrop={(e) => {
                          if (!dragItem || busy) return;
                          e.preventDefault();
                          e.stopPropagation();
                          if (dragItem.kind === "group")
                            moveGroup(dragItem.id, group.id, dropHint?.after);
                          else void moveTask(dragItem.id, group.id);
                        }}
                        key={group.id}
                        style={
                          {
                            "--group-color": group.color,
                          } as React.CSSProperties
                        }
                      >
                        <div className="group-heading">
                          <div className="group-title-row">
                            <button
                              type="button"
                              className="group-drag-handle"
                              draggable={!busy}
                              disabled={busy}
                              aria-label={`ลากย้ายกลุ่ม ${group.label}`}
                              title="ลากเพื่อย้ายกลุ่ม · ใช้ปุ่มลูกศรขึ้น/ลงได้"
                              onDragStart={(e) => {
                                e.stopPropagation();
                                e.dataTransfer.effectAllowed = "move";
                                e.dataTransfer.setData(
                                  "application/x-workly-group",
                                  group.id,
                                );
                                setDragItem({ kind: "group", id: group.id });
                              }}
                              onDragEnd={clearBoardDrag}
                              onKeyDown={(e) => {
                                if (!["ArrowUp", "ArrowDown"].includes(e.key))
                                  return;
                                e.preventDefault();
                                const i = groups.findIndex(
                                    (g) => g.id === group.id,
                                  ),
                                  target =
                                    groups[
                                      i + (e.key === "ArrowDown" ? 1 : -1)
                                    ];
                                if (target)
                                  moveGroup(
                                    group.id,
                                    target.id,
                                    e.key === "ArrowDown",
                                  );
                              }}
                            >
                              ⠿
                            </button>
                            <button
                              className="group-toggle"
                              aria-label={`ย่อหรือขยายกลุ่ม ${group.label}`}
                              aria-expanded={!collapsedGroups[group.id]}
                              onClick={() =>
                                setCollapsedGroups((c) => ({
                                  ...c,
                                  [group.id]: !c[group.id],
                                }))
                              }
                            >
                              <FiChevronRight
                                className={
                                  collapsedGroups[group.id] ? "" : "expanded"
                                }
                              />
                            </button>
                            <div className="group-title-editor">
                              <div
                                className="group-color-control"
                                title="เปลี่ยนสีกลุ่มงาน"
                              >
                                <ColorPicker
                                  compact
                                  aria-label={`สีกลุ่ม ${group.label}`}
                                  value={group.color}
                                  disabled={busy}
                                  onChange={(value) =>
                                    changeGroupColor(group.id, value)
                                  }
                                />
                              </div>
                              <input
                                key={group.label}
                                className="group-name-input"
                                aria-label={`ชื่อกลุ่ม ${group.label}`}
                                defaultValue={group.label}
                                maxLength={60}
                                disabled={busy}
                                style={{
                                  width:
                                    Math.max(group.label.length + 1, 6) + "ch",
                                }}
                                onInput={(e) => {
                                  e.currentTarget.style.width =
                                    Math.max(
                                      e.currentTarget.value.length + 1,
                                      6,
                                    ) + "ch";
                                }}
                                onBlur={(e) => {
                                  const name = e.currentTarget.value.trim();
                                  if (!name) {
                                    e.currentTarget.value = group.label;
                                    return;
                                  }
                                  if (name !== group.label)
                                    void saveLayout({
                                      ...layoutRef.current,
                                      groupNames: {
                                        ...layoutRef.current.groupNames,
                                        [group.id]: name,
                                      },
                                    });
                                }}
                                onKeyDown={(e) => {
                                  if (e.key === "Enter") {
                                    e.preventDefault();
                                    e.currentTarget.blur();
                                  } else if (e.key === "Escape") {
                                    e.currentTarget.value = group.label;
                                    e.currentTarget.blur();
                                  }
                                }}
                              />
                              <div className="group-header-actions">
                                <button
                                  type="button"
                                  aria-label={`เก็บถาวรกลุ่ม ${group.label}`}
                                  title="เก็บถาวรกลุ่ม"
                                  disabled={busy}
                                  onMouseDown={(e) => e.preventDefault()}
                                  onClick={() => {
                                    setGroupAction({
                                      id: group.id,
                                      action: "archive",
                                    });
                                    setModal("group-action");
                                  }}
                                >
                                  <FiArchive size={15} />
                                </button>
                                <button
                                  type="button"
                                  aria-label={`ลบกลุ่ม ${group.label}`}
                                  title="ลบกลุ่ม"
                                  disabled={busy}
                                  onMouseDown={(e) => e.preventDefault()}
                                  onClick={() => {
                                    setGroupAction({
                                      id: group.id,
                                      action: "delete",
                                    });
                                    setModal("group-action");
                                  }}
                                >
                                  <FiTrash2 size={15} />
                                </button>
                              </div>
                            </div>
                            <span className="group-count">
                              {group.tasks.length} งาน
                            </span>
                          </div>
                        </div>
                        {!collapsedGroups[group.id] && (
                          <>
                            <div className="tablewrap">
                              <table
                                className="work-table"
                                style={{
                                  tableLayout: "fixed",
                                  width: visibleColumns.reduce(
                                    (total, c) => total + columnWidth(c.id),
                                    132,
                                  ),
                                }}
                              >
                                <colgroup>
                                  <col style={{ width: 40 }} />
                                  <col style={{ width: 44 }} />
                                  {visibleColumns.map((c) => (
                                    <col
                                      key={c.id}
                                      style={{ width: columnWidth(c.id) }}
                                    />
                                  ))}
                                  <col style={{ width: 48 }} />
                                </colgroup>
                                <thead>
                                  <tr>
                                    <th className="task-selection-cell">
                                      <input
                                        type="checkbox"
                                        className="task-checkbox"
                                        aria-label={`เลือกงานทั้งหมดในกลุ่ม ${group.label}`}
                                        disabled={busy || !group.tasks.length}
                                        checked={
                                          group.tasks.length > 0 &&
                                          group.tasks.every((t) =>
                                            selectedIds.includes(t.id),
                                          )
                                        }
                                        ref={(node) => {
                                          if (node)
                                            node.indeterminate =
                                              group.tasks.some((t) =>
                                                selectedIds.includes(t.id),
                                              ) &&
                                              !group.tasks.every((t) =>
                                                selectedIds.includes(t.id),
                                              );
                                        }}
                                        onChange={() =>
                                          toggleTasks(
                                            group.tasks.map((t) => t.id),
                                          )
                                        }
                                      />
                                    </th>
                                    <th>#</th>

                                    {visibleColumns.map((c) => (
                                      <th
                                        key={c.id}
                                        draggable={!busy}
                                        data-column-dragging={
                                          draggedColumn === c.id || undefined
                                        }
                                        data-column-drop={
                                          columnDrop?.group === group.id &&
                                          columnDrop.id === c.id
                                            ? columnDrop.after
                                              ? "after"
                                              : "before"
                                            : undefined
                                        }
                                        onDragStart={(e) => {
                                          if (resizing.current) {
                                            e.preventDefault();
                                            return;
                                          }
                                          setDraggedColumn(c.id);
                                          setColumnDrop(null);
                                          e.stopPropagation();
                                          e.dataTransfer.setData(
                                            "text/plain",
                                            c.id,
                                          );
                                          e.dataTransfer.effectAllowed = "move";
                                        }}
                                        onDragOver={(e) => {
                                          if (!draggedColumn || busy) return;
                                          e.preventDefault();
                                          e.stopPropagation();
                                          e.dataTransfer.dropEffect = "move";
                                          if (draggedColumn === c.id) {
                                            setColumnDrop(null);
                                            return;
                                          }
                                          const rect =
                                              e.currentTarget.getBoundingClientRect(),
                                            after =
                                              e.clientX >
                                              rect.left + rect.width / 2,
                                            height = e.currentTarget
                                              .closest("table")!
                                              .getBoundingClientRect().height;
                                          setColumnDrop((previous) =>
                                            previous?.group === group.id &&
                                            previous.id === c.id &&
                                            previous.after === after
                                              ? previous
                                              : {
                                                  group: group.id,
                                                  id: c.id,
                                                  after,
                                                  height,
                                                },
                                          );
                                        }}
                                        onDragLeave={(e) => {
                                          if (
                                            !e.currentTarget.contains(
                                              e.relatedTarget as Node | null,
                                            )
                                          )
                                            setColumnDrop((previous) =>
                                              previous?.group === group.id &&
                                              previous.id === c.id
                                                ? null
                                                : previous,
                                            );
                                        }}
                                        onDrop={(e) => {
                                          if (!draggedColumn || busy) return;
                                          e.preventDefault();
                                          e.stopPropagation();
                                          const rect =
                                              e.currentTarget.getBoundingClientRect(),
                                            after =
                                              e.clientX >
                                              rect.left + rect.width / 2;
                                          const order = reorderColumn(
                                            orderedIds.filter((id) =>
                                              allColumns.some(
                                                (column) => column.id === id,
                                              ),
                                            ),
                                            draggedColumn,
                                            c.id,
                                            after,
                                          );
                                          setDraggedColumn(null);
                                          setColumnDrop(null);
                                          if (draggedColumn !== c.id)
                                            void saveLayout({
                                              ...layoutRef.current,
                                              order,
                                            });
                                        }}
                                        onDragEnd={() => {
                                          setDraggedColumn(null);
                                          setColumnDrop(null);
                                        }}
                                      >
                                        {columnDrop?.group === group.id &&
                                          columnDrop.id === c.id && (
                                            <>
                                              <span
                                                className="column-drop-marker"
                                                style={{
                                                  height: columnDrop.height,
                                                }}
                                                aria-hidden="true"
                                              />
                                              <span
                                                className="column-drop-caption"
                                                aria-hidden="true"
                                              >
                                                {columnDrop.after
                                                  ? "วางหลัง"
                                                  : "วางก่อน"}
                                              </span>
                                            </>
                                          )}
                                        <div className="column-heading">
                                          <span
                                            className="column-grip"
                                            title="ลากเพื่อย้ายคอลัมน์"
                                          >
                                            ⠿
                                          </span>
                                          <span>
                                            {layout.overrides[c.id]?.name ||
                                              c.name}
                                          </span>
                                          <ColumnMenu
                                            label={`จัดการคอลัมน์ ${c.name}`}
                                          >
                                            <div>
                                              <button
                                                disabled={busy}
                                                onClick={() => {
                                                  const current = layout
                                                    .overrides[c.id] ||
                                                    data.columns.find(
                                                      (x) => x.id === c.id,
                                                    ) || {
                                                      ...c,
                                                      type: columnTypeFor(c.id),
                                                    };
                                                  setEditingColumn(current);
                                                  setColumnType(current.type);
                                                  setModal("columnedit");
                                                }}
                                              >
                                                เปลี่ยนชื่อ / ไทป์
                                              </button>
                                              <button
                                                disabled={busy}
                                                onClick={() =>
                                                  moveColumn(c.id, -1)
                                                }
                                              >
                                                ← ย้ายไปซ้าย
                                              </button>
                                              <button
                                                disabled={busy}
                                                onClick={() =>
                                                  moveColumn(c.id, 1)
                                                }
                                              >
                                                ย้ายไปขวา →
                                              </button>
                                              <button
                                                disabled={
                                                  busy || c.id === "name"
                                                }
                                                title={
                                                  c.id === "name"
                                                    ? "คอลัมน์ชื่องานเป็นข้อมูลหลัก"
                                                    : undefined
                                                }
                                                className="column-delete-action"
                                                onClick={() => {
                                                  setEditingColumn({
                                                    ...c,
                                                    type: columnTypeFor(c.id),
                                                  });
                                                  setModal("column-delete");
                                                }}
                                              >
                                                ลบคอลัมน์ถาวร
                                              </button>
                                              {layout.overrides[c.id] && (
                                                <button
                                                  disabled={busy}
                                                  onClick={() => {
                                                    const overrides = {
                                                      ...layout.overrides,
                                                    };
                                                    delete overrides[c.id];
                                                    void saveLayout({
                                                      ...layout,
                                                      overrides,
                                                    });
                                                  }}
                                                >
                                                  คืนค่าไทป์เดิม
                                                </button>
                                              )}
                                            </div>
                                          </ColumnMenu>
                                        </div>
                                        <span
                                          role="separator"
                                          aria-label={`ปรับความกว้าง ${c.name}`}
                                          aria-orientation="vertical"
                                          aria-valuenow={columnWidth(c.id)}
                                          aria-valuemin={80}
                                          aria-valuemax={800}
                                          tabIndex={0}
                                          className="column-resizer"
                                          draggable={false}
                                          onPointerDown={(e) => {
                                            if (busy) return;
                                            e.preventDefault();
                                            e.stopPropagation();
                                            const width = columnWidth(c.id);
                                            resizing.current = {
                                              id: c.id,
                                              start: e.clientX,
                                              width,
                                              last: width,
                                            };
                                            e.currentTarget.setPointerCapture(
                                              e.pointerId,
                                            );
                                          }}
                                          onPointerMove={(e) => {
                                            const active = resizing.current;
                                            if (!active || active.id !== c.id)
                                              return;
                                            const width = Math.round(
                                              Math.max(
                                                80,
                                                Math.min(
                                                  800,
                                                  active.width +
                                                    e.clientX -
                                                    active.start,
                                                ),
                                              ),
                                            );
                                            active.last = width;
                                            setDraftWidths((d) => ({
                                              ...d,
                                              [c.id]: width,
                                            }));
                                          }}
                                          onPointerUp={async (e) => {
                                            const active = resizing.current;
                                            if (!active || active.id !== c.id)
                                              return;
                                            resizing.current = null;
                                            if (
                                              e.currentTarget.hasPointerCapture(
                                                e.pointerId,
                                              )
                                            )
                                              e.currentTarget.releasePointerCapture(
                                                e.pointerId,
                                              );
                                            await saveLayout({
                                              ...layout,
                                              widths: {
                                                ...layout.widths,
                                                [c.id]: active.last,
                                              },
                                            });
                                            setDraftWidths({});
                                          }}
                                          onPointerCancel={() => {
                                            resizing.current = null;
                                            setDraftWidths({});
                                          }}
                                          onKeyDown={(e) => {
                                            if (
                                              busy ||
                                              ![
                                                "ArrowLeft",
                                                "ArrowRight",
                                              ].includes(e.key)
                                            )
                                              return;
                                            e.preventDefault();
                                            void saveLayout({
                                              ...layout,
                                              widths: {
                                                ...layout.widths,
                                                [c.id]: Math.max(
                                                  80,
                                                  Math.min(
                                                    800,
                                                    columnWidth(c.id) +
                                                      (e.key === "ArrowRight"
                                                        ? 10
                                                        : -10),
                                                  ),
                                                ),
                                              },
                                            });
                                          }}
                                        />
                                      </th>
                                    ))}
                                    <th>
                                      <button
                                        type="button"
                                        className="add-column-icon"
                                        aria-label={`เพิ่มคอลัมน์ในกลุ่ม ${group.label}`}
                                        title="เพิ่มคอลัมน์"
                                        disabled={!loaded || busy}
                                        onClick={() => {
                                          setEditingColumn(null);
                                          setColumnType("text");
                                          setModal("column");
                                        }}
                                      >
                                        <FiPlus size={20} />
                                      </button>
                                    </th>
                                  </tr>
                                </thead>
                                <tbody>
                                  {group.rows
                                    .filter((t) => !t.parent_id)
                                    .map((t, i) => (
                                      <Fragment key={t.id}>
                                        <tr
                                          key={t.id}
                                          data-task-id={t.id}
                                          data-subtask={
                                            !!t.parent_id || undefined
                                          }
                                          data-selected={
                                            selectedIds.includes(t.id) ||
                                            undefined
                                          }
                                          className={
                                            dragItem?.kind === "task" &&
                                            dragItem.id === t.id
                                              ? "is-dragging-task"
                                              : ""
                                          }
                                          data-row-drop={
                                            dropHint?.row === t.id
                                              ? dropHint.after
                                                ? "after"
                                                : "before"
                                              : undefined
                                          }
                                          onDragOver={(e) => {
                                            if (
                                              dragItem?.kind !== "task" ||
                                              busy
                                            )
                                              return;
                                            e.preventDefault();
                                            e.stopPropagation();
                                            const r =
                                              e.currentTarget.getBoundingClientRect();
                                            setDropHint({
                                              group: group.id,
                                              row: t.id,
                                              after:
                                                e.clientY >
                                                r.top + r.height / 2,
                                            });
                                          }}
                                          onDrop={(e) => {
                                            if (
                                              dragItem?.kind !== "task" ||
                                              busy
                                            )
                                              return;
                                            e.preventDefault();
                                            e.stopPropagation();
                                            if (dragItem.id === t.id) {
                                              clearBoardDrag();
                                              return;
                                            }
                                            void moveTask(
                                              dragItem.id,
                                              group.id,
                                              t.id,
                                              dropHint?.after,
                                            );
                                          }}
                                        >
                                          <td className="task-selection-cell">
                                            <input
                                              type="checkbox"
                                              className="task-checkbox"
                                              aria-label={`เลือกงาน ${t.name}`}
                                              checked={selectedIds.includes(
                                                t.id,
                                              )}
                                              disabled={busy}
                                              onChange={() =>
                                                toggleTasks([t.id])
                                              }
                                            />
                                          </td>
                                          <td className="text-[#a8b1c0]">
                                            <button
                                              type="button"
                                              className="task-drag-handle"
                                              draggable={!busy}
                                              disabled={busy}
                                              aria-label={`ลากย้ายงาน ${t.name}`}
                                              title="ลากเพื่อย้ายงาน · ลูกศรขึ้น/ลงเพื่อเรียง · Ctrl+ลูกศรเพื่อย้ายกลุ่ม"
                                              onDragStart={(e) => {
                                                e.stopPropagation();
                                                e.dataTransfer.effectAllowed =
                                                  "move";
                                                e.dataTransfer.setData(
                                                  "application/x-workly-task",
                                                  t.id,
                                                );
                                                setDragItem({
                                                  kind: "task",
                                                  id: t.id,
                                                });
                                              }}
                                              onDragEnd={clearBoardDrag}
                                              onKeyDown={(e) => {
                                                if (
                                                  ![
                                                    "ArrowUp",
                                                    "ArrowDown",
                                                  ].includes(e.key)
                                                )
                                                  return;
                                                e.preventDefault();
                                                const offset =
                                                  e.key === "ArrowDown"
                                                    ? 1
                                                    : -1;
                                                if (e.ctrlKey) {
                                                  const target =
                                                    groups[
                                                      groups.findIndex(
                                                        (g) =>
                                                          g.id === group.id,
                                                      ) + offset
                                                    ];
                                                  if (target)
                                                    void moveTask(
                                                      t.id,
                                                      target.id,
                                                    );
                                                } else {
                                                  const target =
                                                    group.rows.filter(
                                                      (t) => !t.parent_id,
                                                    )[i + offset];
                                                  if (target)
                                                    void moveTask(
                                                      t.id,
                                                      group.id,
                                                      target.id,
                                                      offset > 0,
                                                    );
                                                }
                                              }}
                                            >
                                              <span className="row-index">
                                                {String(i + 1).padStart(2, "0")}
                                              </span>
                                              <span className="row-grip">
                                                ⠿
                                              </span>
                                            </button>
                                          </td>

                                          {visibleColumns.map((c) => (
                                            <td key={c.id}>
                                              {c.id === "name" ? (
                                                <div className="task-tree-name">
                                                  {t.parent_id ? (
                                                    <span
                                                      className="subtask-branch"
                                                      aria-label="งานย่อย"
                                                    >
                                                      ↳
                                                    </span>
                                                  ) : (
                                                    <button
                                                      type="button"
                                                      className="subtask-toggle"
                                                      aria-label={`พับหรือขยายงานย่อย ${t.name}`}
                                                      aria-expanded={isSubtaskExpanded(
                                                        t.id,
                                                        group.tasks,
                                                        collapsedSubtasks,
                                                      )}
                                                      onClick={() =>
                                                        setCollapsedSubtasks(
                                                          (current) => ({
                                                            ...current,
                                                            [t.id]:
                                                              isSubtaskExpanded(
                                                                t.id,
                                                                group.tasks,
                                                                current,
                                                              ),
                                                          }),
                                                        )
                                                      }
                                                    >
                                                      <FiChevronRight
                                                        className={
                                                          isSubtaskExpanded(
                                                            t.id,
                                                            group.tasks,
                                                            collapsedSubtasks,
                                                          )
                                                            ? "expanded"
                                                            : ""
                                                        }
                                                      />
                                                    </button>
                                                  )}
                                                  {renderCell(t, c.id)}
                                                  {!t.parent_id && (
                                                    <>
                                                      {data.tasks.some(
                                                        (x) =>
                                                          x.parent_id === t.id,
                                                      ) && (
                                                        <span className="subtask-count">
                                                          {
                                                            data.tasks.filter(
                                                              (x) =>
                                                                x.parent_id ===
                                                                  t.id &&
                                                                x.status === 2,
                                                            ).length
                                                          }
                                                          /
                                                          {
                                                            data.tasks.filter(
                                                              (x) =>
                                                                x.parent_id ===
                                                                t.id,
                                                            ).length
                                                          }
                                                        </span>
                                                      )}
                                                    </>
                                                  )}
                                                </div>
                                              ) : (
                                                renderCell(t, c.id)
                                              )}
                                            </td>
                                          ))}
                                          <td>
                                            <button
                                              disabled={busy}
                                              aria-label={`แก้ไขงาน ${t.name}`}
                                              className="text-[#adb5c3]"
                                              onClick={() => {
                                                setEditing(t);
                                                setModal("task");
                                              }}
                                            >
                                              <FiChevronRight />
                                            </button>
                                          </td>
                                        </tr>
                                        {isSubtaskExpanded(
                                          t.id,
                                          group.tasks,
                                          collapsedSubtasks,
                                        ) && (
                                          <tr className="subtask-table-row">
                                            <td
                                              colSpan={
                                                visibleColumns.length + 3
                                              }
                                            >
                                              <SubtaskTable
                                                parent={t}
                                                tasks={group.tasks.filter(
                                                  (child) =>
                                                    child.parent_id === t.id,
                                                )}
                                                columns={visibleColumns.map(
                                                  (column) => ({
                                                    id: column.id,
                                                    name:
                                                      layout.overrides[
                                                        column.id
                                                      ]?.name || column.name,
                                                    width: columnWidth(
                                                      column.id,
                                                    ),
                                                  }),
                                                )}
                                                busy={busy}
                                                selected={selectedIds}
                                                onSelect={toggleTasks}
                                                renderCell={renderCell}
                                                onOpen={taskModal}
                                                onAdd={(name) =>
                                                  addSubtask(t, name)
                                                }
                                              />
                                            </td>
                                          </tr>
                                        )}
                                      </Fragment>
                                    ))}
                                  <tr className="group-add-row">
                                    <td className="task-selection-cell" />
                                    <td />

                                    <td colSpan={visibleColumns.length + 1}>
                                      <form
                                        className="quick-task-form"
                                        onSubmit={(e) => {
                                          e.preventDefault();
                                          void quickAddTask(group.id);
                                        }}
                                      >
                                        <input
                                          type="text"
                                          className="quick-task-input"
                                          aria-label={`เพิ่มงานในกลุ่ม ${group.label}`}
                                          placeholder="＋ เพิ่มงาน · พิมพ์แล้วกด Enter"
                                          value={quickTaskNames[group.id] || ""}
                                          maxLength={250}
                                          readOnly={busy || !loaded}
                                          onChange={(e) =>
                                            setQuickTaskNames((d) => ({
                                              ...d,
                                              [group.id]: e.target.value,
                                            }))
                                          }
                                          onKeyDown={(e) => {
                                            if (
                                              e.key === "Enter" &&
                                              e.nativeEvent.isComposing
                                            )
                                              e.preventDefault();
                                          }}
                                          autoComplete="off"
                                        />
                                      </form>
                                    </td>
                                  </tr>
                                  <tr className="group-summary-row">
                                    <td className="task-selection-cell" />
                                    <td />

                                    {visibleColumns.map((c) => (
                                      <td key={c.id}>
                                        <ColumnFooter
                                          label={
                                            layout.overrides[c.id]?.name ||
                                            c.name
                                          }
                                          type={columnTypeFor(c.id)}
                                          values={group.tasks.map((t) =>
                                            columnValue(t, c.id),
                                          )}
                                          config={
                                            layout.numberSummaries?.[c.id]
                                          }
                                          disabled={busy}
                                          onChange={(config) =>
                                            saveLayout({
                                              ...layoutRef.current,
                                              numberSummaries: {
                                                ...layoutRef.current
                                                  .numberSummaries,
                                                [c.id]: config,
                                              },
                                            })
                                          }
                                        />
                                      </td>
                                    ))}
                                    <td />
                                  </tr>
                                </tbody>
                              </table>
                              {!loaded && (
                                <div className="empty">
                                  {loaded
                                    ? "ไม่พบงานที่ตรงกับตัวกรอง"
                                    : "กำลังเตรียมพื้นที่ทำงาน…"}
                                </div>
                              )}
                            </div>
                          </>
                        )}
                      </section>
                    ))}
                    <div className="tablefoot">
                      <span>
                        แสดง {list.length} จาก {data.tasks.length} งาน
                      </span>
                    </div>
                  </div>
                </>
              )}
            </>
          )}
          <footer className="pagefooter">
            {busy && (
              <span className="inline-flex items-center gap-1">
                <FiLoader className="animate-spin" />
                กำลังบันทึก…
              </span>
            )}
            <span style={{ marginLeft: "auto" }}>
              Made for a more focused team. ✧
            </span>
          </footer>
        </div>
      </main>
      {selectedTasks.length > 0 && (
        <div
          className="task-selection-bar"
          role="toolbar"
          aria-label="จัดการงานที่เลือก"
        >
          <div className="selection-count">
            <strong>{selectedTasks.length}</strong>
            <span>งานที่เลือก</span>
          </div>
          <button
            type="button"
            disabled={busy}
            onClick={() => void bulkAction("duplicate")}
          >
            <FiCopy />
            <span>ทำสำเนา</span>
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={() => void bulkAction("archive")}
          >
            <FiArchive />
            <span>เก็บถาวร</span>
          </button>

          <AppSelect
            aria-label="ย้ายงานที่เลือกไปกลุ่ม"
            value=""
            disabled={busy}
            onChange={(group) => void moveSelected(group)}
          >
            <option value="">ย้ายไปกลุ่ม…</option>
            {groups.map((g) => (
              <option key={g.id} value={g.id}>
                {g.label}
              </option>
            ))}
          </AppSelect>
          <button
            type="button"
            className="bulk-delete-button"
            disabled={busy}
            onClick={() => setModal("bulk-delete")}
          >
            <FiTrash2 />
            <span>ลบงาน</span>
          </button>
          <button
            type="button"
            className="selection-close"
            aria-label="ยกเลิกการเลือกงานทั้งหมด"
            disabled={busy}
            onClick={() => setSelectedIds([])}
          >
            <FiX />
          </button>
        </div>
      )}
      <dialog
        ref={dialog}
        className={
          modal === "task"
            ? "task-edit-dialog"
            : modal === "column" || modal === "columnedit"
              ? "column-dialog"
              : undefined
        }
        onCancel={() => setModal(null)}
        onPointerDownCapture={(e) => {
          const rect = e.currentTarget.getBoundingClientRect();
          dialogPointerStart.current = {
            x: e.clientX,
            y: e.clientY,
            outside:
              e.target === e.currentTarget &&
              (e.clientX < rect.left ||
                e.clientX > rect.right ||
                e.clientY < rect.top ||
                e.clientY > rect.bottom),
          };
        }}
        onPointerCancel={() => {
          dialogPointerStart.current = null;
        }}
        onClick={(e) => {
          const start = dialogPointerStart.current;
          dialogPointerStart.current = null;
          if (e.target !== e.currentTarget || !start?.outside) return;
          const rect = e.currentTarget.getBoundingClientRect();
          const outside =
            e.clientX < rect.left ||
            e.clientX > rect.right ||
            e.clientY < rect.top ||
            e.clientY > rect.bottom;
          if (
            outside &&
            Math.hypot(e.clientX - start.x, e.clientY - start.y) < 6
          )
            setModal(null);
        }}
      >
        {modal === "group-action" && groupAction && (
          <div className="group-action-confirm">
            <h2>
              {groupAction.action === "archive"
                ? "เก็บถาวรกลุ่ม"
                : "ลบกลุ่มถาวร"}{" "}
              “
              {layout.groupNames?.[groupAction.id] ||
                groupDefinitions.find((g) => g.id === groupAction.id)?.name}
              ”
            </h2>
            <p>
              {groupAction.action === "archive"
                ? "เก็บกลุ่มและงานไว้ในหน้าเก็บถาวร พร้อมกู้คืนภายหลัง"
                : "ลบงานที่อยู่ในกลุ่มนี้ถาวร รวมถึงไฟล์แนบและอัปเดต ไม่สามารถกู้คืนได้"}
            </p>
            <strong>
              {
                data.tasks.filter(
                  (t) =>
                    (t.group_id || (t.status === 2 ? "done" : "todo")) ===
                    groupAction.id,
                ).length
              }{" "}
              งานทั้งหมดในกลุ่ม
            </strong>
            <div className="dialogactions">
              <button
                type="button"
                className="secondary"
                disabled={busy}
                onClick={() => setModal(null)}
              >
                ยกเลิก
              </button>
              <button
                type="button"
                className={
                  groupAction.action === "delete" ? "danger" : "primary"
                }
                disabled={busy}
                onClick={() =>
                  void mutate(async () => {
                    try {
                      await api("/api/groups", "PATCH", {
                        ...groupAction,
                        expectedCount: data.tasks.filter(
                          (t) =>
                            (t.group_id ||
                              (t.status === 2 ? "done" : "todo")) ===
                            groupAction.id,
                        ).length,
                      });
                    } finally {
                      setData(await api<Workspace>("/api/workspace"));
                    }
                    setModal(null);
                    setGroupAction(null);
                    setSelectedIds([]);
                    toast(
                      groupAction.action === "archive"
                        ? "เก็บถาวรกลุ่มแล้ว"
                        : "ลบกลุ่มแล้ว",
                    );
                  })
                }
              >
                {groupAction.action === "archive"
                  ? "เก็บถาวรกลุ่ม"
                  : "ลบกลุ่มและงานถาวร"}
              </button>
            </div>
          </div>
        )}
        {modal === "column-delete" && editingColumn && (
          <div className="column-delete-confirm">
            <h2>ลบคอลัมน์ “{editingColumn.name}” ถาวร?</h2>
            <p>
              ข้อมูลและไฟล์ในคอลัมน์นี้จะถูกลบจากทุกงาน รวมถึงงานที่เก็บถาวร
              และไม่สามารถกู้คืนได้
            </p>
            <div className="dialogactions">
              <button
                type="button"
                className="secondary"
                disabled={busy}
                onClick={() => setModal(null)}
              >
                ยกเลิก
              </button>
              <button
                type="button"
                className="danger"
                disabled={busy}
                onClick={() =>
                  void mutate(async () => {
                    await api("/api/columns", "DELETE", {
                      id: editingColumn.id,
                    });
                    setData(await api<Workspace>("/api/workspace"));
                    const clean = (filter: TaskFilters["advanced"]) => ({
                      ...filter,
                      groups: filter.groups
                        .map((g) => ({
                          ...g,
                          rules: g.rules.filter(
                            (r) => r.column !== editingColumn.id,
                          ),
                        }))
                        .filter((g) => g.rules.length),
                    });
                    setAdvanced((current) => ({
                      quick: clean(current.quick),
                      advanced: clean(current.advanced),
                    }));
                    setModal(null);
                    setEditingColumn(null);
                    toast("ลบคอลัมน์ถาวรแล้ว");
                  })
                }
              >
                ลบคอลัมน์และข้อมูลถาวร
              </button>
            </div>
          </div>
        )}
        {modal === "group" && (
          <form
            onSubmit={(e) => {
              e.preventDefault();
              const f = new FormData(e.currentTarget);
              void mutate(async () => {
                const group = await api<WorkGroup>("/api/groups", "POST", {
                  name: String(f.get("name")).trim(),
                  color: String(f.get("color")),
                });
                setData((d) => ({
                  ...d,
                  groups: [...(d.groups || []), group],
                }));
                setModal(null);
                toast("เพิ่มกลุ่มใหม่แล้ว");
              });
            }}
          >
            <h2>เพิ่มกลุ่มใหม่</h2>
            <label htmlFor="group-name">ชื่อกลุ่ม</label>
            <input
              id="group-name"
              name="name"
              required
              autoFocus
              maxLength={60}
              placeholder="เช่น งานประจำสัปดาห์"
            />
            <label htmlFor="group-color">สีกลุ่ม</label>
            <input name="color" type="hidden" value={newGroupColor} />
            <div
              className="group-palette"
              role="group"
              aria-label="สีสำเร็จรูป"
            >
              {[
                "#7197d0",
                "#64aa91",
                "#a18bc8",
                "#c77f8c",
                "#bd9a61",
                "#bd84b3",
              ].map((color, i) => (
                <button
                  type="button"
                  key={color}
                  className="palette-swatch"
                  aria-label={`สีสำเร็จรูป ${i + 1}`}
                  aria-pressed={newGroupColor === color}
                  style={{ backgroundColor: color }}
                  onClick={() => setNewGroupColor(color)}
                >
                  {newGroupColor === color ? "✓" : ""}
                </button>
              ))}
            </div>
            <div className="group-color-preview">
              <span
                className="color-preview-swatch"
                style={{ backgroundColor: newGroupColor }}
              />
              <span>
                สีที่เลือก <strong>{newGroupColor.toUpperCase()}</strong>
              </span>
              <div className="custom-color-label">
                เลือกสีอื่น
                <ColorPicker
                  id="group-color"
                  value={newGroupColor}
                  onChange={(value) => setNewGroupColor(value)}
                />
              </div>
            </div>
            <div className="dialogactions">
              <button
                type="button"
                className="secondary"
                onClick={() => setModal(null)}
              >
                ยกเลิก
              </button>
              <button disabled={busy} className="primary">
                เพิ่มกลุ่ม
              </button>
            </div>
          </form>
        )}
        {modal === "task" && (
          <TaskEditor
            memberDirectory={members}
            parentTask={data.tasks.find(
              (t) => t.id === (editing?.parent_id || newTaskParent),
            )}
            subtasks={
              editing
                ? data.tasks.filter((t) => t.parent_id === editing.id)
                : []
            }
            onOpenTask={taskModal}
            onEditOption={editOption}
            group={taskGroupInfo(
              editing || { group_id: newTaskGroup, status: newTaskStatus },
              data.groups || [],
              layout,
            )}
            key={editing?.id || "new"}
            task={
              editing || {
                id: "",
                name: "",
                assignees: [],
                person: -1,
                status: newTaskStatus,
                date: "",
                priority: "",
                project: "",
                hours: null,
                custom: {},
                group_id: newTaskGroup,
                parent_id: newTaskParent,
              }
            }
            columns={data.columns}
            layout={layout}
            people={people}
            attachments={data.attachments}
            busy={busy}
            projects={projectNames}
            onPreview={setPreviewFile}
            onCancel={() => setModal(null)}
            onDelete={
              editing
                ? () => {
                    void deleteTask(editing);
                  }
                : undefined
            }
            onSave={(body) => {
              void mutate(async () => {
                const result = await api<Task>(
                  "/api/tasks",
                  editing ? "PATCH" : "POST",
                  body,
                );
                setData((d) => ({
                  ...d,
                  tasks: editing
                    ? d.tasks.map((t) => (t.id === result.id ? result : t))
                    : [...d.tasks, result],
                }));
                setModal(null);
                toast("บันทึกงานเรียบร้อย");
              });
            }}
          />
        )}
        {(modal === "column" || modal === "columnedit") && (
          <form
            onSubmit={(e) => {
              e.preventDefault();
              const f = new FormData(e.currentTarget);
              if (editingColumn) {
                const options = String(f.get("options") || "")
                  .split(/\r?\n/)
                  .map((s) => s.trim())
                  .filter(Boolean);
                if (
                  (columnType === "multiselect" || columnType === "select") &&
                  !options.length
                ) {
                  toast("กรุณาระบุตัวเลือก");
                  return;
                }
                void saveLayout(
                  {
                    ...layout,
                    overrides: {
                      ...layout.overrides,
                      [editingColumn.id]: {
                        id: editingColumn.id,
                        name: String(f.get("name")).trim(),
                        type: columnType,
                        options,
                      },
                    },
                  },
                  async () => {
                    setData(await api<Workspace>("/api/workspace"));
                    setModal(null);
                    toast("บันทึกคอลัมน์แล้ว");
                  },
                );
                return;
              }
              mutate(async () => {
                const col = await api<CustomColumn>("/api/columns", "POST", {
                  name: f.get("name"),
                  type: f.get("type"),
                  options: String(f.get("options") || "")
                    .split(/\r?\n/)
                    .map((s) => s.trim())
                    .filter(Boolean),
                });
                setData((d) => ({ ...d, columns: [...d.columns, col] }));
                setModal(null);
                toast("เพิ่มคอลัมน์แล้ว เลื่อนตารางไปทางขวาเพื่อแก้ไข");
              });
            }}
          >
            <h2>{editingColumn ? "แก้ไขคอลัมน์" : "เพิ่มคอลัมน์ใหม่"}</h2>
            <p>
              {editingColumn
                ? "เปลี่ยนการแสดงผลของคอลัมน์ โดยเก็บค่าต้นฉบับไว้ สามารถคืนค่าไทป์เดิมได้"
                : "ปรับตารางให้เหมาะกับวิธีทำงานของทีม"}
            </p>
            <label htmlFor="colname">ชื่อคอลัมน์</label>
            <input
              id="colname"
              name="name"
              autoFocus
              maxLength={100}
              required
              defaultValue={editingColumn?.name || ""}
              placeholder="เช่น งบประมาณ หรือ ลิงก์ไฟล์"
            />
            <label htmlFor="coltype">ประเภทข้อมูล</label>
            <AppSelect
              id="coltype"
              name="type"
              value={columnType}
              onChange={(value) => setColumnType(value as ColumnType)}
            >
              {[
                ["text", "Aa — Text / ข้อความ"],
                ["member", "Member / สมาชิก"],
                ["number", "123 — Number / ตัวเลข"],
                ["status", "Status / สถานะ"],
                ["date", "Date / วันที่"],
                ["checkbox", "Checkbox / เช็กบ็อกซ์"],
                ["url", "URL / ลิงก์"],
                ["email", "Email / อีเมล"],
                ["multiselect", "Multi-select / หลายตัวเลือก"],
                ["select", "Select / เลือกหนึ่งตัวเลือก"],
                ["files", "Files / ไฟล์แนบ"],
                ["timeline", "Timeline / ช่วงเวลา"],
              ].map(([v, n]) => (
                <option key={v} value={v}>
                  {n}
                </option>
              ))}
            </AppSelect>
            {(columnType === "multiselect" || columnType === "select") && (
              <>
                <label htmlFor="coloptions">
                  ตัวเลือก (พิมพ์แล้วกด Enter เพื่อเพิ่มเป็นแท็ก)
                </label>
                <OptionTagsEditor
                  key={editingColumn?.id || "new"}
                  initial={editingColumn?.options || []}
                />
                <p className="mt-2!">
                  {columnType === "select"
                    ? "เลือกได้หนึ่งค่าต่อช่อง"
                    : "เลือกหลายค่าและแสดงเป็นแท็กได้"}
                </p>
              </>
            )}
            <div className="dialogactions">
              <button
                disabled={busy}
                type="button"
                className="secondary"
                onClick={() => setModal(null)}
              >
                ยกเลิก
              </button>
              <button disabled={busy} className="primary">
                {editingColumn ? "บันทึกการเปลี่ยนแปลง" : "เพิ่มคอลัมน์"}
              </button>
            </div>
          </form>
        )}

        {modal === "bulk-delete" && (
          <div>
            <h2>ลบงานที่เลือก {selectedTasks.length} งาน?</h2>
            <p>
              งานที่เลือกและงานย่อยทั้งหมด รวมงานย่อยที่เก็บถาวร
              พร้อมไฟล์แนบและอัปเดต จะถูกลบถาวร
            </p>
            <ul className="bulk-delete-list">
              {selectedTasks.map((t) => (
                <li key={t.id}>{t.name}</li>
              ))}
            </ul>
            <div className="dialogactions">
              <button
                type="button"
                disabled={busy}
                onClick={() => setModal(null)}
              >
                ยกเลิก
              </button>
              <button
                type="button"
                className="danger-button"
                disabled={busy || !selectedTasks.length}
                onClick={() => void deleteSelected()}
              >
                {busy ? "กำลังลบ…" : "ยืนยันลบงานที่เลือก"}
              </button>
            </div>
          </div>
        )}
        {modal === "images" && imageTask && (
          <div>
            <div className="flex items-center justify-between">
              <h2 className="mb-0!">ไฟล์แนบของงาน</h2>
              <button aria-label="ปิด" onClick={() => setModal(null)}>
                <FiX />
              </button>
            </div>
            <p className="my-3!">{imageTask.name}</p>
            <label
              className={`uploadbox ${busy ? "pointer-events-none opacity-50" : ""}`}
            >
              <FiUploadCloud size={28} />
              <strong>
                {busy ? "กำลังอัปโหลด…" : "เลือกไฟล์เพื่ออัปโหลด"}
              </strong>
              <span>รูปภาพ / PDF / TXT / Office · ไม่เกิน 2 MB ต่อไฟล์</span>
              <input
                className="hidden"
                type="file"
                accept={fileAccept}
                multiple
                disabled={busy}
                onChange={(e) => {
                  const files = Array.from(e.target.files || []);
                  if (!files.length) return;
                  if (files.some((file) => file.size > MAX_FILE_SIZE)) {
                    toast("ไฟล์ต้องมีขนาดไม่เกิน 2 MB ต่อไฟล์");
                    e.target.value = "";
                    return;
                  }
                  void mutate(async () => {
                    for (const file of files) {
                      const form = new FormData();
                      form.set("file", file);
                      form.set("taskId", imageTask.id);
                      form.set("columnId", activeFileColumn);
                      const attachment = await api<Attachment>(
                        "/api/files",
                        "POST",
                        form,
                      );
                      setData((d) => ({
                        ...d,
                        attachments: [...d.attachments, attachment],
                      }));
                    }
                    toast("อัปโหลดไฟล์ไปยัง R2 แล้ว");
                  });
                  e.target.value = "";
                }}
              />
            </label>
            <div className="mt-4 grid! grid-cols-2! gap-3! mb-0!">
              {data.attachments
                .filter((a) => fileMatches(a, imageTask.id, activeFileColumn))
                .map((a) => (
                  <div
                    key={a.id}
                    className="overflow-hidden rounded-lg border border-[#262d3b]"
                  >
                    {a.content_type.startsWith("image/") ? (
                      <button
                        type="button"
                        className="attachment-image"
                        aria-label={`ดูรูป ${a.name}`}
                        onClick={() => setPreviewFile(a)}
                      >
                        <Image
                          unoptimized
                          src={a.url || `/api/files/${a.id}`}
                          alt={a.name}
                          width={180}
                          height={130}
                          className="h-28 w-full object-cover"
                        />
                      </button>
                    ) : (
                      <a
                        href={`/api/files/${a.id}`}
                        className="attachment-document"
                        download={a.name}
                      >
                        <FiFile size={30} />
                        <span>ดาวน์โหลดไฟล์</span>
                      </a>
                    )}
                    <div className="flex items-center justify-between gap-2 p-2">
                      <span className="truncate text-[10px]">{a.name}</span>
                      <button
                        aria-label={`ลบรูป ${a.name}`}
                        disabled={busy}
                        onClick={() =>
                          mutate(async () => {
                            await api(`/api/images/${a.id}`, "DELETE");
                            setData((d) => ({
                              ...d,
                              attachments: d.attachments.filter(
                                (x) => x.id !== a.id,
                              ),
                            }));
                          })
                        }
                      >
                        <FiTrash2 size={12} />
                      </button>
                    </div>
                  </div>
                ))}
            </div>
            {!data.attachments.some((a) =>
              fileMatches(a, imageTask.id, activeFileColumn),
            ) && <p className="my-5! text-center">ยังไม่มีไฟล์แนบในช่องนี้</p>}
          </div>
        )}
      </dialog>
      {optionEdit && (
        <OptionEditor
          key={`${optionEdit.columnId}:${optionEdit.value}`}
          value={optionEdit.value}
          color={optionEdit.color}
          onCancel={() => setOptionEdit(null)}
          onSave={async (value, color) => {
            await api("/api/options", "PATCH", {
              columnId: optionEdit.columnId,
              oldValue: optionEdit.value,
              value,
              color,
            });
            const workspace = await api<Workspace>("/api/workspace");
            setData(workspace);
            if (value !== optionEdit.value) {
              optionEdit.onRename?.(value);
              const rename = (filter: TaskFilters["advanced"]) => ({
                ...filter,
                groups: filter.groups.map((group) => ({
                  ...group,
                  rules: group.rules.map((rule) =>
                    rule.column === optionEdit.columnId &&
                    rule.value === optionEdit.value
                      ? {
                          ...rule,
                          value,
                          id: rule.id.startsWith("quick:")
                            ? `quick:${rule.column}:${value}`
                            : rule.id,
                        }
                      : rule,
                  ),
                })),
              });
              setAdvanced((current) => ({
                advanced: rename(current.advanced),
                quick: rename(current.quick),
              }));
            }
          }}
        />
      )}
      {previewFile && (
        <ImageViewer
          key={previewFile.id}
          file={previewFile}
          onClose={() => setPreviewFile(null)}
        />
      )}
      {notice && (
        <div id="toast" role="status" style={{ display: "block" }}>
          {notice}
        </div>
      )}
    </>
  );
}

function ColumnMenu({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  const id = useId();
  const popup = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const [position, setPosition] = useState({ left: 0, top: 0 });
  useEffect(() => {
    if (!open) return;
    const close = (event: Event) => {
      if (event.target instanceof Node && popup.current?.contains(event.target))
        return;
      popup.current?.hidePopover();
    };
    window.addEventListener("scroll", close, true);
    window.addEventListener("resize", close);
    return () => {
      window.removeEventListener("scroll", close, true);
      window.removeEventListener("resize", close);
    };
  }, [open]);
  return (
    <div className="column-menu">
      <button
        type="button"
        className="column-menu-trigger"
        popoverTarget={id}
        aria-label={label}
        aria-expanded={open}
        aria-controls={id}
        onClick={(e) => {
          const rect = e.currentTarget.getBoundingClientRect();
          setPosition({
            left: Math.max(
              8,
              Math.min(rect.right - 210, window.innerWidth - 218),
            ),
            top:
              rect.bottom + 232 > window.innerHeight
                ? Math.max(8, rect.top - 230)
                : rect.bottom + 8,
          });
        }}
      >
        ⋯
      </button>
      <div
        id={id}
        ref={popup}
        popover="auto"
        className="column-popup"
        style={position}
        onToggle={(e) => setOpen(e.newState === "open")}
        onClick={(e) => {
          if ((e.target as HTMLElement).closest("button"))
            popup.current?.hidePopover();
        }}
      >
        {children}
      </div>
    </div>
  );
}

function CustomCell({
  column: c,
  task: t,
  busy,
  update,
  editOptions,
  numberConfig,
  colors,
  editOption,
  members = [],
}: {
  column: CustomColumn;
  task: Task;
  busy: boolean;
  update: (task: Task) => Promise<void>;
  editOptions?: () => void;
  numberConfig?: NumberSummaryConfig;
  colors?: Record<string, string>;
  editOption?: (value: string) => void;
  members?: NonNullable<Workspace["members"]>;
}) {
  const val = t.custom[c.id] ?? "";
  const set = (value: string | boolean | string[]) =>
    update({ ...t, custom: { ...t.custom, [c.id]: value } });
  if (c.type === "member")
    return (
      <MultiChoice
        label={c.name}
        options={members.map((m) => m.name)}
        optionValues={members.map((m) => String(m.id))}
        selected={memberIds(val).filter((id) =>
          members.some((m) => String(m.id) === id),
        )}
        avatarUrls={Object.fromEntries(
          members.map((m) => [String(m.id), m.avatarUrl]),
        )}
        avatars
        disabled={busy}
        onChange={set}
      />
    );
  if (c.type === "number")
    return (
      <NumberCell
        label={c.name}
        value={typeof val === "string" ? val : null}
        disabled={busy}
        config={numberConfig}
        onChange={(value) => set(value === null ? "" : String(value))}
      />
    );
  if (c.type === "select" || c.type === "multiselect")
    return (
      <MultiChoice
        label={c.name}
        options={c.options || []}
        selected={
          c.type === "select"
            ? typeof val === "string" && val
              ? [val]
              : []
            : Array.isArray(val)
              ? val
              : []
        }
        disabled={busy}
        single={c.type === "select"}
        onChange={(values) =>
          set(c.type === "select" ? values[0] || "" : values)
        }
        onEditOptions={editOptions}
        onEditOption={editOption}
        colors={colors}
      />
    );
  if (c.type === "status")
    return (
      <AppSelect
        disabled={busy}
        aria-label={c.name}
        className={`badge ${statusClasses[statuses.indexOf(String(val))] || ""}`}
        value={String(val)}
        onChange={(value) => set(value)}
      >
        <option value="">เลือกสถานะ</option>
        {statuses.map((s) => (
          <option key={s}>{s}</option>
        ))}
      </AppSelect>
    );
  if (c.type === "timeline")
    return (
      <TimelinePicker
        label={`${c.name} ${t.name}`}
        value={val}
        disabled={busy}
        onChange={(value) => void set(value)}
      />
    );
  if (c.type === "date")
    return (
      <DatePicker
        aria-label={c.name}
        disabled={busy}
        value={String(val)}
        onChange={(value) => set(value)}
      />
    );
  if (c.type === "checkbox")
    return (
      <input
        aria-label={c.name}
        disabled={busy}
        type="checkbox"
        checked={val === true}
        onChange={(e) => set(e.target.checked)}
      />
    );
  return (
    <input
      key={`${t.id}-${c.id}-${val}`}
      aria-label={c.name}
      disabled={busy}
      type={c.type as ColumnType}
      defaultValue={String(val)}
      onBlur={(e) => {
        if (e.target.checkValidity() && e.target.value !== val)
          set(e.target.value);
        else if (!e.target.checkValidity()) e.target.reportValidity();
      }}
    />
  );
}

function NumberCell({
  label,
  value,
  disabled,
  config = defaultNumberSummary,
  onChange,
}: {
  label: string;
  value: number | string | null;
  disabled: boolean;
  config?: NumberSummaryConfig;
  onChange: (value: number | null) => void;
}) {
  return (
    <div className="number-cell">
      {config.unit && config.position === "left" && (
        <span className="number-unit">{config.unit}</span>
      )}
      <input
        key={String(value)}
        type="number"
        step="any"
        aria-label={label}
        disabled={disabled}
        defaultValue={value ?? ""}
        onBlur={(e) => {
          const next = e.target.value === "" ? null : Number(e.target.value);
          if (
            e.target.checkValidity() &&
            next !== (value === "" || value === null ? null : Number(value))
          )
            onChange(next);
        }}
      />
      {config.unit && config.position === "right" && (
        <span className="number-unit">{config.unit}</span>
      )}
    </div>
  );
}
