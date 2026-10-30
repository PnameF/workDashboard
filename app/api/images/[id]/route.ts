import { checkAccess } from "@/lib/auth";
import { getDb, getBucket } from "@/lib/db";
type Context = { params: Promise<{ id: string }> };
export async function GET(_request: Request, { params }: Context) {
  const authError = await checkAccess(_request);
  if (authError) return authError;

  const { id } = await params;
  const [db, bucket] = await Promise.all([getDb(), getBucket()]);
  const meta = await db
    .prepare(
      "SELECT id,name,content_type FROM attachments WHERE id=? UNION ALL SELECT id,name,content_type FROM task_update_files WHERE id=?",
    )
    .bind(id, id)
    .first<{ id: string; name: string; content_type: string }>();
  if (!meta) return new Response("Not found", { status: 404 });
  const object = await bucket.get(id);
  if (!object) return new Response("Not found", { status: 404 });
  const headers = new Headers();
  headers.set(
    "Content-Type",
    object.httpMetadata?.contentType || "application/octet-stream",
  );
  headers.set("X-Content-Type-Options", "nosniff");
  headers.set("Cache-Control", "private, max-age=60");
  const filename = encodeURIComponent(meta.name).replace(
    /['()*]/g,
    (c) => "%" + c.charCodeAt(0).toString(16),
  );
  headers.set(
    "Content-Disposition",
    `${meta.content_type.startsWith("image/") ? "inline" : "attachment"}; filename*=UTF-8''${filename}`,
  );
  return new Response(await object.arrayBuffer(), { headers });
}
export async function DELETE(_request: Request, { params }: Context) {
  const authError = await checkAccess(_request);
  if (authError) return authError;

  try {
    const { id } = await params;
    const [db, bucket] = await Promise.all([getDb(), getBucket()]);
    if (
      !(await db
        .prepare("SELECT id FROM attachments WHERE id=?")
        .bind(id)
        .first())
    )
      return Response.json({ error: "ไม่พบไฟล์แนบในตาราง" }, { status: 404 });
    await bucket.delete(id);
    await db.prepare("DELETE FROM attachments WHERE id=?").bind(id).run();
    return Response.json({ ok: true });
  } catch (error) {
    console.error("R2 delete failed", error);
    return Response.json({ error: "ลบรูปไม่สำเร็จ" }, { status: 500 });
  }
}
