import { checkAccess, getSessionUser, rateLimit } from "@/lib/auth";
import { getDb, getBucket, getPublicFileUrl } from "@/lib/db";
import {
  MAX_UPDATE_IMAGES,
  validUpdateImage,
  validImageSignature,
} from "@/lib/update-images";
import type { Attachment } from "@/lib/types";
import { validUpdateCursor, type TaskUpdate } from "@/lib/task-updates";
type Context = { params: Promise<{ id: string }> };
const select =
  "SELECT c.id,c.body,c.created_at,c.updated_at,CASE WHEN u.role='admin' THEN 'ผู้ดูแลระบบ' ELSE COALESCE(u.name,'สมาชิกที่ถูกลบ') END AS authorName,CASE WHEN u.role='admin' THEN NULL ELSE u.avatar_url END AS avatarUrl,CASE WHEN u.role='admin' THEN 1 ELSE 0 END AS isAdmin,c.author_id FROM task_updates c LEFT JOIN auth_users u ON u.id=c.author_id";
type Row = Omit<TaskUpdate, "canEdit" | "isAdmin"> & {
  author_id: string | null;
  isAdmin: number;
};
export const dynamic = "force-dynamic";
async function context(request: Request, route: Context) {
  const error = await checkAccess(request);
  if (error) return { error };
  const user = await getSessionUser();
  if (!user)
    return {
      error: Response.json({ error: "กรุณาเข้าสู่ระบบ" }, { status: 401 }),
    };
  const { id } = await route.params;
  if (!id || id.length > 100)
    return { error: Response.json({ error: "ไม่พบงาน" }, { status: 404 }) };
  const db = await getDb(),
    task = await db
      .prepare("SELECT id FROM tasks WHERE id=? AND archived_at IS NULL")
      .bind(id)
      .first();
  if (!task)
    return {
      error: Response.json(
        { error: "งานถูกลบหรือเก็บถาวรแล้ว" },
        { status: 404 },
      ),
    };
  return { user, id, db };
}
function item(row: Row, user: { id: string; role: string }): TaskUpdate {
  const { author_id, isAdmin, ...rest } = row;
  return {
    ...rest,
    isAdmin: !!isAdmin,
    canEdit: author_id === user.id || user.role === "admin",
  };
}
export async function GET(request: Request, route: Context) {
  try {
    const ctx = await context(request, route);
    if (ctx.error) return ctx.error;
    const { db, user, id } = ctx,
      cursorText = new URL(request.url).searchParams.get("before"),
      cursor = validUpdateCursor(cursorText);
    if (cursorText && !cursor)
      return Response.json(
        { error: "ตำแหน่งรายการไม่ถูกต้อง" },
        { status: 400 },
      );
    let query = db.prepare(
      select +
        " WHERE c.task_id=?" +
        (cursor ? " AND (c.created_at<? OR (c.created_at=? AND c.id<?))" : "") +
        " ORDER BY c.created_at DESC,c.id DESC LIMIT 31",
    );
    query = cursor
      ? query.bind(id, cursor.time, cursor.time, cursor.id)
      : query.bind(id);
    const rows = (await query.all<Row>()).results,
      hasMore = rows.length > 30,
      visible = rows.slice(0, 30),
      last = visible.at(-1);
    const files = visible.length
      ? (
          await db
            .prepare(
              "SELECT id,task_id,update_id,name,content_type,size,url FROM task_update_files WHERE update_id IN(SELECT value FROM json_each(?))",
            )
            .bind(JSON.stringify(visible.map((row) => row.id)))
            .all<Attachment & { update_id: string }>()
        ).results
      : [];
    return Response.json(
      {
        items: visible.map((row) => ({
          ...item(row, user),
          images: files.filter((file) => file.update_id === row.id),
        })),
        nextCursor: hasMore && last ? `${last.created_at}:${last.id}` : null,
      },
      { headers: { "Cache-Control": "private, no-store" } },
    );
  } catch {
    return Response.json({ error: "โหลดอัปเดตไม่สำเร็จ" }, { status: 503 });
  }
}
export async function POST(request: Request, route: Context) {
  const uploaded: string[] = [];
  let bucket: Awaited<ReturnType<typeof getBucket>> | undefined;
  try {
    const ctx = await context(request, route);
    if (ctx.error) return ctx.error;
    let body: unknown,
      images: File[] = [];
    if (request.headers.get("content-type")?.includes("multipart/form-data")) {
      if (Number(request.headers.get("content-length")) > 13 * 1024 * 1024)
        return Response.json(
          { error: "ขนาดไฟล์รวมเกินกำหนด" },
          { status: 413 },
        );
      const form = await request.formData();
      body = form.get("body") ?? "";
      const values = form.getAll("images");
      if (values.some((v) => !(v instanceof File)))
        return Response.json({ error: "รูปภาพไม่ถูกต้อง" }, { status: 400 });
      images = values as File[];
    } else body = (await request.json()).body;
    if (
      typeof body !== "string" ||
      body.length > 10000 ||
      body.includes("\u0000") ||
      (!body.trim() && !images.length) ||
      images.length > MAX_UPDATE_IMAGES ||
      images.some((file) => !validUpdateImage(file))
    )
      return Response.json(
        { error: "พิมพ์ข้อความหรือแนบรูปได้สูงสุด 6 รูป รูปละไม่เกิน 2MB" },
        { status: 400 },
      );
    const { db, user, id } = ctx;
    if (!(await rateLimit("task-update", user.id, 30, 60000)))
      return Response.json(
        { error: "ส่งข้อความถี่เกินไป กรุณารอสักครู่" },
        { status: 429 },
      );
    const checked = await Promise.all(
      images.map(async (file) => {
        const bytes = new Uint8Array(await file.arrayBuffer());
        return { file, bytes, valid: validImageSignature(bytes, file.type) };
      }),
    );
    if (checked.some((file) => !file.valid))
      return Response.json(
        { error: "เนื้อหาไฟล์ไม่ตรงกับชนิดรูปภาพ" },
        { status: 400 },
      );
    const updateId = crypto.randomUUID(),
      now = Date.now(),
      files: Attachment[] = [],
      statements = [
        db
          .prepare(
            "INSERT INTO task_updates(id,task_id,author_id,body,created_at,updated_at) SELECT ?,id,?,?,?,? FROM tasks WHERE id=? AND archived_at IS NULL",
          )
          .bind(updateId, user.id, body.trim(), now, now, id),
      ];
    if (checked.length) bucket = await getBucket();
    for (const { file, bytes } of checked) {
      const fileId = crypto.randomUUID(),
        url = await getPublicFileUrl(fileId);
      await bucket!.put(fileId, bytes, {
        httpMetadata: { contentType: file.type },
      });
      uploaded.push(fileId);
      const meta = {
        id: fileId,
        task_id: id,
        name: file.name.slice(0, 250),
        content_type: file.type,
        size: file.size,
        url,
      };
      files.push(meta);
      statements.push(
        db
          .prepare(
            "INSERT INTO task_update_files(id,task_id,update_id,name,content_type,size,url) VALUES(?,?,?,?,?,?,?)",
          )
          .bind(fileId, id, updateId, meta.name, file.type, file.size, url),
      );
    }
    const result = await db.batch(statements);
    if (!result[0].meta.changes)
      return Response.json({ error: "งานถูกเปลี่ยนแปลงแล้ว" }, { status: 409 });
    return Response.json(
      {
        id: updateId,
        body: body.trim(),
        created_at: now,
        updated_at: now,
        authorName: user.role === "admin" ? "ผู้ดูแลระบบ" : user.name,
        avatarUrl: user.role === "admin" ? null : user.avatarUrl || null,
        isAdmin: user.role === "admin",
        canEdit: true,
        images: files,
      },
      { status: 201 },
    );
  } catch (error) {
    if (bucket)
      await Promise.all(
        uploaded.map((id) => bucket!.delete(id).catch(() => {})),
      );
    console.error("Task update creation failed", error);
    return Response.json({ error: "บันทึกอัปเดตไม่สำเร็จ" }, { status: 503 });
  }
}
export async function PATCH(request: Request, route: Context) {
  try {
    const ctx = await context(request, route);
    if (ctx.error) return ctx.error;
    const { updateId, body } = await request.json();
    if (
      typeof updateId !== "string" ||
      updateId.length > 100 ||
      typeof body !== "string" ||
      body.length > 10000 ||
      body.includes("\u0000")
    )
      return Response.json({ error: "ข้อความไม่ถูกต้อง" }, { status: 400 });
    if (
      !body.trim() &&
      !(await ctx.db
        .prepare("SELECT id FROM task_update_files WHERE update_id=? LIMIT 1")
        .bind(updateId)
        .first())
    )
      return Response.json(
        { error: "กรุณาพิมพ์ข้อความหรือแนบรูป" },
        { status: 400 },
      );
    const { db, user, id } = ctx,
      result = await db
        .prepare(
          "UPDATE task_updates SET body=?,updated_at=? WHERE id=? AND task_id=? AND (author_id=? OR ?='admin') AND EXISTS(SELECT 1 FROM tasks WHERE id=? AND archived_at IS NULL)",
        )
        .bind(body.trim(), Date.now(), updateId, id, user.id, user.role, id)
        .run();
    if (!result.meta.changes)
      return Response.json(
        { error: "ไม่พบข้อความหรือไม่มีสิทธิ์แก้ไข" },
        { status: 403 },
      );
    const row = await db
      .prepare(select + " WHERE c.id=?")
      .bind(updateId)
      .first<Row>();
    return Response.json({
      ...item(row!, user),
      images: (
        await db
          .prepare(
            "SELECT id,task_id,name,content_type,size,url FROM task_update_files WHERE update_id=?",
          )
          .bind(updateId)
          .all<Attachment>()
      ).results,
    });
  } catch {
    return Response.json({ error: "แก้ไขอัปเดตไม่สำเร็จ" }, { status: 503 });
  }
}
export async function DELETE(request: Request, route: Context) {
  try {
    const ctx = await context(request, route);
    if (ctx.error) return ctx.error;
    const { updateId } = await request.json();
    if (typeof updateId !== "string" || updateId.length > 100)
      return Response.json({ error: "ข้อความไม่ถูกต้อง" }, { status: 400 });
    const { db, user, id } = ctx,
      files = (
        await db
          .prepare(
            "SELECT f.id FROM task_update_files f JOIN task_updates c ON c.id=f.update_id WHERE c.id=? AND c.task_id=? AND (c.author_id=? OR ?='admin')",
          )
          .bind(updateId, id, user.id, user.role)
          .all<{ id: string }>()
      ).results;
    const result = await db
      .prepare(
        "DELETE FROM task_updates WHERE id=? AND task_id=? AND (author_id=? OR ?='admin')",
      )
      .bind(updateId, id, user.id, user.role)
      .run();
    if (!result.meta.changes)
      return Response.json(
        { error: "ไม่พบข้อความหรือไม่มีสิทธิ์ลบ" },
        { status: 403 },
      );
    if (files.length) {
      try {
        const bucket = await getBucket();
        await bucket.delete(files.map((f) => f.id));
      } catch (error) {
        console.error("Update image cleanup failed", error);
      }
    }
    return Response.json({ id: updateId });
  } catch {
    return Response.json({ error: "ลบอัปเดตไม่สำเร็จ" }, { status: 503 });
  }
}
