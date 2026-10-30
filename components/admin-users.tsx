"use client";
import { useEffect, useState, useRef } from "react";
import Link from "next/link";
import {
  FiArrowLeft,
  FiKey,
  FiRefreshCw,
  FiShield,
  FiCheck,
} from "react-icons/fi";
import type { AuthUser } from "@/lib/auth-types";
type User = {
  id: string;
  name: string;
  email: string;
  role: string;
  recovery_set_at: number | null;
};
export default function AdminUsers({ user }: { user: AuthUser }) {
  const [users, setUsers] = useState<User[]>([]),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    [target, setTarget] = useState<User | null>(null),
    [code, setCode] = useState(""),
    [saved, setSaved] = useState(false);
  const dialog = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    if (target) dialog.current?.showModal();
    else dialog.current?.close();
  }, [target]);
  useEffect(() => {
    let active = true;
    fetch("/api/auth/users")
      .then(async (r) => {
        const data = await r.json();
        if (!r.ok) throw Error(data.error);
        if (active) setUsers(data);
      })
      .catch(() => {
        if (active) setError("โหลดรายชื่อผู้ใช้ไม่สำเร็จ");
      });
    return () => {
      active = false;
    };
  }, []);
  function generate() {
    const bytes = crypto.getRandomValues(new Uint8Array(18));
    setCode(Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join(""));
    setSaved(false);
  }
  async function save(e: React.SubmitEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!target || code.length < 12 || code.length > 128) {
      setError("รหัสกู้คืนต้องยาว 12–128 ตัวอักษร");
      return;
    }
    setBusy(true);
    setError("");
    try {
      const r = await fetch("/api/auth/recovery-code", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ userId: target.id, code }),
        }),
        data = await r.json();
      if (!r.ok) throw Error(data.error);
      setSaved(true);
      setUsers((list) =>
        list.map((u) =>
          u.id === target.id ? { ...u, recovery_set_at: Date.now() } : u,
        ),
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : "บันทึกไม่สำเร็จ");
    } finally {
      setBusy(false);
    }
  }
  return (
    <main className="admin-shell">
      <Link className="admin-back" href="/my-work">
        <FiArrowLeft />
        กลับพื้นที่ทำงาน
      </Link>
      <header>
        <div className="auth-icon">
          <FiShield />
        </div>
        <h1>จัดการผู้ใช้และรหัสกู้คืน</h1>
        <p>
          {user.role === "admin" ? "ผู้ดูแลระบบ" : user.name} ·
          กำหนดรหัสลับรายบัญชีสำหรับรีเซ็ตรหัสผ่าน ใช้ได้ครั้งเดียว
        </p>
      </header>
      {error && (
        <div role="alert" className="auth-error">
          {error}
        </div>
      )}
      <div className="admin-users">
        {users.map((u) => (
          <div className="admin-user" key={u.id}>
            <div>
              <strong>
                {u.role === "admin" ? "บัญชีผู้ดูแลระบบ" : u.name}
                {u.role === "admin" && (
                  <span className="admin-role">ผู้ดูแล</span>
                )}
              </strong>
              <p>{u.role === "admin" ? "บัญชีผู้ดูแล" : u.email}</p>
              <small>
                {u.recovery_set_at
                  ? "มีรหัสกู้คืนที่ยังไม่ได้ใช้"
                  : "ยังไม่ได้กำหนดรหัสกู้คืน"}
              </small>
            </div>
            <button
              type="button"
              onClick={() => {
                setTarget(u);
                setCode("");
                setSaved(false);
                setError("");
              }}
            >
              <FiKey />
              กำหนดรหัสกู้คืน
            </button>
          </div>
        ))}
      </div>
      <dialog
        ref={dialog}
        className="recovery-dialog"
        onCancel={() => {
          setTarget(null);
          setCode("");
        }}
      >
        {target && (
          <div
            className="recovery-overlay"
            onClick={(e) => {
              if (e.target === e.currentTarget && !busy) {
                setTarget(null);
                setCode("");
              }
            }}
          >
            <section
              role="dialog"
              aria-modal="true"
              aria-labelledby="recovery-title"
              className="recovery-card"
            >
              <h2 id="recovery-title">
                รหัสกู้คืนของ{" "}
                {target.role === "admin" ? "บัญชีผู้ดูแลระบบ" : target.name}
              </h2>
              <p>{target.role === "admin" ? "บัญชีผู้ดูแล" : target.email}</p>
              <form noValidate onSubmit={save}>
                <label htmlFor="recovery-code">กำหนดรหัสลับ</label>
                <div className="recovery-input">
                  <input
                    id="recovery-code"
                    value={code}
                    autoFocus
                    autoComplete="off"
                    maxLength={128}
                    onChange={(e) => {
                      setCode(e.target.value);
                      setSaved(false);
                    }}
                    disabled={busy}
                  />
                  <button
                    type="button"
                    disabled={busy}
                    onClick={generate}
                    aria-label="สุ่มรหัสกู้คืน"
                  >
                    <FiRefreshCw />
                  </button>
                </div>
                <small>
                  แจ้งรหัสนี้ให้เจ้าของบัญชีโดยตรง รหัสใหม่จะแทนที่รหัสเดิม
                </small>
                {saved && (
                  <div className="recovery-saved" role="status">
                    <FiCheck />
                    บันทึกแล้ว รหัสนี้จะไม่แสดงอีกเมื่อปิดหน้าต่าง
                  </div>
                )}
                {error && (
                  <div role="alert" className="auth-error">
                    {error}
                  </div>
                )}
                <div className="dialogactions">
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => {
                      setTarget(null);
                      setCode("");
                    }}
                  >
                    ปิด
                  </button>
                  <button
                    type="submit"
                    className="primary"
                    disabled={busy || saved}
                  >
                    {busy ? "กำลังบันทึก…" : "บันทึกรหัสกู้คืน"}
                  </button>
                </div>
              </form>
            </section>
          </div>
        )}
      </dialog>
    </main>
  );
}
