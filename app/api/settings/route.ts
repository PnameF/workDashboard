import { checkAccess, getSessionUser } from "@/lib/auth";
import { getDb, getBucket, getPublicFileUrl } from "@/lib/db";
import { normalizePreferences } from "@/lib/preferences";
export async function GET(request: Request) {
  const denied = await checkAccess(request);
  if (denied) return denied;
  return Response.json(await getSessionUser(), {
    headers: { "Cache-Control": "no-store" },
  });
}
export async function PATCH(request: Request) {
  const denied = await checkAccess(request);
  if (denied) return denied;
  try {
    const user = (await getSessionUser())!,
      body = await request.json(),
      db = await getDb();
    if (body.section === "profile") {
      if (
        typeof body.name !== "string" ||
        !body.name.trim() ||
        body.name.length > 100
      )
        return Response.json(
          { error: "กรอกชื่อไม่เกิน 100 ตัวอักษร" },
          { status: 400 },
        );
      await db.batch([
        db
          .prepare("UPDATE auth_users SET name=? WHERE id=?")
          .bind(body.name.trim(), user.id),
        db
          .prepare("UPDATE members SET name=? WHERE user_id=?")
          .bind(body.name.trim(), user.id),
      ]);
    } else if (body.section === "general") {
      const p = body.preferences;
      if (
        !p ||
        !["/my-work", "/tasks", "/reports", "/archive"].includes(p.homePage) ||
        !["all", "open", "done"].includes(p.taskTab) ||
        !["comfortable", "compact"].includes(p.density)
      )
        return Response.json(
          { error: "การตั้งค่าไม่ถูกต้อง" },
          { status: 400 },
        );
      await db
        .prepare("UPDATE auth_users SET preferences=? WHERE id=?")
        .bind(JSON.stringify(normalizePreferences(p)), user.id)
        .run();
    } else
      return Response.json({ error: "ไม่พบรายการตั้งค่า" }, { status: 400 });
    return Response.json(await getSessionUser());
  } catch {
    return Response.json(
      { error: "บันทึกการตั้งค่าไม่สำเร็จ" },
      { status: 500 },
    );
  }
}
export async function POST(request: Request) {
  const denied = await checkAccess(request);
  if (denied) return denied;
  try {
    const user = (await getSessionUser())!,
      form = await request.formData(),
      file = form.get("file");
    if (
      !(file instanceof File) ||
      !["image/png", "image/jpeg", "image/webp", "image/gif"].includes(
        file.type,
      ) ||
      file.size === 0 ||
      file.size > 2 * 1024 * 1024
    )
      return Response.json(
        { error: "เลือกรูป JPG, PNG, WebP หรือ GIF ขนาดไม่เกิน 2 MB" },
        { status: 400 },
      );
    const bytes = new Uint8Array(await file.arrayBuffer()),
      head = new TextDecoder().decode(bytes.slice(0, 12)),
      valid =
        file.type === "image/png"
          ? Array.from(bytes.slice(0, 8)).join(",") ===
            "137,80,78,71,13,10,26,10"
          : file.type === "image/jpeg"
            ? bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255
            : file.type === "image/gif"
              ? /^GIF8[79]a/.test(head)
              : head.startsWith("RIFF") &&
                new TextDecoder().decode(bytes.slice(8, 12)) === "WEBP";
    if (!valid)
      return Response.json(
        { error: "เนื้อหาไฟล์ไม่ตรงกับชนิดรูปภาพ" },
        { status: 400 },
      );
    const db = await getDb(),
      bucket = await getBucket(),
      previous = await db
        .prepare("SELECT avatar_id FROM auth_users WHERE id=?")
        .bind(user.id)
        .first<{ avatar_id: string | null }>(),
      id = crypto.randomUUID(),
      url = await getPublicFileUrl(id);
    await bucket.put(id, bytes, { httpMetadata: { contentType: file.type } });
    try {
      await db
        .prepare("UPDATE auth_users SET avatar_id=?,avatar_url=? WHERE id=?")
        .bind(id, url, user.id)
        .run();
    } catch (error) {
      await bucket.delete(id);
      throw error;
    }
    if (previous?.avatar_id)
      await bucket.delete(previous.avatar_id).catch(() => {});
    return Response.json(await getSessionUser());
  } catch {
    return Response.json(
      { error: "อัปโหลดรูปโปรไฟล์ไม่สำเร็จ" },
      { status: 500 },
    );
  }
}
export async function DELETE(request: Request) {
  const denied = await checkAccess(request);
  if (denied) return denied;
  try {
    const user = (await getSessionUser())!,
      db = await getDb(),
      previous = await db
        .prepare("SELECT avatar_id FROM auth_users WHERE id=?")
        .bind(user.id)
        .first<{ avatar_id: string | null }>();
    await db
      .prepare(
        "UPDATE auth_users SET avatar_id=NULL,avatar_url=NULL WHERE id=?",
      )
      .bind(user.id)
      .run();
    if (previous?.avatar_id)
      await (await getBucket()).delete(previous.avatar_id);
    return Response.json(await getSessionUser());
  } catch {
    return Response.json({ error: "ลบรูปโปรไฟล์ไม่สำเร็จ" }, { status: 500 });
  }
}
