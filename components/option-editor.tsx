"use client";
import { useEffect, useRef, useState } from "react";
import { FiX, FiEdit2, FiTrash2 } from "react-icons/fi";
import ColorPicker from "./color-picker";
export default function OptionEditor({
  value,
  color,
  onCancel,
  onSave,
  onDelete,
  creating = false,
}: {
  value: string;
  color: string;
  onCancel: () => void;
  onSave: (name: string, color: string) => Promise<void>;
  onDelete?: () => Promise<void>;
  creating?: boolean;
}) {
  const dialog = useRef<HTMLDialogElement>(null),
    [name, setName] = useState(value),
    [draftColor, setColor] = useState(color),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const [confirmDelete, setConfirmDelete] = useState(false);
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
            {creating ? "เพิ่มสถานะ" : "แก้ไขตัวเลือก"}
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
        {onDelete && (
          <div className="option-delete-section">
            {confirmDelete && (
              <p>
                ลบสถานะนี้? งานที่ใช้สถานะนี้จะถูกล้างสถานะ รวมงานที่เก็บถาวร
                โดยไม่ลบงาน
              </p>
            )}
            <button
              type="button"
              className="option-delete-button"
              disabled={busy}
              onClick={async () => {
                if (!confirmDelete) {
                  setConfirmDelete(true);
                  return;
                }
                setBusy(true);
                setError("");
                try {
                  await onDelete();
                  close();
                } catch (error) {
                  setError(
                    error instanceof Error ? error.message : "ลบสถานะไม่สำเร็จ",
                  );
                } finally {
                  setBusy(false);
                }
              }}
            >
              <FiTrash2 />
              {confirmDelete ? "ยืนยันลบสถานะ" : "ลบสถานะ"}
            </button>
            {confirmDelete && (
              <button
                type="button"
                disabled={busy}
                onClick={() => setConfirmDelete(false)}
              >
                กลับ
              </button>
            )}
          </div>
        )}
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
