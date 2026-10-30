"use client";
import { useId, useRef, useState, type ButtonHTMLAttributes } from "react";
import { FiCalendar, FiChevronLeft, FiChevronRight, FiX } from "react-icons/fi";
import { useFloatingPanel } from "./floating-panel";
const months = [
  "มกราคม",
  "กุมภาพันธ์",
  "มีนาคม",
  "เมษายน",
  "พฤษภาคม",
  "มิถุนายน",
  "กรกฎาคม",
  "สิงหาคม",
  "กันยายน",
  "ตุลาคม",
  "พฤศจิกายน",
  "ธันวาคม",
];
const iso = (date: Date) =>
  `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
function parse(value: string) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) return null;
  const date = new Date(+match[1], +match[2] - 1, +match[3]);
  return iso(date) === value ? date : null;
}
type Props = Omit<
  ButtonHTMLAttributes<HTMLButtonElement>,
  "onChange" | "value" | "defaultValue"
> & {
  value?: string;
  defaultValue?: string;
  min?: string;
  max?: string;
  name?: string;
  required?: boolean;
  onChange?: (value: string) => void;
};
export default function DatePicker({
  value,
  defaultValue = "",
  onChange,
  min,
  max,
  name,
  required,
  id: givenId,
  className = "",
  disabled,
  ...props
}: Props) {
  const generated = useId(),
    id = givenId || generated,
    popupId = useId(),
    trigger = useRef<HTMLButtonElement>(null),
    [internal, setInternal] = useState(defaultValue),
    selected = value ?? internal,
    initial = parse(selected) || new Date(),
    [view, setView] = useState({
      year: initial.getFullYear(),
      month: initial.getMonth(),
    }),
    [mode, setMode] = useState<"days" | "months" | "years">("days");
  const { popup, position, place, open, onToggle } = useFloatingPanel(304),
    first = new Date(view.year, view.month, 1),
    start = (first.getDay() + 6) % 7,
    today = iso(new Date());
  function choose(next: string) {
    setInternal(next);
    onChange?.(next);
    popup.current?.hidePopover();
    trigger.current?.focus({ preventScroll: true });
  }
  function month(offset: number) {
    const date = new Date(view.year, view.month + offset, 1);
    setView({ year: date.getFullYear(), month: date.getMonth() });
  }
  function allowed(day: string) {
    return (!min || day >= min) && (!max || day <= max);
  }
  return (
    <>
      <input type="hidden" name={name} value={selected} disabled={disabled} />
      <button
        {...props}
        id={id}
        ref={trigger}
        type="button"
        className={`date-trigger ${className}`}
        disabled={disabled}
        aria-required={required}
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-controls={popupId}
        popoverTarget={popupId}
        onClick={(e) => {
          place(e.currentTarget, 365);
          const d = parse(selected) || new Date();
          setView({ year: d.getFullYear(), month: d.getMonth() });
          setMode("days");
        }}
      >
        <span className={selected ? "" : "muted"}>
          {selected ? selected.split("-").reverse().join("/") : "วว/ดด/ปปปป"}
        </span>
        <FiCalendar size={14} />
      </button>
      <div
        ref={popup}
        id={popupId}
        popover="auto"
        className="app-menu calendar-popup"
        style={position}
        onToggle={onToggle}
        role="dialog"
        aria-label={`เลือกวันที่ ${props["aria-label"] || ""}`}
      >
        <div className="calendar-heading">
          <button
            type="button"
            aria-label="เดือนก่อนหน้า"
            onClick={() =>
              mode === "days"
                ? month(-1)
                : setView({
                    ...view,
                    year: view.year - (mode === "years" ? 12 : 1),
                  })
            }
          >
            <FiChevronLeft />
          </button>
          <div>
            <button
              type="button"
              onClick={() => setMode(mode === "months" ? "days" : "months")}
            >
              {months[view.month]}
            </button>
            <button
              type="button"
              onClick={() => setMode(mode === "years" ? "days" : "years")}
            >
              {view.year}
            </button>
          </div>
          <button
            type="button"
            aria-label="เดือนถัดไป"
            onClick={() =>
              mode === "days"
                ? month(1)
                : setView({
                    ...view,
                    year: view.year + (mode === "years" ? 12 : 1),
                  })
            }
          >
            <FiChevronRight />
          </button>
        </div>
        {mode === "days" ? (
          <>
            <div className="calendar-weekdays">
              {["จ", "อ", "พ", "พฤ", "ศ", "ส", "อา"].map((d) => (
                <span key={d}>{d}</span>
              ))}
            </div>
            <div
              className="calendar-days"
              role="group"
              aria-label="วันในเดือน"
              onKeyDown={(e) => {
                const delta: Record<string, number> = {
                  ArrowLeft: -1,
                  ArrowRight: 1,
                  ArrowUp: -7,
                  ArrowDown: 7,
                };
                if (!(e.key in delta)) return;
                e.preventDefault();
                const target = e.target as HTMLButtonElement,
                  day = parse(target.dataset.date || "");
                if (!day) return;
                day.setDate(day.getDate() + delta[e.key]);
                const next = iso(day),
                  button = popup.current?.querySelector<HTMLButtonElement>(
                    `[data-date="${next}"]`,
                  );
                if (button && !button.disabled) button.focus();
                else if (allowed(next)) {
                  setView({ year: day.getFullYear(), month: day.getMonth() });
                  requestAnimationFrame(() =>
                    popup.current
                      ?.querySelector<HTMLButtonElement>(
                        `[data-date="${next}"]`,
                      )
                      ?.focus(),
                  );
                }
              }}
            >
              {Array.from({ length: 42 }, (_, i) => {
                const date = new Date(view.year, view.month, i - start + 1),
                  day = iso(date);
                return (
                  <button
                    key={day}
                    type="button"
                    data-date={day}
                    className={`${date.getMonth() !== view.month ? "outside " : ""}${day === today ? "is-today" : ""}`}
                    aria-label={day}
                    aria-pressed={selected === day}
                    disabled={!allowed(day)}
                    onClick={() => choose(day)}
                  >
                    {date.getDate()}
                  </button>
                );
              })}
            </div>
          </>
        ) : (
          <div className="calendar-periods">
            {mode === "months"
              ? months.map((name, month) => (
                  <button
                    key={name}
                    type="button"
                    aria-pressed={month === view.month}
                    onClick={() => {
                      setView({ ...view, month });
                      setMode("days");
                    }}
                  >
                    {name}
                  </button>
                ))
              : Array.from({ length: 12 }, (_, i) => view.year - 5 + i).map(
                  (year) => (
                    <button
                      key={year}
                      type="button"
                      aria-pressed={year === view.year}
                      onClick={() => {
                        setView({ ...view, year });
                        setMode("months");
                      }}
                    >
                      {year}
                    </button>
                  ),
                )}
          </div>
        )}
        <div className="calendar-actions">
          <button type="button" disabled={required} onClick={() => choose("")}>
            <FiX />
            ล้างค่า
          </button>
          <button
            type="button"
            disabled={!allowed(today)}
            onClick={() => choose(today)}
          >
            วันนี้
          </button>
        </div>
      </div>
    </>
  );
}
