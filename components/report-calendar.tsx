"use client";
import { useState } from "react";
import { FiCalendar, FiChevronLeft, FiChevronRight } from "react-icons/fi";
import {
  monthGrid,
  monthNames,
  parseDay,
  parseRange,
  rangeLabel,
  todayKey,
  weekdayNames,
  weekSegments,
  type CalendarEvent,
} from "@/lib/timeline";
import type { Task, CustomColumn, Attachment } from "@/lib/types";
import type { BoardLayout } from "@/lib/board";
import AppSelect from "./app-select";
import CalendarDisplayMenu from "./calendar-display-menu";
import { calendarColumns, calendarFieldValue } from "@/lib/calendar-display";
import { timelineDefinitions, type CalendarMonth } from "@/lib/timeline-events";
import TaskDetailsDrawer from "./task-details-drawer";
import type { WorkGroup } from "@/lib/types";
type Props = {
  tasks: Task[];
  columns: CustomColumn[];
  layout: BoardLayout;
  people: string[];
  attachments?: Attachment[];
  disabled?: boolean;
  onFieldsChange?: (fields: string[]) => void;
  month?: CalendarMonth;
  onMonthChange?: (month: CalendarMonth) => void;
  activeColumn?: string;
  onColumnChange?: (column: string) => void;
  groups?: WorkGroup[];
};
export default function ReportCalendar({
  tasks,
  columns,
  layout,
  people,
  attachments = [],
  disabled = false,
  onFieldsChange = () => {},
  month: controlledMonth,
  onMonthChange,
  activeColumn,
  onColumnChange,
  groups = [],
}: Props) {
  const today = todayKey(),
    now = parseDay(today)!,
    [localMonth, setLocalMonth] = useState({
      year: now.getUTCFullYear(),
      month: now.getUTCMonth(),
    }),
    [localColumn, setLocalColumn] = useState("*"),
    [detail, setDetail] = useState<CalendarEvent | null>(null);
  const month = controlledMonth || localMonth,
    column = activeColumn ?? localColumn;
  function setMonth(next: CalendarMonth) {
    if (onMonthChange) onMonthChange(next);
    else setLocalMonth(next);
    setDetail(null);
  }
  function setColumn(next: string) {
    if (onColumnChange) onColumnChange(next);
    else setLocalColumn(next);
    setDetail(null);
  }
  const displayOptions = calendarColumns(columns, layout),
    selectedFields = (layout.calendarFields || ["name"]).filter((id) =>
      displayOptions.some((o) => o.id === id),
    ),
    displayFields = selectedFields.length ? selectedFields : ["name"],
    taskMap = new Map(tasks.map((t) => [t.id, t])),
    eventHeight = 25;
  function labels(event: CalendarEvent) {
    const task = taskMap.get(event.taskId);
    const values = displayFields.map((id) => ({
      label: displayOptions.find((o) => o.id === id)?.name || id,
      value: task
        ? calendarFieldValue(task, id, columns, layout, people, attachments)
        : "",
    }));
    return {
      primary: values[0].value || `${values[0].label}: ไม่ระบุ`,
      secondary: values
        .slice(1)
        .map((v) => v.value || "—")
        .join(" | "),
    };
  }
  const definitions = timelineDefinitions(columns, layout);
  const events: CalendarEvent[] = tasks.flatMap((t) =>
    definitions
      .filter((c) => column === "*" || column === c.id)
      .flatMap((c) => {
        const range = parseRange(t.custom[c.key]);
        return range
          ? [
              {
                id: t.id + ":" + c.id,
                taskId: t.id,
                name: t.name,
                column: c.name,
                start: range[0],
                end: range[1],
                status: t.status,
                assignees: t.assignees.map((id) => people[id]).filter(Boolean),
              },
            ]
          : [];
      }),
  );
  const days = monthGrid(month.year, month.month),
    weeks = Array.from({ length: days.length / 7 }, (_, i) =>
      days.slice(i * 7, i * 7 + 7),
    ),
    first = `${month.year}-${String(month.month + 1).padStart(2, "0")}-01`,
    last = monthGrid(month.year, month.month)
      .filter((d) => d.startsWith(first.slice(0, 7)))
      .at(-1)!;
  const shown = events.filter((e) => e.start <= last && e.end >= first);
  function move(offset: number) {
    const d = new Date(Date.UTC(month.year, month.month + offset, 1));
    setMonth({ year: d.getUTCFullYear(), month: d.getUTCMonth() });
  }
  return (
    <section
      className="report-calendar card"
      aria-label="ปฏิทิน Timeline รายเดือน"
    >
      <header className="report-calendar-header">
        <div>
          <h2>
            <FiCalendar />
            ปฏิทินงาน
          </h2>
          <p>เชื่อมจากคอลัมน์ Timeline · วันจันทร์–วันอาทิตย์</p>
        </div>
        <div className="report-calendar-controls">
          {definitions.length > 0 && (
            <AppSelect
              aria-label="คอลัมน์ Timeline บนปฏิทิน"
              value={column}
              onChange={setColumn}
            >
              <option value="*">ทุก Timeline</option>
              {definitions.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </AppSelect>
          )}
          <button
            type="button"
            onClick={() =>
              setMonth({ year: now.getUTCFullYear(), month: now.getUTCMonth() })
            }
          >
            เดือนนี้
          </button>
          <div className="report-month-nav">
            <button
              type="button"
              aria-label="ปฏิทิน เดือนก่อนหน้า"
              onClick={() => move(-1)}
            >
              <FiChevronLeft />
            </button>
            <strong aria-live="polite">
              {monthNames[month.month]} {month.year}
            </strong>
            <button
              type="button"
              aria-label="ปฏิทิน เดือนถัดไป"
              onClick={() => move(1)}
            >
              <FiChevronRight />
            </button>
          </div>
          <CalendarDisplayMenu
            options={displayOptions}
            selected={displayFields}
            disabled={disabled}
            onChange={onFieldsChange}
          />
        </div>
      </header>
      <div className="report-calendar-caption">
        <span>{new Set(shown.map((e) => e.taskId)).size} งานในเดือนนี้</span>
        <span>ใช้ตัวกรองเดียวกับสรุปผลงาน</span>
      </div>
      <div className="report-calendar-scroll">
        <div className="report-calendar-grid">
          <div className="report-weekdays">
            {weekdayNames.map((day) => (
              <span key={day}>{day}</span>
            ))}
          </div>
          {weeks.map((week) => {
            const { segments, laneCount } = weekSegments(week, events);
            return (
              <div
                key={week[0]}
                className="report-calendar-week"
                style={{
                  minHeight: `calc(${Math.max(
                    120,
                    38 + laneCount * (eventHeight + 4) + 12,
                  )}px * var(--ui-font-scale, 1))`,
                }}
              >
                <div className="report-day-backgrounds">
                  {week.map((day) => (
                    <div
                      key={day}
                      className={
                        day.slice(0, 7) !== first.slice(0, 7) ? "outside" : ""
                      }
                    >
                      <time
                        dateTime={day}
                        className={day === today ? "today" : ""}
                      >
                        {Number(day.slice(8))}
                      </time>
                    </div>
                  ))}
                </div>
                <div
                  className="report-event-lanes"
                  style={{
                    gridTemplateRows: `repeat(${Math.max(1, laneCount)},calc(${eventHeight}px * var(--ui-font-scale, 1)))`,
                  }}
                >
                  {segments.map(
                    ({
                      event,
                      start,
                      span,
                      lane,
                      continuesBefore,
                      continuesAfter,
                    }) => (
                      <button
                        key={event.id}
                        type="button"
                        className={`report-calendar-event event-status-${event.status}`}
                        style={{
                          gridColumn: `${start + 1} / span ${span}`,
                          gridRow: lane + 1,
                          borderTopLeftRadius: continuesBefore ? 0 : 5,
                          borderBottomLeftRadius: continuesBefore ? 0 : 5,
                          borderTopRightRadius: continuesAfter ? 0 : 5,
                          borderBottomRightRadius: continuesAfter ? 0 : 5,
                        }}
                        title={`${labels(event).primary}${labels(event).secondary ? "\n" + labels(event).secondary : ""}\n${event.column}: ${rangeLabel([event.start, event.end])}`}
                        aria-label={`${event.name} ${rangeLabel([event.start, event.end])}`}
                        onClick={() => setDetail(event)}
                      >
                        <strong>
                          {labels(event).primary}
                          {labels(event).secondary
                            ? ` | ${labels(event).secondary}`
                            : ""}
                        </strong>
                      </button>
                    ),
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>
      {!definitions.length ? (
        <p className="report-calendar-empty">
          เพิ่มคอลัมน์ Timeline ในตารางงาน
          แล้วเลือกช่วงวันเริ่ม–สิ้นสุดเพื่อแสดงงานที่นี่
        </p>
      ) : (
        !shown.length && (
          <p className="report-calendar-empty">
            ไม่มีงาน Timeline ในเดือนนี้ที่ตรงกับตัวกรอง
          </p>
        )
      )}
      {detail && taskMap.has(detail.taskId) && (
        <TaskDetailsDrawer
          groups={groups}
          key={detail.taskId}
          task={taskMap.get(detail.taskId)!}
          columns={columns}
          layout={layout}
          people={people}
          attachments={attachments}
          onClose={() => setDetail(null)}
        />
      )}
    </section>
  );
}
