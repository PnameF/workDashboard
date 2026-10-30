"use client";
import { useId, useRef, useState } from "react";
import { useFloatingPanel } from "./floating-panel";
export default function TextSuggest({
  id,
  name,
  defaultValue = "",
  options,
  maxLength = 100,
  onChange,
}: {
  id: string;
  name: string;
  defaultValue?: string;
  options: string[];
  maxLength?: number;
  onChange?: (value: string) => void;
}) {
  const popupId = useId(),
    input = useRef<HTMLInputElement>(null),
    [value, setValue] = useState(defaultValue),
    { popup, place, position, onToggle, open } = useFloatingPanel(280);
  const matches = options.filter(
    (s) => s.trim() && s.toLowerCase().includes(value.toLowerCase()),
  );
  return (
    <>
      <input
        ref={input}
        id={id}
        name={name}
        value={value}
        maxLength={maxLength}
        autoComplete="off"
        role="combobox"
        aria-autocomplete="list"
        aria-controls={popupId}
        aria-expanded={open}
        onChange={(e) => {
          setValue(e.target.value);
          onChange?.(e.target.value);
          if (!open) {
            place(e.currentTarget, 240, true);
            popup.current?.showPopover();
          }
        }}
        onFocus={(e) => {
          place(e.currentTarget, 240, true);
          popup.current?.showPopover();
        }}
        onBlur={(e) => {
          if (!popup.current?.contains(e.relatedTarget as Node))
            popup.current?.hidePopover();
        }}
        onKeyDown={(e) => {
          if (e.key === "ArrowDown") {
            e.preventDefault();
            popup.current?.querySelector<HTMLButtonElement>("button")?.focus();
          }
        }}
      />
      <div
        ref={popup}
        id={popupId}
        popover="auto"
        className="app-menu app-select-menu"
        style={position}
        onToggle={onToggle}
      >
        <div role="listbox" aria-label="โปรเจกต์ที่แนะนำ">
          {matches.map((s) => (
            <button
              key={s}
              type="button"
              role="option"
              aria-selected={value === s}
              onClick={() => {
                setValue(s);
                onChange?.(s);
                input.current?.focus();
                popup.current?.hidePopover();
              }}
            >
              {s}
            </button>
          ))}
          {!matches.length && (
            <p className="suggest-hint">ใช้ข้อความที่พิมพ์เป็นชื่อโปรเจกต์</p>
          )}
        </div>
      </div>
    </>
  );
}
