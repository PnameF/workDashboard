"use client";
import { useId, useRef, useState } from "react";
import { FiCalendar, FiChevronLeft, FiChevronRight } from "react-icons/fi";
import {
  monthGrid,
  monthNames,
  parseRange,
  parseDay,
  rangeLabel,
  rangeDuration,
  todayKey,
  addDays,
} from "@/lib/timeline";
import { useFloatingPanel } from "./floating-panel";
export default function TimelinePicker({
  label,
  value,
  disabled,
  onChange,
}: {
  label: string;
  value: unknown;
  disabled: boolean;
  onChange: (value: string[]) => void;
}) {
  const id = useId(),
    trigger = useRef<HTMLButtonElement>(null),
    range = parseRange(value),
    today = todayKey(),
    initial = parseDay(range?.[0] || today)!;
  const [start, setStart] = useState(range?.[0] || ""),
    [end, setEnd] = useState(range?.[1] || ""),
    [hover, setHover] = useState(""),
    [month, setMonth] = useState({
      year: initial.getUTCFullYear(),
      month: initial.getUTCMonth(),
    });
  const { popup, open, position, place, onToggle } = useFloatingPanel(340),
    days = monthGrid(month.year, month.month),
    previewEnd = end || hover;
  const duration = range ? rangeDuration(range) : null;

  function move(offset: number) {
    const date = new Date(Date.UTC(month.year, month.month + offset, 1));
    setMonth({ year: date.getUTCFullYear(), month: date.getUTCMonth() });
  }
  function pick(day: string) {
    if (!start || end) {
      setStart(day);
      setEnd("");
      setHover("");
    } else {
      setStart(day < start ? day : start);
      setEnd(day < start ? start : day);
      setHover("");
    }
  }
  function finish(values: string[]) {
    onChange(values);
    popup.current?.hidePopover();
    trigger.current?.focus({ preventScroll: true });
  }
  return (
    <>
      <button
        type="button"
        ref={trigger}
        className={`timeline-trigger ${range ? "has-range" : ""}`}
        aria-label={label}
        aria-haspopup="dialog"
        aria-expanded={open}
        popoverTarget={id}
        disabled={disabled}
        onClick={(e) => {
          const date = parseDay(range?.[0] || today)!;
          setMonth({ year: date.getUTCFullYear(), month: date.getUTCMonth() });
          setStart(range?.[0] || "");
          setEnd(range?.[1] || "");
          setHover("");
          place(e.currentTarget, 440);
        }}
      >
        <span className="timeline-date-display">
          <FiCalendar />
          <span>{range ? rangeLabel(range) : "เลือกช่วงเวลา"}</span>
        </span>
        {duration && (
          <span className="timeline-day-count" aria-hidden="true">
            {duration.inclusive}D
          </span>
        )}
      </button>

      <div
        id={id}
        ref={popup}
        popover="auto"
        className="app-menu calendar-popup timeline-popup"
        style={position}
        onToggle={onToggle}
        role="dialog"
        aria-label={`เลือกช่วงเวลา ${label}`}
      >
        <div className="timeline-range-head">
          <span data-active={!start}>
            {start ? start.split("-").reverse().join("/") : "วันเริ่มต้น"}
          </span>
          <span>→</span>
          <span data-active={!!start && !end}>
            {end ? end.split("-").reverse().join("/") : "วันสิ้นสุด"}
          </span>
        </div>
        <p className="timeline-instruction" role="status">
          {!start
            ? "เลือกวันเริ่มต้น"
            : !end
              ? "เลือกวันสิ้นสุด"
              : "เลือกช่วงเวลาแล้ว กดบันทึกเพื่อใช้"}
        </p>
        <div className="calendar-heading">
          <button
            type="button"
            aria-label="Timeline เดือนก่อนหน้า"
            onClick={() => move(-1)}
          >
            <FiChevronLeft />
          </button>
          <strong>
            {monthNames[month.month]} {month.year}
          </strong>
          <button
            type="button"
            aria-label="Timeline เดือนถัดไป"
            onClick={() => move(1)}
          >
            <FiChevronRight />
          </button>
        </div>
        <div className="calendar-weekdays">
          {["จ", "อ", "พ", "พฤ", "ศ", "ส", "อา"].map((day) => (
            <span key={day}>{day}</span>
          ))}
        </div>
        <div
          className="calendar-days timeline-days"
          onKeyDown={(e) => {
            const delta: Record<string, number> = {
                ArrowLeft: -1,
                ArrowRight: 1,
                ArrowUp: -7,
                ArrowDown: 7,
              },
              day = (e.target as HTMLElement)
                .closest("button")
                ?.getAttribute("data-date");
            if (!day || !(e.key in delta)) return;
            e.preventDefault();
            const next = addDays(day, delta[e.key]),
              date = parseDay(next)!;
            setMonth({
              year: date.getUTCFullYear(),
              month: date.getUTCMonth(),
            });
            requestAnimationFrame(() =>
              popup.current
                ?.querySelector<HTMLButtonElement>(`[data-date="${next}"]`)
                ?.focus({ preventScroll: true }),
            );
          }}
        >
          {days.map((day) => {
            const between =
              !!start &&
              !!previewEnd &&
              day >= (start < previewEnd ? start : previewEnd) &&
              day <= (start < previewEnd ? previewEnd : start);
            return (
              <button
                type="button"
                key={day}
                data-date={day}
                aria-label={`Timeline ${day}`}
                aria-pressed={day === start || day === end}
                data-between={between}
                className={`${Number(day.slice(5, 7)) !== month.month + 1 ? "outside " : ""}${day === today ? "is-today" : ""}`}
                onClick={() => pick(day)}
                onMouseEnter={() => {
                  if (start && !end) setHover(day);
                }}
                onFocus={() => {
                  if (start && !end) setHover(day);
                }}
              >
                {Number(day.slice(8))}
              </button>
            );
          })}
        </div>
        <div className="calendar-actions">
          <button type="button" onClick={() => finish([])}>
            ล้างช่วงเวลา
          </button>
          <button type="button" onClick={() => popup.current?.hidePopover()}>
            ยกเลิก
          </button>
          <button
            type="button"
            className="timeline-save"
            disabled={!parseRange([start, end])}
            onClick={() => finish([start, end])}
          >
            บันทึกช่วงเวลา
          </button>
        </div>
      </div>
    </>
  );
}
