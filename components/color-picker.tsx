"use client";
import { useId, useRef, useState } from "react";
import { FiCheck } from "react-icons/fi";
import { useFloatingPanel } from "./floating-panel";
import AppSelect from "./app-select";
import {
  clamp,
  colorCode,
  hexToHsv,
  hsvToHex,
  parseColorCode,
  type Hsv,
} from "@/lib/color";
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
    [format, setFormat] = useState<"hex" | "rgb">("hex"),
    [hsv, setHsv] = useState(() => hexToHsv(value)),
    [draft, setDraft] = useState(value.replace("#", "").toUpperCase()),
    { popup, position, place, onToggle, open } = useFloatingPanel(340, {
      closeOnScroll: false,
      closeOnResize: false,
    });
  const selectedColor = hsvToHex(hsv),
    validColor = parseColorCode(draft, format);
  function updateColor(next: Hsv) {
    setHsv(next);
    setDraft(colorCode(next, format));
  }
  function pointColor(element: HTMLDivElement, x: number, y: number) {
    const rect = element.getBoundingClientRect();
    if (!rect.width || !rect.height) return;
    updateColor({
      ...hsv,
      s: clamp((x - rect.left) / rect.width),
      v: clamp(1 - (y - rect.top) / rect.height),
    });
  }
  function choose(color: string) {
    if (disabled) return;
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
          const initial = hexToHsv(value);
          setHsv(initial);
          setFormat("hex");
          setDraft(colorCode(initial, "hex"));
          place(e.currentTarget, 480);
        }}
      >
        <span style={{ backgroundColor: value }} />
        {!compact && value.replace(/^#/, "").toUpperCase()}
      </button>
      <div
        ref={popup}
        id={popupId}
        popover="auto"
        className="app-menu color-picker-popup"
        style={{
          ...position,
          maxHeight: `calc(100dvh - ${position.top + 8}px)`,
        }}
        onToggle={onToggle}
        onPointerDown={(e) => e.stopPropagation()}
        onMouseDown={(e) => e.stopPropagation()}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="color-picker-body">
          <strong>{props["aria-label"] || "เลือกสี"}</strong>
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
                disabled={disabled}
                style={{ backgroundColor: color }}
                onClick={() => choose(color)}
              >
                {value === color && <FiCheck />}
              </button>
            ))}
          </div>
          <div
            className="color-spectrum"
            tabIndex={disabled ? -1 : 0}
            role="slider"
            aria-label="ความอิ่มตัวและความสว่างของสี"
            aria-disabled={disabled}
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={Math.round(hsv.s * 100)}
            aria-valuetext={`ความอิ่มตัว ${Math.round(hsv.s * 100)}% ความสว่าง ${Math.round(hsv.v * 100)}%`}
            aria-describedby={popupId + "-instructions"}
            style={{ backgroundColor: `hsl(${hsv.h} 100% 50%)` }}
            onPointerDown={(e) => {
              if (disabled || e.button !== 0 || !e.isPrimary) return;
              e.preventDefault();
              e.currentTarget.focus({ preventScroll: true });
              e.currentTarget.setPointerCapture(e.pointerId);
              pointColor(e.currentTarget, e.clientX, e.clientY);
            }}
            onPointerMove={(e) => {
              if (!disabled && e.currentTarget.hasPointerCapture(e.pointerId))
                pointColor(e.currentTarget, e.clientX, e.clientY);
            }}
            onPointerUp={(e) => {
              if (e.currentTarget.hasPointerCapture(e.pointerId))
                e.currentTarget.releasePointerCapture(e.pointerId);
            }}
            onKeyDown={(e) => {
              if (disabled) return;
              const step = e.shiftKey ? 0.1 : 0.01;
              if (
                !["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown"].includes(
                  e.key,
                )
              )
                return;
              e.preventDefault();
              updateColor({
                ...hsv,
                s: clamp(
                  hsv.s +
                    (e.key === "ArrowRight"
                      ? step
                      : e.key === "ArrowLeft"
                        ? -step
                        : 0),
                ),
                v: clamp(
                  hsv.v +
                    (e.key === "ArrowUp"
                      ? step
                      : e.key === "ArrowDown"
                        ? -step
                        : 0),
                ),
              });
            }}
          >
            <span
              className="color-spectrum-thumb"
              style={{
                left: `${hsv.s * 100}%`,
                top: `${(1 - hsv.v) * 100}%`,
                backgroundColor: selectedColor,
              }}
            />
          </div>
          <span className="sr-only" id={popupId + "-instructions"}>
            ใช้ลูกศรซ้ายขวาปรับความอิ่มตัว ลูกศรขึ้นลงปรับความสว่าง กด Shift
            เพื่อปรับครั้งละ 10%
          </span>
          <input
            className="color-hue-slider"
            type="range"
            aria-label="เฉดสี"
            min={0}
            max={360}
            step={1}
            value={hsv.h}
            disabled={disabled}
            style={
              { "--hue-color": `hsl(${hsv.h} 100% 50%)` } as React.CSSProperties
            }
            onChange={(e) => updateColor({ ...hsv, h: Number(e.target.value) })}
          />
          <label htmlFor={popupId + "-hex"} className="sr-only">
            รหัสสี {format.toUpperCase()}
          </label>
          <div className="color-code-row">
            <span
              className="color-code-preview"
              style={{ backgroundColor: selectedColor }}
            />
            <input
              type="text"
              id={popupId + "-hex"}
              value={draft}
              aria-invalid={!validColor}
              maxLength={format === "hex" ? 7 : 24}
              spellCheck={false}
              autoComplete="off"
              disabled={disabled}
              placeholder={format === "hex" ? "0066FF" : "0, 102, 255"}
              onChange={(e) => {
                const code =
                  format === "hex"
                    ? e.target.value.replace(/^#/, "")
                    : e.target.value;
                setDraft(code);
                const parsed = parseColorCode(code, format);
                if (parsed) setHsv(hexToHsv(parsed));
              }}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  if (validColor) choose(validColor);
                }
              }}
            />
            <AppSelect
              aria-label="รูปแบบรหัสสี"
              className="color-format"
              value={format}
              disabled={disabled}
              onChange={(next) => {
                const type = next as "hex" | "rgb";
                setFormat(type);
                setDraft(colorCode(hsv, type));
              }}
            >
              <option value="hex">HEX</option>
              <option value="rgb">RGB</option>
            </AppSelect>
          </div>
        </div>
        <button
          type="button"
          className="primary color-apply"
          disabled={disabled || !validColor}
          onClick={() => {
            if (validColor) choose(validColor);
          }}
        >
          ใช้สีนี้
        </button>
      </div>
    </>
  );
}
