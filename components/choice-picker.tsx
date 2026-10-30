"use client";
import { useEffect, useId, useRef, useState } from "react";
import { FiCheck, FiChevronDown, FiSearch, FiX, FiEdit2 } from "react-icons/fi";
import { optionColor } from "@/lib/option-colors";
import MemberAvatar from "./member-avatar";
type Props = {
  label: string;
  options: string[];
  selected: string[];
  optionValues?: string[];
  disabled: boolean;
  required?: boolean;
  avatars?: boolean;
  single?: boolean;
  onChange: (values: string[]) => void;
  onEditOptions?: () => void;
  onEditOption?: (value: string) => void;
  colors?: Record<string, string>;
  avatarUrls?: Record<string, string | null | undefined>;
};
export default function MultiChoice({
  label,
  options,
  selected: selectedValues,
  optionValues,
  disabled,
  required = false,
  avatars = false,
  single = false,
  onChange,
  onEditOptions,
  onEditOption,
  colors,
  avatarUrls,
}: Props) {
  const id = useId(),
    popup = useRef<HTMLDivElement>(null),
    input = useRef<HTMLInputElement>(null);
  const [open, setOpen] = useState(false),
    [search, setSearch] = useState(""),
    [position, setPosition] = useState({ left: 0, top: 0 });
  const values = optionValues || options;
  const selected = selectedValues.filter((value) => value.trim() !== "");
  const matches = options
    .map((text, index) => ({ text, index, value: values[index] }))
    .filter(({ text }) => text.trim() !== "")
    .filter((o) =>
      o.text.toLocaleLowerCase().includes(search.toLocaleLowerCase().trim()),
    );
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
  function choose(value: string) {
    if (disabled) return;
    if (single) {
      onChange([value]);
      popup.current?.hidePopover();
      return;
    }
    if (selected.includes(value)) {
      if (required && selected.length === 1) return;
      onChange(selected.filter((v) => v !== value));
    } else onChange([...selected, value]);
  }
  function chip(value: string, removable = false) {
    const i = values.indexOf(value);
    const name = options[i] || value;
    return (
      <span
        key={value}
        className={`label-chip tone-${Math.max(0, i) % 6}`}
        title={name}
        style={{ background: optionColor(colors, value) }}
      >
        {avatars && (
          <MemberAvatar id={value} name={name} url={avatarUrls?.[value]} />
        )}
        <span>{name}</span>
        {removable && (
          <button
            type="button"
            aria-label={`นำ ${name} ออก`}
            disabled={disabled || (required && selected.length === 1)}
            onClick={() => onChange(selected.filter((v) => v !== value))}
          >
            <FiX size={12} />
          </button>
        )}
      </span>
    );
  }
  return (
    <div className={`multi-choice ${avatars ? "people-choice" : ""}`}>
      <button
        type="button"
        className="multi-trigger"
        aria-label={label}
        aria-expanded={open}
        aria-controls={id}
        popoverTarget={id}
        onClick={(e) => {
          const r = e.currentTarget.getBoundingClientRect();
          const height = Math.min(360, options.length * 40 + 150);
          setPosition({
            left: Math.max(8, Math.min(r.left, window.innerWidth - 368)),
            top:
              r.bottom + height + 8 > window.innerHeight
                ? Math.max(8, r.top - height - 8)
                : r.bottom + 6,
          });
        }}
      >
        <span className="multi-tags">
          {selected.length ? (
            selected.map((v) => chip(v))
          ) : (
            <span className="choice-placeholder">＋</span>
          )}
        </span>
        <FiChevronDown size={12} />
      </button>
      <div
        ref={popup}
        id={id}
        popover="auto"
        className="choice-popup"
        style={position}
        onToggle={(e) => {
          const isOpen = e.newState === "open";
          setOpen(isOpen);
          if (isOpen) {
            setSearch("");
            input.current?.focus({ preventScroll: true });
          }
        }}
      >
        <div className="choice-searchbox">
          <div className="choice-selected">
            {selected.map((v) => chip(v, true))}
          </div>
          <div className="choice-search-input">
            <FiSearch size={15} />
            <input
              ref={input}
              type="text"
              aria-label={`ค้นหา ${label}`}
              placeholder={avatars ? "ค้นหาสมาชิก..." : "ค้นหาตัวเลือก..."}
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  if (matches[0]) choose(matches[0].value);
                }
                if (e.key === "ArrowDown") {
                  e.preventDefault();
                  popup.current
                    ?.querySelector<HTMLButtonElement>('[role="option"]')
                    ?.focus();
                }
              }}
            />
            {search && (
              <button
                type="button"
                aria-label="ล้างคำค้นหา"
                onClick={() => {
                  setSearch("");
                  input.current?.focus();
                }}
              >
                <FiX />
              </button>
            )}
          </div>
        </div>
        <div className="choice-suggested">
          {avatars ? "สมาชิกในทีม" : "เลือกจากรายการ"}
        </div>
        <div
          className="choice-list"
          role="listbox"
          aria-label={label}
          aria-multiselectable={!single}
        >
          {matches.map(({ text, index, value }) => (
            <div className="choice-option-row" key={value}>
              <button
                key={value}
                type="button"
                role="option"
                aria-selected={selected.includes(value)}
                disabled={disabled}
                onClick={() => choose(value)}
              >
                {avatars ? (
                  <>
                    <MemberAvatar
                      id={value}
                      name={text}
                      url={avatarUrls?.[value]}
                    />
                    <span>{text}</span>
                  </>
                ) : (
                  <span
                    className={`label-chip tone-${index % 6}`}
                    style={{ background: optionColor(colors, value) }}
                  >
                    {text}
                  </span>
                )}
                {selected.includes(value) && (
                  <FiCheck className="choice-check" />
                )}
              </button>
              {onEditOption && !avatars && (
                <button
                  type="button"
                  className="choice-option-edit"
                  aria-label={`แก้ไขตัวเลือก ${text}`}
                  disabled={disabled}
                  onClick={() => {
                    popup.current?.hidePopover();
                    popup.current?.parentElement
                      ?.querySelector<HTMLButtonElement>(".multi-trigger")
                      ?.focus();
                    onEditOption(value);
                  }}
                >
                  <FiEdit2 size={13} />
                </button>
              )}
            </div>
          ))}
          {!matches.length && (
            <p className="choice-empty">ไม่พบตัวเลือกที่ตรงกับ “{search}”</p>
          )}
        </div>
        {onEditOptions && (
          <button
            type="button"
            className="choice-edit"
            onClick={() => {
              popup.current?.hidePopover();
              onEditOptions();
            }}
          >
            แก้ไขตัวเลือก
          </button>
        )}
      </div>
    </div>
  );
}
