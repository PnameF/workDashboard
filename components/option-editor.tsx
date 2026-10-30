"use client";
import { useEffect, useRef, useState } from "react";
import { FiX, FiEdit2 } from "react-icons/fi";
import ColorPicker from "./color-picker";
export default function OptionEditor({
  value,
  color,
  onCancel,
  onSave,
}: {
  value: string;
  color: string;
  onCancel: () => void;
  onSave: (name: string, color: string) => Promise<void>;
}) {
  const dialog = useRef<HTMLDialogElement>(null),
    [name, setName] = useState(value),
    [draftColor, setColor] = useState(color),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  useEffect(() => {
    dialog.current?.showModal();
  }, []);
  function close() {
    dialog.current?.close();
    onCancel();
  }
  return (
    <dialog
      ref={dialog}
      className="option-edit-dialog"
      aria-label="แก้ไขตัวเลือก"
      onCancel={(e) => {
        e.preventDefault();
        if (!busy) close();
      }}
    >
      <form
        onSubmit={async (e) => {
          e.preventDefault();
          setBusy(true);
          setError("");
          try {
            await onSave(name.trim(), draftColor);
            close();
          } catch (error) {
            setError(
              error instanceof Error ? error.message : "บันทึกไม่สำเร็จ",
            );
          } finally {
            setBusy(false);
          }
        }}
      >
        <header>
          <h2>
            <FiEdit2 />
            แก้ไขตัวเลือก
          </h2>
          <button
            type="button"
            aria-label="ปิดแก้ไขตัวเลือก"
            disabled={busy}
            onClick={close}
          >
            <FiX />
          </button>
        </header>
        <label htmlFor="option-name">ชื่อตัวเลือก</label>
        <input
          id="option-name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          maxLength={100}
          required
          disabled={busy}
        />
        <label>สีตัวเลือก</label>
        <ColorPicker
          value={draftColor}
          onChange={setColor}
          disabled={busy}
          aria-label="สีตัวเลือก"
        />
        <div className="option-edit-preview">
          <span className="label-chip" style={{ background: draftColor }}>
            {name || "ตัวอย่าง"}
          </span>
        </div>
        {error && <p role="alert">{error}</p>}
        <footer>
          <button type="button" disabled={busy} onClick={close}>
            ยกเลิก
          </button>
          <button
            type="submit"
            className="primary"
            disabled={busy || !name.trim()}
          >
            {busy ? "กำลังบันทึก…" : "บันทึก"}
          </button>
        </footer>
      </form>
    </dialog>
  );
}
