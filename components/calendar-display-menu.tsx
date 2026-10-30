"use client";
import { useId, useState } from "react";
import { FiSliders, FiArrowUp, FiArrowDown } from "react-icons/fi";
import { useFloatingPanel } from "./floating-panel";
export default function CalendarDisplayMenu({
  options,
  selected,
  disabled,
  onChange,
}: {
  options: { id: string; name: string }[];
  selected: string[];
  disabled: boolean;
  onChange: (fields: string[]) => void;
}) {
  const id = useId(),
    [draft, setDraft] = useState(selected),
    { popup, position, place, open, onToggle } = useFloatingPanel(340);
  function move(index: number, delta: number) {
    const next = [...draft];
    [next[index], next[index + delta]] = [next[index + delta], next[index]];
    setDraft(next);
  }
  return (
    <>
      <button
        type="button"
        className="calendar-display-trigger"
        aria-label="ตั้งค่าข้อมูลหลักและรองบนปฏิทิน"
        aria-expanded={open}
        popoverTarget={id}
        disabled={disabled}
        onClick={(e) => {
          setDraft(selected);
          place(e.currentTarget, Math.min(500, 170 + options.length * 40));
        }}
      >
        <FiSliders />
        แสดงข้อมูล
      </button>
      <div
        ref={popup}
        id={id}
        popover="auto"
        className="app-menu calendar-display-popup"
        style={position}
        onToggle={onToggle}
      >
        <strong>ข้อมูลบนแถบงาน</strong>
        <p>ลำดับแรกเป็นข้อมูลหลัก ลำดับถัดไปเป็นข้อมูลรอง</p>
        <div className="calendar-selected-fields">
          {draft.map((field, index) => (
            <div key={field}>
              <span className="calendar-field-rank">{index + 1}</span>
              <span>
                {options.find((o) => o.id === field)?.name}
                <small>{index === 0 ? "ข้อมูลหลัก" : "ข้อมูลรอง"}</small>
              </span>
              <button
                type="button"
                disabled={index === 0}
                aria-label={`เลื่อน ${options.find((o) => o.id === field)?.name} ขึ้น`}
                onClick={() => move(index, -1)}
              >
                <FiArrowUp />
              </button>
              <button
                type="button"
                disabled={index === draft.length - 1}
                aria-label={`เลื่อน ${options.find((o) => o.id === field)?.name} ลง`}
                onClick={() => move(index, 1)}
              >
                <FiArrowDown />
              </button>
            </div>
          ))}
        </div>
        <div
          className="calendar-field-options"
          role="group"
          aria-label="หัวข้อคอลัมน์ที่แสดง"
        >
          {options.map((option) => (
            <label key={option.id}>
              <input
                className="task-checkbox"
                type="checkbox"
                checked={draft.includes(option.id)}
                disabled={
                  disabled || (draft.length === 1 && draft[0] === option.id)
                }
                onChange={() =>
                  setDraft((current) =>
                    current.includes(option.id)
                      ? current.filter((id) => id !== option.id)
                      : [...current, option.id],
                  )
                }
              />
              <span>{option.name}</span>
            </label>
          ))}
        </div>
        <div className="calendar-display-actions">
          <button type="button" onClick={() => popup.current?.hidePopover()}>
            ยกเลิก
          </button>
          <button
            type="button"
            disabled={disabled || !draft.length}
            onClick={() => {
              onChange(draft);
              popup.current?.hidePopover();
            }}
          >
            นำไปใช้
          </button>
        </div>
      </div>
    </>
  );
}
