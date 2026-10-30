import { baseColumns, defaultLayout, type BoardLayout } from "@/lib/board";
import { withoutColumn } from "@/lib/deleted-columns";
import { checkAccess } from "@/lib/auth";
import { getDb, getBucket } from "@/lib/db";
export async function POST(request: Request) {
  const authError = await checkAccess(request);
  if (authError) return authError;

  try {
    const { name, type, options = [] } = await request.json();
    if (
      typeof name !== "string" ||
      !name.trim() ||
      name.length > 100 ||
      ![
        "text",
        "number",
        "status",
        "date",
        "checkbox",
        "url",
        "email",
        "multiselect",
        "select",
        "files",
        "timeline",
      ].includes(type)
    )
      return Response.json(
        { error: "ชื่อหรือประเภทคอลัมน์ไม่ถูกต้อง" },
        { status: 400 },
      );
    if (
      (type === "multiselect" || type === "select") &&
      (!Array.isArray(options) ||
        !options.length ||
        options.length > 50 ||
        options.some(
          (v) => typeof v !== "string" || !v.trim() || v.length > 100,
        ) ||
        new Set(options).size !== options.length)
    )
      return Response.json(
        { error: "กรุณาระบุตัวเลือกที่ไม่ซ้ำกัน 1–50 ตัวเลือก" },
        { status: 400 },
      );
    const choices = type === "multiselect" || type === "select" ? options : [];
    const id = crypto.randomUUID();
    const db = await getDb();
    await db
      .prepare(
        "INSERT INTO custom_columns(id,name,type,options) VALUES(?,?,?,?)",
      )
      .bind(id, name.trim(), type, JSON.stringify(choices))
      .run();
    return Response.json(
      { id, name: name.trim(), type, options: choices },
      { status: 201 },
    );
  } catch (error) {
    console.error("D1 column failed", error);
    return Response.json({ error: "เพิ่มคอลัมน์ไม่สำเร็จ" }, { status: 500 });
  }
}
export async function DELETE(request: Request) {
  const denied = await checkAccess(request);
  if (denied) return denied;
  try {
    const { id } = await request.json();
    if (typeof id !== "string" || id.length > 100 || id === "name")
      return Response.json(
        {
          error:
            id === "name"
              ? "คอลัมน์ชื่องานเป็นข้อมูลหลัก ไม่สามารถลบได้"
              : "คอลัมน์ไม่ถูกต้อง",
        },
        { status: 400 },
      );
    const db = await getDb(),
      settings = await db
        .prepare("SELECT layout FROM board_settings WHERE id=1")
        .first<{ layout: string }>(),
      layout: BoardLayout = settings
        ? JSON.parse(settings.layout)
        : defaultLayout,
      custom = await db
        .prepare("SELECT id FROM custom_columns WHERE id=?")
        .bind(id)
        .first();
    if (
      !custom &&
      !baseColumns.some((c) => c.id === id) &&
      !layout.deletedColumns?.includes(id)
    )
      return Response.json({ error: "ไม่พบคอลัมน์" }, { status: 404 });
    const files = (
      await db
        .prepare(
          "SELECT id FROM attachments WHERE COALESCE(column_id,'images')=?",
        )
        .bind(id)
        .all<{ id: string }>()
    ).results;
    if (files.length) {
      const bucket = await getBucket();
      await bucket.delete(files.map((file) => file.id));
    }
    const baseReset: Record<string, string> = {
        assignees: "assignees='[]',person=-1",
        status: "status=-1",
        date: "date=''",
        priority: "priority=''",
        project: "project=''",
        hours: "hours=NULL",
      },
      next = withoutColumn(layout, id);
    await db.batch([
      db
        .prepare(
          "UPDATE tasks SET custom=json_remove(custom,?,?)" +
            (baseReset[id] ? "," + baseReset[id] : ""),
        )
        .bind("$." + JSON.stringify(id), "$." + JSON.stringify("view:" + id)),
      db
        .prepare("DELETE FROM attachments WHERE COALESCE(column_id,'images')=?")
        .bind(id),
      db.prepare("DELETE FROM custom_columns WHERE id=?").bind(id),
      db
        .prepare(
          "INSERT INTO board_settings(id,layout) VALUES(1,?) ON CONFLICT(id) DO UPDATE SET layout=excluded.layout",
        )
        .bind(JSON.stringify(next)),
    ]);
    return Response.json({ ok: true, id });
  } catch {
    return Response.json(
      { error: "ลบคอลัมน์ไม่สำเร็จ กรุณาลองใหม่" },
      { status: 503 },
    );
  }
}
