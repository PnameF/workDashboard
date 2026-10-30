"use client";
import { useState } from "react";
import Link from "next/link";
import {
  validPassword,
  passwordHint,
  passwordRequirements,
} from "@/lib/password-policy";
import {
  FiActivity,
  FiArrowRight,
  FiEye,
  FiEyeOff,
  FiLock,
  FiCheckCircle,
  FiLoader,
} from "react-icons/fi";
type Mode = "login" | "signup" | "reset-password";
export default function AuthForm({ mode }: { mode: Mode }) {
  const [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    [show, setShow] = useState(false),
    [success, setSuccess] = useState(false);
  const [passwordDraft, setPasswordDraft] = useState("");
  const [confirmDraft, setConfirmDraft] = useState("");
  const passwordsDiffer = passwordDraft !== confirmDraft;
  const title =
    mode === "signup"
      ? "สร้างบัญชีของคุณ"
      : mode === "login"
        ? "ยินดีต้อนรับกลับมา"
        : "ตั้งรหัสผ่านใหม่";
  async function submit(e: React.SubmitEvent<HTMLFormElement>) {
    e.preventDefault();
    setError("");
    const form = new FormData(e.currentTarget),
      body = Object.fromEntries(form) as Record<string, string>;
    if (
      !body.email ||
      !body.password ||
      (mode === "signup" && !body.name?.trim()) ||
      (mode === "reset-password" && !body.code)
    ) {
      setError("กรุณากรอกข้อมูลให้ครบ");
      return;
    }
    if (mode !== "login" && !validPassword(body.password)) {
      setError(passwordHint);
      return;
    }
    if (mode !== "login" && body.password !== body.confirm) {
      setError("รหัสผ่านทั้งสองช่องไม่ตรงกัน");
      return;
    }
    setBusy(true);
    try {
      const response = await fetch("/api/auth/" + mode, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await response.json();
      if (!response.ok) throw Error(data.error || "ดำเนินการไม่สำเร็จ");
      if (mode === "reset-password") {
        setSuccess(true);
        return;
      }
      const target =
        new URLSearchParams(location.search).get("next") ||
        data.preferences?.homePage ||
        "/my-work";
      const safe =
        target.startsWith("/") &&
        !target.startsWith("//") &&
        !target.includes("\\") &&
        new URL(target, location.origin).origin === location.origin
          ? target
          : "/my-work";
      location.assign(safe);
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "เชื่อมต่อไม่สำเร็จ กรุณาลองอีกครั้ง",
      );
    } finally {
      setBusy(false);
    }
  }
  return (
    <main className="auth-shell">
      <section className="auth-story">
        <Link className="auth-brand" href="/login">
          <FiActivity />
          workly<span>.</span>
        </Link>
        <div className="auth-story-content">
          <span className="auth-eyebrow">A CALMER WAY TO WORK</span>
          <h1>
            พื้นที่เดียว
            <br />
            สำหรับทุกงาน
            <br />
            <span>และทุกคนในทีม</span>
          </h1>
          <p>
            วางแผน จัดการ และติดตามความคืบหน้า
            <br />
            ให้ทุกวันทำงานเป็นเรื่องง่ายขึ้น
          </p>
          <div className="auth-story-card">
            <div className="auth-story-dots">
              <i />
              <i />
              <i />
            </div>
            <strong>โฟกัสกับงานที่สำคัญ</strong>
            <span>My Work · ตารางงาน · สรุปผลงาน</span>
            <div className="auth-story-bars">
              <i />
              <i />
              <i />
            </div>
          </div>
        </div>
        <span className="auth-story-footer">YOUR WORK, IN PERSPECTIVE</span>
      </section>
      <section className="auth-panel">
        <div className="auth-card">
          {success ? (
            <div className="auth-success">
              <FiCheckCircle size={40} />
              <h2>เปลี่ยนรหัสผ่านแล้ว</h2>
              <p>
                เซสชันเดิมถูกออกจากระบบแล้ว กรุณาเข้าสู่ระบบด้วยรหัสผ่านใหม่
              </p>
              <Link className="auth-submit" href="/login">
                เข้าสู่ระบบ
                <FiArrowRight />
              </Link>
            </div>
          ) : (
            <>
              <div className="auth-icon">
                <FiLock />
              </div>
              <h2>{title}</h2>
              <p className="auth-description">
                {mode === "signup"
                  ? "เริ่มจัดการงานและทำงานร่วมกับทีม"
                  : mode === "login"
                    ? "เข้าสู่พื้นที่ทำงานของคุณ"
                    : "ใช้รหัสกู้คืนที่แอดมินกำหนดให้บัญชีของคุณ"}
              </p>
              <form noValidate onSubmit={submit}>
                {mode === "signup" && (
                  <>
                    <label htmlFor="auth-name">ชื่อที่แสดง</label>
                    <input
                      id="auth-name"
                      name="name"
                      autoComplete="name"
                      maxLength={100}
                      autoFocus
                      required
                      disabled={busy}
                    />
                  </>
                )}
                <label htmlFor="auth-email">อีเมล</label>
                <input
                  id="auth-email"
                  name="email"
                  type="email"
                  autoComplete="email"
                  autoFocus={mode !== "signup"}
                  maxLength={254}
                  required
                  disabled={busy}
                />
                {mode === "reset-password" && (
                  <>
                    <label htmlFor="auth-code">รหัสกู้คืนจากแอดมิน</label>
                    <input
                      id="auth-code"
                      name="code"
                      type="password"
                      autoComplete="off"
                      maxLength={128}
                      required
                      disabled={busy}
                    />
                    <small>
                      รหัสนี้ใช้ได้ครั้งเดียว หากไม่มีรหัสกรุณาติดต่อผู้ดูแล
                    </small>
                  </>
                )}
                <div className="auth-label-row">
                  <label htmlFor="auth-password">
                    {mode === "reset-password" ? "รหัสผ่านใหม่" : "รหัสผ่าน"}
                  </label>
                  {mode === "login" && (
                    <Link href="/reset-password">ลืมรหัสผ่าน?</Link>
                  )}
                </div>
                <div className="auth-password">
                  <input
                    id="auth-password"
                    name="password"
                    type={show ? "text" : "password"}
                    autoComplete={
                      mode === "login" ? "current-password" : "new-password"
                    }
                    minLength={mode === "login" ? undefined : 8}
                    value={passwordDraft}
                    onChange={(e) => setPasswordDraft(e.target.value)}
                    maxLength={128}
                    required
                    disabled={busy}
                  />
                  <button
                    type="button"
                    aria-label={show ? "ซ่อนรหัสผ่าน" : "แสดงรหัสผ่าน"}
                    aria-pressed={show}
                    onClick={() => setShow(!show)}
                  >
                    {show ? <FiEyeOff /> : <FiEye />}
                  </button>
                </div>
                {mode !== "login" && (
                  <>
                    <div
                      className="password-requirements"
                      aria-label="เงื่อนไขรหัสผ่าน"
                    >
                      {passwordRequirements.map((r) => (
                        <span key={r.label} data-met={r.test(passwordDraft)}>
                          <FiCheckCircle />
                          {r.label}
                        </span>
                      ))}
                    </div>
                    <label htmlFor="auth-confirm">
                      ยืนยันรหัสผ่าน{mode === "reset-password" ? "ใหม่" : ""}
                    </label>
                    <input
                      id="auth-confirm"
                      name="confirm"
                      value={confirmDraft}
                      onChange={(e) => setConfirmDraft(e.target.value)}
                      className={passwordsDiffer ? "auth-input-invalid" : ""}
                      aria-invalid={passwordsDiffer}
                      aria-describedby={
                        passwordsDiffer ? "confirm-error" : undefined
                      }
                      type={show ? "text" : "password"}
                      autoComplete="new-password"
                      maxLength={128}
                      required
                      disabled={busy}
                    />
                    {passwordsDiffer && (
                      <small id="confirm-error" className="confirm-error">
                        รหัสผ่านยังไม่ตรงกัน
                      </small>
                    )}
                  </>
                )}
                {error && (
                  <div className="auth-error" role="alert">
                    {error}
                  </div>
                )}
                <button className="auth-submit" type="submit" disabled={busy}>
                  {busy ? (
                    <>
                      <FiLoader className="animate-spin" />
                      กำลังดำเนินการ…
                    </>
                  ) : (
                    <>
                      {mode === "signup"
                        ? "สมัครสมาชิก"
                        : mode === "login"
                          ? "เข้าสู่ระบบ"
                          : "บันทึกรหัสผ่านใหม่"}
                      <FiArrowRight />
                    </>
                  )}
                </button>
              </form>
              <p className="auth-switch">
                {mode === "login" ? (
                  <>
                    ยังไม่มีบัญชี? <Link href="/signup">สมัครสมาชิก</Link>
                  </>
                ) : (
                  <>
                    มีบัญชีแล้ว? <Link href="/login">เข้าสู่ระบบ</Link>
                  </>
                )}
              </p>
              <div className="auth-note">
                {mode === "signup"
                  ? "ผู้สมัครเข้าถึงพื้นที่ทำงานของทีมได้ทันที"
                  : mode === "login"
                    ? "จดจำการเข้าสู่ระบบบนเบราว์เซอร์นี้ แม้ปิดแท็บหรือปิดเบราว์เซอร์"
                    : "รหัสกู้คืนเดิมจะใช้ซ้ำไม่ได้หลังเปลี่ยนรหัสผ่านสำเร็จ"}
              </div>
            </>
          )}
        </div>
        <span className="auth-panel-footer">Made for a more focused team.</span>
      </section>
    </main>
  );
}
