import { cookies } from "next/headers";
import { createHash, randomBytes } from "node:crypto";
import { getDb } from "./db";
import type { AuthUser } from "./auth-types";
import { normalizePreferences } from "./preferences";
export const SESSION_COOKIE = "workly_session";
const COOKIE_SECONDS = 400 * 24 * 60 * 60;
export function tokenHash(value: string) {
  return createHash("sha256").update(value).digest("hex");
}
export function sameOrigin(request: Request) {
  const origin = request.headers.get("origin");
  const url = new URL(request.url),
    protocol =
      request.headers.get("x-forwarded-proto")?.split(",")[0]?.trim() ||
      url.protocol.slice(0, -1),
    host = request.headers.get("host") || url.host;
  return (
    request.headers.get("sec-fetch-site") !== "cross-site" &&
    (!origin ||
      origin === new URL(request.url).origin ||
      origin === `${protocol}://${host}` ||
      (!!process.env.APP_URL && origin === new URL(process.env.APP_URL).origin))
  );
}
export async function getSessionUser(): Promise<AuthUser | null> {
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  if (!token || !/^[a-f0-9]{64}$/.test(token)) return null;
  const db = await getDb();
  const row = await db
    .prepare(
      "SELECT u.id,u.name,u.email,u.role,u.avatar_url AS avatarUrl,u.preferences,m.id AS memberId FROM auth_sessions s JOIN auth_users u ON u.id=s.user_id JOIN members m ON m.user_id=u.id WHERE s.token_hash=?",
    )
    .bind(tokenHash(token))
    .first<Omit<AuthUser, "preferences"> & { preferences: string }>();
  if (!row) return null;
  let preferences;
  try {
    preferences = normalizePreferences(JSON.parse(row.preferences));
  } catch {
    preferences = normalizePreferences({});
  }
  return { ...row, preferences };
}
export async function setSessionCookie(token: string) {
  (await cookies()).set(SESSION_COOKIE, token, {
    httpOnly: true,
    secure:
      process.env.NODE_ENV === "production" ||
      process.env.APP_URL?.startsWith("https://") === true,
    sameSite: "lax",
    path: "/",
    maxAge: COOKIE_SECONDS,
  });
}
export async function createSession(userId: string) {
  const token = randomBytes(32).toString("hex"),
    db = await getDb();
  await db
    .prepare(
      "INSERT INTO auth_sessions(token_hash,user_id,created_at) VALUES(?,?,?)",
    )
    .bind(tokenHash(token), userId, Date.now())
    .run();
  await setSessionCookie(token);
}
export async function checkAccess(request?: Request) {
  if (
    request &&
    !["GET", "HEAD", "OPTIONS"].includes(request.method) &&
    !sameOrigin(request)
  )
    return Response.json({ error: "คำขอไม่ถูกต้อง" }, { status: 403 });
  const user = await getSessionUser();
  if (!user)
    return Response.json({ error: "กรุณาเข้าสู่ระบบ" }, { status: 401 });
  const token = (await cookies()).get(SESSION_COOKIE)!.value;
  await setSessionCookie(token);
  return null;
}
export async function rateLimit(
  action: string,
  key: string,
  limit: number,
  windowMs = 15 * 60 * 1000,
) {
  const db = await getDb(),
    now = Date.now(),
    id = tokenHash(action + ":" + key);
  const result = await db
    .prepare(
      "INSERT INTO auth_rate_limits(key,hits,reset_at) VALUES(?,1,?) ON CONFLICT(key) DO UPDATE SET hits=CASE WHEN reset_at<=? THEN 1 ELSE hits+1 END,reset_at=CASE WHEN reset_at<=? THEN excluded.reset_at ELSE reset_at END RETURNING hits",
    )
    .bind(id, now + windowMs, now, now)
    .first<{ hits: number }>();
  return !!result && result.hits <= limit;
}
export function clientAddress(request: Request) {
  return (
    request.headers.get("cf-connecting-ip") ||
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    "local"
  );
}
export async function validMembers(ids: number[]) {
  if (ids.length > 50 || ids.some((id) => !Number.isInteger(id) || id < 0))
    return false;
  if (!ids.length) return true;
  const db = await getDb(),
    rows = await db
      .prepare(
        `SELECT id FROM members WHERE id IN (${ids.map(() => "?").join(",")})`,
      )
      .bind(...ids)
      .all();
  return rows.results.length === new Set(ids).size;
}
