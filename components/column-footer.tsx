"use client";
import { useEffect, useId, useRef, useState } from "react";
import {
  calculate,
  calculations,
  defaultNumberSummary,
  formatSummary,
  type NumberSummaryConfig,
} from "@/lib/column-summary";
import { statuses, type ColumnType } from "@/lib/types";
type Props = {
  label: string;
  type: ColumnType;
  values: unknown[];
  config?: NumberSummaryConfig;
  disabled: boolean;
  onChange: (config: NumberSummaryConfig) => void;
};
export default function ColumnFooter(props: Props) {
  if (props.type === "status")
    return <StatusSummary values={props.values} label={props.label} />;
  if (props.type === "number") return <NumberSummary {...props} />;
  return null;
}
function StatusSummary({
  values,
  label,
}: {
  values: unknown[];
  label: string;
}) {
  const counts = statuses.map(
    (status, i) => values.filter((v) => v === status || v === i).length,
  );
  const empty = values.length - counts.reduce((a, b) => a + b, 0);
  const names = [...statuses, "ยังไม่กำหนด"];
  const colors = ["#71829c", "#d79722", "#18ac89", "#e15876", "#343e50"];
  return (
    <div
      className="status-summary"
      role="img"
      aria-label={`${label}: ${[...counts, empty].map((n, i) => `${names[i]} ${n}`).join(", ")}`}
    >
      {values.length ? (
        [...counts, empty].map(
          (count, i) =>
            count > 0 && (
              <span
                key={i}
                style={{
                  width: `${(count / values.length) * 100}%`,
                  background: colors[i],
                }}
                title={`${names[i]}: ${count} งาน`}
              />
            ),
        )
      ) : (
        <span
          style={{ width: "100%", background: colors[4] }}
          title="ยังไม่มีงาน"
        />
      )}
    </div>
  );
}
function NumberSummary({
  label,
  values,
  config = defaultNumberSummary,
  disabled,
  onChange,
}: Props) {
  const popupId = useId(),
    popup = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false),
    [position, setPosition] = useState({ left: 0, top: 0 });
  const presets = ["", "$", "€", "£", "%"];
  const value = calculate(values, config.calculation);
  useEffect(() => {
    if (!open) return;
    const close = (e: Event) => {
      if (e.target instanceof Node && popup.current?.contains(e.target)) return;
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
    <>
      <button
        type="button"
        className="number-summary-trigger"
        aria-label={`สรุปตัวเลข ${label}`}
        aria-expanded={open}
        popoverTarget={popupId}
        onClick={(e) => {
          const rect = e.currentTarget.getBoundingClientRect();
          setPosition({
            left: Math.max(8, Math.min(rect.left, window.innerWidth - 388)),
            top:
              rect.bottom + 280 > window.innerHeight
                ? Math.max(8, rect.top - 270)
                : rect.bottom + 6,
          });
        }}
      >
        <strong>
          {config.calculation === "none" ? "–" : formatSummary(value, config)}
        </strong>
        <small>
          {config.calculation === "none"
            ? "ตั้งค่าการคำนวณ"
            : config.calculation}
        </small>
      </button>
      <div
        id={popupId}
        ref={popup}
        popover="auto"
        className="number-summary-popup"
        style={position}
        onToggle={(e) => setOpen(e.newState === "open")}
      >
        <div className="summary-setting-label">
          Unit <span>หน่วย</span>
        </div>
        <div className="summary-unit-options">
          {presets.map((unit) => (
            <button
              type="button"
              key={unit}
              aria-pressed={config.unit === unit}
              disabled={disabled}
              onClick={() => onChange({ ...config, unit })}
            >
              {unit || "None"}
            </button>
          ))}
          <input
            key={config.unit}
            aria-label={`หน่วยกำหนดเอง ${label}`}
            placeholder="หน่วยอื่น…"
            maxLength={20}
            defaultValue={presets.includes(config.unit) ? "" : config.unit}
            onBlur={(e) => {
              const unit = e.target.value.trim();
              if (unit && unit !== config.unit) onChange({ ...config, unit });
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                e.currentTarget.blur();
              }
            }}
          />
        </div>
        <div className="summary-position-options">
          {(["left", "right"] as const).map((side) => (
            <button
              type="button"
              key={side}
              disabled={disabled}
              aria-pressed={config.position === side}
              onClick={() => onChange({ ...config, position: side })}
            >
              {side === "left" ? "L · หน่วยด้านซ้าย" : "R · หน่วยด้านขวา"}
            </button>
          ))}
        </div>
        <div className="summary-setting-label">
          Calculation <span>การคำนวณ</span>
        </div>
        <div className="summary-calculations">
          {calculations.map((method) => (
            <button
              type="button"
              key={method}
              disabled={disabled}
              aria-pressed={config.calculation === method}
              onClick={() => onChange({ ...config, calculation: method })}
            >
              {method === "none"
                ? "None"
                : method[0].toUpperCase() + method.slice(1)}
            </button>
          ))}
        </div>
        <div className="summary-overall">
          ผลรวมทั้งคอลัมน์:{" "}
          <strong>{formatSummary(calculate(values, "sum"), config)}</strong>
        </div>
      </div>
    </>
  );
}
