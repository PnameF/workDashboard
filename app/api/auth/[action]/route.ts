import { cookies } from "next/headers";
import { randomUUID } from "node:crypto";
import { getDb } from "@/lib/db";
import {
  checkAccess,
  clientAddress,
  createSession,
  getSessionUser,
  rateLimit,
  sameOrigin,
  SESSION_COOKIE,
  tokenHash,
} from "@/lib/auth";
import {
  hashPassword,
  validPassword,
  validRecoveryCode,
  verifyPassword,
} from "@/lib/password";
import { passwordHint, roleForEmail } from "@/lib/password-policy";
type Context = { params: Promise<{ action: string }> };
export const dynamic = "force-dynamic";
export async function GET(request: Request, { params }: Context) {
  const { action } = await params;
  if (action !== "me" && action !== "users")
    return Response.json({ error: "ไม่พบรายการ" }, { status: 404 });
  const denied = await checkAccess(request);
  if (denied) return denied;
  const user = (await getSessionUser())!;
  if (action === "me")
    return Response.json(user, { headers: { "Cache-Control": "no-store" } });
  if (user.role !== "admin")
    return Response.json({ error: "สำหรับผู้ดูแลเท่านั้น" }, { status: 403 });
  const db = await getDb();
  return Response.json(
    (
      await db
        .prepare(
          "SELECT u.id,u.name,u.email,u.role,r.created_at AS recovery_set_at FROM auth_users u LEFT JOIN auth_recovery r ON r.user_id=u.id ORDER BY u.created_at",
        )
        .all()
    ).results,
    { headers: { "Cache-Control": "no-store" } },
  );
}
export async function POST(request: Request, { params }: Context) {
  try {
    const { action } = await params;
    if (!sameOrigin(request))
      return Response.json({ error: "คำขอไม่ถูกต้อง" }, { status: 403 });
    const db = await getDb();
    if (action === "logout") {
      const token = (await cookies()).get(SESSION_COOKIE)?.value;
      if (token)
        await db
          .prepare("DELETE FROM auth_sessions WHERE token_hash=?")
          .bind(tokenHash(token))
          .run();
      (await cookies()).set(SESSION_COOKIE, "", {
        httpOnly: true,
        sameSite: "lax",
        path: "/",
        maxAge: 0,
        secure: process.env.NODE_ENV === "production",
      });
      return Response.json({ ok: true });
    }
    if (action === "recovery-code") {
      const denied = await checkAccess(request);
      if (denied) return denied;
      const user = (await getSessionUser())!;
      if (user.role !== "admin")
        return Response.json(
          { error: "สำหรับผู้ดูแลเท่านั้น" },
          { status: 403 },
        );
      const body = await request.json();
      if (typeof body.userId !== "string" || !validRecoveryCode(body.code))
        return Response.json(
          { error: "รหัสกู้คืนต้องยาว 12–128 ตัวอักษร" },
          { status: 400 },
        );
      if (
        !(await db
          .prepare("SELECT id FROM auth_users WHERE id=?")
          .bind(body.userId)
          .first())
      )
        return Response.json({ error: "ไม่พบบัญชี" }, { status: 404 });
      await db
        .prepare(
          "INSERT INTO auth_recovery(user_id,code_hash,issued_by,created_at) VALUES(?,?,?,?) ON CONFLICT(user_id) DO UPDATE SET code_hash=excluded.code_hash,issued_by=excluded.issued_by,created_at=excluded.created_at",
        )
        .bind(body.userId, await hashPassword(body.code), user.id, Date.now())
        .run();
      return Response.json({ ok: true });
    }
    if (!["signup", "login", "reset-password"].includes(action))
      return Response.json({ error: "ไม่พบรายการ" }, { status: 404 });
    const body = await request.json(),
      email =
        typeof body.email === "string" ? body.email.trim().toLowerCase() : "";
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 254)
      return Response.json(
        { error: "กรุณากรอกอีเมลให้ถูกต้อง" },
        { status: 400 },
      );
    if (
      !(await rateLimit(
        action + ":ip",
        clientAddress(request),
        action === "signup" ? 20 : 80,
      )) ||
      !(await rateLimit(action + ":email", email, action === "signup" ? 5 : 10))
    )
      return Response.json(
        { error: "ลองหลายครั้งเกินไป กรุณารอ 15 นาที" },
        { status: 429, headers: { "Retry-After": "900" } },
      );
    if (action === "signup") {
      const name = typeof body.name === "string" ? body.name.trim() : "";
      if (!name || name.length > 100 || !validPassword(body.password))
        return Response.json(
          { error: "กรอกชื่อ และ" + passwordHint },
          { status: 400 },
        );
      if (
        await db
          .prepare("SELECT id FROM auth_users WHERE email=?")
          .bind(email)
          .first()
      )
        return Response.json(
          {
            error:
              "ไม่สามารถใช้อีเมลนี้สมัครได้ กรุณาเข้าสู่ระบบหรือใช้รหัสกู้คืน",
          },
          { status: 409 },
        );
      const id = randomUUID(),
        password = await hashPassword(body.password);
      await db.batch([
        db
          .prepare(
            "INSERT INTO auth_users(id,email,name,password_hash,role,created_at) VALUES(?,?,?,?,?,?)",
          )
          .bind(id, email, name, password, roleForEmail(email), Date.now()),
        db
          .prepare(
            "INSERT INTO members(id,name,user_id) SELECT COALESCE(MAX(id),-1)+1,?,? FROM members",
          )
          .bind(name, id),
      ]);
      await createSession(id);
      return Response.json(await getSessionUser(), { status: 201 });
    }
    const user = await db
      .prepare("SELECT id,password_hash FROM auth_users WHERE email=?")
      .bind(email)
      .first<{ id: string; password_hash: string }>();
    if (action === "login") {
      if (typeof body.password !== "string" || body.password.length > 128)
        return Response.json(
          { error: "อีเมลหรือรหัสผ่านไม่ถูกต้อง" },
          { status: 401 },
        );
      if (!(await verifyPassword(body.password, user?.password_hash)) || !user)
        return Response.json(
          { error: "อีเมลหรือรหัสผ่านไม่ถูกต้อง" },
          { status: 401 },
        );
      await createSession(user.id);
      return Response.json(await getSessionUser());
    }
    if (!validPassword(body.password) || !validRecoveryCode(body.code))
      return Response.json(
        { error: passwordHint + " และกรอกรหัสกู้คืนจากแอดมินให้ถูกต้อง" },
        { status: 400 },
      );
    const recovery = user
      ? await db
          .prepare("SELECT code_hash FROM auth_recovery WHERE user_id=?")
          .bind(user.id)
          .first<{ code_hash: string }>()
      : null;
    if (
      !(await verifyPassword(body.code, recovery?.code_hash)) ||
      !user ||
      !recovery
    )
      return Response.json(
        { error: "อีเมลหรือรหัสกู้คืนไม่ถูกต้อง หรือรหัสถูกใช้แล้ว" },
        { status: 400 },
      );
    const password = await hashPassword(body.password);
    const results = await db.batch([
      db
        .prepare(
          "UPDATE auth_users SET password_hash=? WHERE id=? AND EXISTS(SELECT 1 FROM auth_recovery WHERE user_id=? AND code_hash=?)",
        )
        .bind(password, user.id, user.id, recovery.code_hash),
      db
        .prepare(
          "DELETE FROM auth_sessions WHERE user_id=? AND EXISTS(SELECT 1 FROM auth_recovery WHERE user_id=? AND code_hash=?)",
        )
        .bind(user.id, user.id, recovery.code_hash),
      db
        .prepare("DELETE FROM auth_recovery WHERE user_id=? AND code_hash=?")
        .bind(user.id, recovery.code_hash),
    ]);
    if (!results[0].meta.changes)
      return Response.json({ error: "รหัสกู้คืนถูกใช้แล้ว" }, { status: 400 });
    return Response.json({ ok: true });
  } catch {
    console.error("Authentication request failed");
    return Response.json(
      { error: "ดำเนินการไม่สำเร็จ กรุณาลองอีกครั้ง" },
      { status: 500 },
    );
  }
}
