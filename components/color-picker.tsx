"use client";
import { useId, useRef, useState } from "react";
import { FiCheck } from "react-icons/fi";
import { useFloatingPanel } from "./floating-panel";
export default function ColorPicker({
  value,
  onChange,
  id,
  disabled,
  compact = false,
  ...props
}: {
  value: string;
  onChange: (value: string) => void;
  id?: string;
  disabled?: boolean;
  compact?: boolean;
  "aria-label"?: string;
}) {
  const popupId = useId(),
    trigger = useRef<HTMLButtonElement>(null),
    [draft, setDraft] = useState(value),
    { popup, position, place, onToggle, open } = useFloatingPanel(260);
  function choose(color: string) {
    onChange(color);
    popup.current?.hidePopover();
    trigger.current?.focus({ preventScroll: true });
  }
  return (
    <>
      <button
        ref={trigger}
        id={id}
        type="button"
        className={`app-color-trigger ${compact ? "compact" : ""}`}
        aria-label={props["aria-label"] || "เลือกสีกลุ่ม"}
        aria-expanded={open}
        popoverTarget={popupId}
        disabled={disabled}
        onClick={(e) => {
          setDraft(value);
          place(e.currentTarget, 215);
        }}
      >
        <span style={{ backgroundColor: value }} />
        {!compact && value.toUpperCase()}
      </button>
      <div
        ref={popup}
        id={popupId}
        popover="auto"
        className="app-menu color-picker-popup"
        style={position}
        onToggle={onToggle}
      >
        <strong>สีกลุ่มงาน</strong>
        <div className="group-palette">
          {[
            "#7197d0",
            "#64aa91",
            "#a18bc8",
            "#c77f8c",
            "#bd9a61",
            "#bd84b3",
          ].map((color) => (
            <button
              type="button"
              className="palette-swatch"
              key={color}
              aria-label={`ใช้สี ${color}`}
              aria-pressed={value === color}
              style={{ backgroundColor: color }}
              onClick={() => choose(color)}
            >
              {value === color && <FiCheck />}
            </button>
          ))}
        </div>
        <label htmlFor={popupId + "-hex"}>รหัสสี HEX</label>
        <div className="color-hex-row">
          <input
            id={popupId + "-hex"}
            value={draft}
            maxLength={7}
            spellCheck={false}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                if (/^#[0-9a-f]{6}$/i.test(draft)) choose(draft);
              }
            }}
          />
          <span
            style={{
              backgroundColor: /^#[0-9a-f]{6}$/i.test(draft) ? draft : value,
            }}
          />
        </div>
        <button
          type="button"
          className="primary"
          disabled={!/^#[0-9a-f]{6}$/i.test(draft)}
          onClick={() => choose(draft)}
        >
          ใช้สีนี้
        </button>
      </div>
    </>
  );
}
