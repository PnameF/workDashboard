import { checkAccess } from "@/lib/auth";
import { getDb, getBucket } from "@/lib/db";
import { defaultLayout } from "@/lib/board";
import { taskTreeSql } from "@/lib/subtasks";
export async function POST(request: Request) {
  const authError = await checkAccess(request);
  if (authError) return authError;

  try {
    const { name, color = "#7b8fae" } = await request.json();
    if (
      typeof name !== "string" ||
      !name.trim() ||
      name.length > 60 ||
      typeof color !== "string" ||
      !/^#[0-9a-f]{6}$/i.test(color)
    )
      return Response.json(
        { error: "ชื่อหรือสีกลุ่มไม่ถูกต้อง" },
        { status: 400 },
      );
    const db = await getDb();
    const id = crypto.randomUUID();
    await db
      .prepare("INSERT INTO task_groups(id,name,color) VALUES(?,?,?)")
      .bind(id, name.trim(), color)
      .run();
    return Response.json({ id, name: name.trim(), color }, { status: 201 });
  } catch (error) {
    console.error("Group create failed", error);
    return Response.json({ error: "สร้างกลุ่มไม่สำเร็จ" }, { status: 500 });
  }
}
export async function DELETE(request: Request) {
  const authError = await checkAccess(request);
  if (authError) return authError;

  try {
    const { id } = await request.json();
    if (typeof id !== "string")
      return Response.json({ error: "กลุ่มไม่ถูกต้อง" }, { status: 400 });
    const db = await getDb();
    const used = await db
      .prepare("SELECT id FROM tasks WHERE group_id=? LIMIT 1")
      .bind(id)
      .first();
    if (used)
      return Response.json({ error: "ย้ายงานออกก่อนลบกลุ่ม" }, { status: 409 });
    await db.prepare("DELETE FROM task_groups WHERE id=?").bind(id).run();
    return Response.json({ ok: true });
  } catch (error) {
    console.error("Group delete failed", error);
    return Response.json({ error: "ลบกลุ่มไม่สำเร็จ" }, { status: 500 });
  }
}
export async function PATCH(request: Request) {
  const denied = await checkAccess(request);
  if (denied) return denied;
  try {
    const { id, action, expectedCount } = await request.json();
    if (
      typeof id !== "string" ||
      id.length > 100 ||
      !["archive", "delete", "restore"].includes(action) ||
      !Number.isInteger(expectedCount) ||
      expectedCount < 0
    )
      return Response.json({ error: "คำสั่งกลุ่มไม่ถูกต้อง" }, { status: 400 });
    const db = await getDb();
    if (
      !["todo", "done"].includes(id) &&
      !(await db
        .prepare("SELECT id FROM task_groups WHERE id=?")
        .bind(id)
        .first())
    )
      return Response.json({ error: "ไม่พบกลุ่ม" }, { status: 404 });
    const group =
        "COALESCE(group_id,CASE WHEN status=2 THEN 'done' ELSE 'todo' END)",
      rows = (
        await db
          .prepare(
            action === "restore"
              ? "SELECT id FROM tasks WHERE archived_group_id=? AND archived_at IS NOT NULL"
              : `SELECT id FROM tasks WHERE ${group}=? AND archived_at IS NULL`,
          )
          .bind(id)
          .all<{ id: string }>()
      ).results;
    if (rows.length !== expectedCount)
      return Response.json(
        { error: "จำนวนงานเปลี่ยนไป กรุณาโหลดใหม่และตรวจสอบอีกครั้ง" },
        { status: 409 },
      );
    const tasks = JSON.stringify(rows.map((row) => row.id)),
      files =
        action === "delete"
          ? (
              await db
                .prepare(
                  `${taskTreeSql} SELECT id FROM attachments WHERE task_id IN(SELECT id FROM tree) UNION ALL SELECT id FROM task_update_files WHERE task_id IN(SELECT id FROM tree)`,
                )
                .bind(tasks)
                .all<{ id: string }>()
            ).results
          : [],
      statements = [
        db
          .prepare(
            "INSERT OR IGNORE INTO board_settings(id,layout) VALUES(1,?)",
          )
          .bind(JSON.stringify(defaultLayout)),
      ];
    if (rows.length)
      statements.push(
        action === "archive"
          ? db
              .prepare(
                "UPDATE tasks SET archived_at=CURRENT_TIMESTAMP,archived_group_id=?,archived_parent_id=CASE WHEN parent_id IN(SELECT value FROM json_each(?)) THEN parent_id ELSE NULL END WHERE id IN(SELECT value FROM json_each(?)) AND archived_at IS NULL",
              )
              .bind(id, tasks, tasks)
          : action === "restore"
            ? db
                .prepare(
                  "UPDATE tasks SET archived_at=NULL,archived_group_id=NULL,archived_parent_id=NULL WHERE id IN(SELECT value FROM json_each(?))",
                )
                .bind(tasks)
            : db
                .prepare(
                  "DELETE FROM tasks WHERE id IN(SELECT value FROM json_each(?)) AND archived_at IS NULL",
                )
                .bind(tasks),
      );
    if (action === "restore") {
      statements.push(
        db
          .prepare(
            "UPDATE board_settings SET layout=json_set(layout,'$.hiddenGroups',json((SELECT json_group_array(value) FROM json_each(layout,'$.hiddenGroups') WHERE value<>?)),'$.archivedGroups',json((SELECT json_group_array(value) FROM json_each(layout,'$.archivedGroups') WHERE value<>? OR EXISTS(SELECT 1 FROM tasks WHERE archived_group_id=? AND archived_at IS NOT NULL)))) WHERE id=1",
          )
          .bind(id, id, id),
      );
    } else {
      statements.push(
        db
          .prepare(
            `UPDATE board_settings SET layout=json_set(layout,'$.hiddenGroups',json((SELECT json_group_array(value) FROM(SELECT value FROM json_each(layout,'$.hiddenGroups') UNION SELECT ?)))) WHERE id=1 AND NOT EXISTS(SELECT 1 FROM tasks WHERE ${group}=? AND archived_at IS NULL)`,
          )
          .bind(id, id),
      );
      if (action === "archive")
        statements.push(
          db
            .prepare(
              "UPDATE board_settings SET layout=json_set(layout,'$.archivedGroups',json((SELECT json_group_array(value) FROM(SELECT value FROM json_each(layout,'$.archivedGroups') UNION SELECT ?)))) WHERE id=1",
            )
            .bind(id),
        );
    }
    await db.batch(statements);
    if (files.length) {
      try {
        const bucket = await getBucket();
        await bucket.delete(files.map((file) => file.id));
      } catch (error) {
        console.error("Group file cleanup failed", error);
      }
    }
    return Response.json({ id, action, count: rows.length });
  } catch {
    return Response.json(
      { error: "ดำเนินการกับกลุ่มไม่สำเร็จ" },
      { status: 503 },
    );
  }
}
