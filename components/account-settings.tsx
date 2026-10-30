"use client";
import { useState, useRef } from "react";
import Link from "next/link";
import Image from "next/image";
import { useRouter } from "next/navigation";
import {
  FiArrowLeft,
  FiUser,
  FiSettings,
  FiUpload,
  FiCheck,
  FiLoader,
} from "react-icons/fi";
import { nameInitials, type AuthUser } from "@/lib/auth-types";
import { normalizePreferences } from "@/lib/preferences";
import AppSelect from "./app-select";
export default function AccountSettings({
  initialUser,
}: {
  initialUser: AuthUser;
}) {
  const [user, setUser] = useState(initialUser),
    [tab, setTab] = useState<"profile" | "general">("profile"),
    [name, setName] = useState(initialUser.name),
    [preferences, setPreferences] = useState(
      normalizePreferences(initialUser.preferences),
    ),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [notice, setNotice] = useState(""),
    file = useRef<HTMLInputElement>(null),
    router = useRouter();
  async function request(method: string, body?: unknown) {
    setBusy(true);
    setError("");
    setNotice("");
    try {
      const response = await fetch("/api/settings", {
          method,
          headers:
            body instanceof FormData
              ? undefined
              : { "Content-Type": "application/json" },
          body:
            body === undefined
              ? undefined
              : body instanceof FormData
                ? body
                : JSON.stringify(body),
        }),
        data = await response.json();
      if (!response.ok) throw Error(data.error || "บันทึกไม่สำเร็จ");
      setUser(data);
      setNotice("บันทึกการตั้งค่าแล้ว");
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "ดำเนินการไม่สำเร็จ");
    } finally {
      setBusy(false);
    }
  }
  return (
    <main className="settings-shell">
      <Link
        className="admin-back"
        href={user.preferences?.homePage || "/my-work"}
      >
        <FiArrowLeft />
        กลับพื้นที่ทำงาน
      </Link>
      <header>
        <h1>การตั้งค่า</h1>
        <p>จัดการโปรไฟล์และปรับพื้นที่ทำงานให้เหมาะกับคุณ</p>
      </header>
      <div className="settings-layout">
        <nav aria-label="หมวดการตั้งค่า">
          <button
            type="button"
            aria-current={tab === "profile" ? "page" : undefined}
            onClick={() => {
              setTab("profile");
              setNotice("");
              setError("");
            }}
          >
            <FiUser />
            โปรไฟล์
          </button>
          <button
            type="button"
            aria-current={tab === "general" ? "page" : undefined}
            onClick={() => {
              setTab("general");
              setNotice("");
              setError("");
            }}
          >
            <FiSettings />
            ทั่วไป
          </button>
        </nav>
        <section className="settings-card">
          {tab === "profile" ? (
            <>
              <h2>โปรไฟล์ของฉัน</h2>
              <p>ชื่อและรูปโปรไฟล์ของคุณ</p>
              <div className="settings-avatar-row">
                <div className="settings-avatar">
                  {user.avatarUrl ? (
                    <Image
                      src={user.avatarUrl}
                      alt="รูปโปรไฟล์ของฉัน"
                      width={80}
                      height={80}
                      unoptimized
                    />
                  ) : (
                    <span>{nameInitials(user.name)}</span>
                  )}
                </div>
                <div>
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => file.current?.click()}
                  >
                    <FiUpload />
                    เปลี่ยนรูปโปรไฟล์
                  </button>
                  {user.avatarUrl && (
                    <button
                      type="button"
                      className="settings-remove-avatar"
                      disabled={busy}
                      onClick={() => void request("DELETE")}
                    >
                      ลบรูป
                    </button>
                  )}
                  <small>JPG, PNG, WebP หรือ GIF · ไม่เกิน 2 MB</small>
                  <input
                    type="file"
                    hidden
                    ref={file}
                    accept="image/png,image/jpeg,image/webp,image/gif"
                    onChange={(e) => {
                      const image = e.target.files?.[0];
                      e.target.value = "";
                      if (!image) return;
                      if (image.size > 2 * 1024 * 1024) {
                        setError("รูปต้องมีขนาดไม่เกิน 2 MB");
                        return;
                      }
                      const form = new FormData();
                      form.set("file", image);
                      void request("POST", form);
                    }}
                  />
                </div>
              </div>
              <form
                noValidate
                onSubmit={(e) => {
                  e.preventDefault();
                  if (!name.trim() || name.length > 100) {
                    setError("กรอกชื่อไม่เกิน 100 ตัวอักษร");
                    return;
                  }
                  void request("PATCH", { section: "profile", name });
                }}
              >
                <label htmlFor="profile-name">ชื่อที่แสดง</label>
                <input
                  id="profile-name"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  maxLength={100}
                  disabled={busy}
                />
                {user.role === "admin" && (
                  <small>ชื่อบัญชีผู้ดูแลจะไม่แสดงในรายชื่อสมาชิกของทีม</small>
                )}
                <label htmlFor="profile-email">อีเมลเข้าสู่ระบบ</label>
                <input
                  id="profile-email"
                  type="email"
                  value={user.email}
                  readOnly
                />
                <small>
                  อีเมลใช้ระบุบัญชีและสิทธิ์ จึงไม่สามารถแก้ไขจากหน้านี้ได้
                </small>
                <button
                  type="submit"
                  className="primary settings-save"
                  disabled={busy}
                >
                  {busy ? <FiLoader className="animate-spin" /> : <FiCheck />}
                  บันทึกโปรไฟล์
                </button>
              </form>
            </>
          ) : (
            <>
              <h2>ตั้งค่าทั่วไป</h2>
              <p>การตั้งค่าเหล่านี้มีผลเฉพาะบัญชีของคุณ</p>
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  void request("PATCH", { section: "general", preferences });
                }}
              >
                <label htmlFor="settings-home">
                  หน้าเริ่มต้นเมื่อเข้าสู่ระบบ
                </label>
                <AppSelect
                  id="settings-home"
                  value={preferences.homePage}
                  disabled={busy}
                  onChange={(homePage) =>
                    setPreferences((p) =>
                      normalizePreferences({ ...p, homePage }),
                    )
                  }
                >
                  <option value="/my-work">My Work</option>
                  <option value="/tasks">ตารางงานทั้งหมด</option>
                  <option value="/reports">สรุปผลงาน</option>
                  <option value="/archive">งานที่เก็บถาวร</option>
                </AppSelect>
                <label htmlFor="settings-tab">ตัวกรองเริ่มต้นในตารางงาน</label>
                <AppSelect
                  id="settings-tab"
                  value={preferences.taskTab}
                  disabled={busy}
                  onChange={(taskTab) =>
                    setPreferences((p) =>
                      normalizePreferences({ ...p, taskTab }),
                    )
                  }
                >
                  <option value="all">งานทั้งหมด</option>
                  <option value="open">ยังไม่เสร็จ</option>
                  <option value="done">เสร็จแล้ว</option>
                </AppSelect>
                <label htmlFor="settings-density">ความหนาแน่นของตาราง</label>
                <AppSelect
                  id="settings-density"
                  value={preferences.density}
                  disabled={busy}
                  onChange={(density) =>
                    setPreferences((p) =>
                      normalizePreferences({ ...p, density }),
                    )
                  }
                >
                  <option value="comfortable">ปกติ</option>
                  <option value="compact">กระชับ</option>
                </AppSelect>
                <button
                  type="submit"
                  className="primary settings-save"
                  disabled={busy}
                >
                  {busy ? <FiLoader className="animate-spin" /> : <FiCheck />}
                  บันทึกการตั้งค่า
                </button>
              </form>
            </>
          )}
          {error && (
            <div role="alert" className="auth-error">
              {error}
            </div>
          )}
          {notice && (
            <div role="status" className="settings-notice">
              <FiCheck />
              {notice}
            </div>
          )}
        </section>
      </div>
    </main>
  );
}
