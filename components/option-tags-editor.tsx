"use client";
import { useState } from "react";
import { FiX } from "react-icons/fi";
export default function OptionTagsEditor({
  initial = [],
}: {
  initial?: string[];
}) {
  const [options, setOptions] = useState<string[]>(initial),
    [draft, setDraft] = useState(""),
    [error, setError] = useState("");
  function add(values: string[]) {
    const cleaned = values.map((v) => v.trim()).filter(Boolean);
    if (!cleaned.length) return;
    if (cleaned.some((v) => v.length > 100)) {
      setError("ตัวเลือกยาวได้ไม่เกิน 100 ตัวอักษร");
      return;
    }
    const next = [...new Set([...options, ...cleaned])];
    if (next.length > 50) {
      setError("เพิ่มได้สูงสุด 50 ตัวเลือก");
      return;
    }
    if (next.length === options.length) {
      setError("มีตัวเลือกนี้แล้ว");
      return;
    }
    setOptions(next);
    setDraft("");
    setError("");
  }
  return (
    <>
      <input type="hidden" name="options" value={options.join("\n")} />
      <div className="option-tags-editor">
        {options.map((option, i) => (
          <span key={option} className={`label-chip tone-${i % 6}`}>
            <span>{option}</span>
            <button
              type="button"
              aria-label={`ลบตัวเลือก ${option}`}
              onClick={() => {
                setOptions(options.filter((v) => v !== option));
                setError("");
              }}
            >
              <FiX size={13} />
            </button>
          </span>
        ))}
        <input
          id="coloptions"
          type="text"
          aria-label="เพิ่มตัวเลือก"
          value={draft}
          required={options.length === 0}
          maxLength={100}
          placeholder="พิมพ์แล้วกด Enter เพื่อเพิ่มตัวเลือก"
          onChange={(e) => {
            setDraft(e.target.value);
            setError("");
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.nativeEvent.isComposing) {
              e.preventDefault();
              add([draft]);
            }
          }}
          onBlur={() => {
            if (draft.trim()) add([draft]);
          }}
          onPaste={(e) => {
            const text = e.clipboardData.getData("text");
            if (text.includes("\n")) {
              e.preventDefault();
              add(text.split(/\r?\n/));
            }
          }}
        />
      </div>
      <p className="option-tags-hint" role="status">
        {error || "กด Enter เพื่อเพิ่ม · กด × เพื่อลบตัวเลือก"}
      </p>
    </>
  );
}
