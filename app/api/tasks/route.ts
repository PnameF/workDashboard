import { applyDeletedColumns } from "@/lib/deleted-columns";
import type { Database, Statement } from "@/lib/database";
import { checkAccess, getAuthorizedUser } from "@/lib/auth";
import { getDb, getBucket } from "@/lib/db";
import type { Task, TaskSaveResult } from "@/lib/types";
import { validTimelines } from "@/lib/timeline-validation";
import { taskTreeSql } from "@/lib/subtasks";
import { validMemberColumns } from "@/lib/member-columns";
import { syncTaskStatus, validTaskStatuses } from "@/lib/task-status";
import { loadTaskSchema, type TaskSchema } from "@/lib/task-schema";
function enforceDeleted(t: Task, schema: TaskSchema) {
  Object.assign(t, applyDeletedColumns(t, schema.layout));
  syncTaskStatus(t, schema.layout);
}
async function saveAndRead(
  db: Database,
  statement: Statement,
  id: string,
): Promise<TaskSaveResult | null> {
  const [write, rows, settings] = await db.batch([
    statement,
    db.prepare("SELECT * FROM tasks WHERE id=?").bind(id),
    db
      .prepare(
        "SELECT layout FROM board_settings WHERE id=1 AND EXISTS(SELECT 1 FROM tasks WHERE id=? AND parent_id IS NULL AND status=2 AND archived_at IS NULL)",
      )
      .bind(id),
  ]);
  const saved = rows.results[0] as unknown as
    | (Omit<Task, "custom" | "assignees"> & {
        custom: string;
        assignees: string;
      })
    | undefined;
  if (!write.meta.changes || !saved) return null;
  const assignees = JSON.parse(saved.assignees) as number[];
  return {
    ...saved,
    custom: JSON.parse(saved.custom),
    assignees: assignees.length
      ? assignees
      : saved.person >= 0
        ? [saved.person]
        : [],
    ...(settings.results[0]
      ? { layout: JSON.parse(String(settings.results[0].layout)) }
      : {}),
  };
}
function valid(t: Task) {
  return (
    typeof t.name === "string" &&
    t.name.trim().length > 0 &&
    t.name.length <= 250 &&
    Array.isArray(t.assignees) &&
    t.assignees.length >= 0 &&
    t.assignees.length <= 50 &&
    t.assignees.every((p) => Number.isInteger(p) && p >= 0) &&
    new Set(t.assignees).size === t.assignees.length &&
    Number.isInteger(t.status) &&
    t.status >= -1 &&
    t.status <= 3 &&
    (t.date === "" || /^\d{4}-\d{2}-\d{2}$/.test(t.date)) &&
    ["", "สูง", "ปานกลาง", "ต่ำ"].includes(t.priority) &&
    typeof t.project === "string" &&
    t.project.length <= 100 &&
    (t.hours === null || (Number.isFinite(t.hours) && t.hours >= 0)) &&
    t.custom !== null &&
    typeof t.custom === "object" &&
    !Array.isArray(t.custom) &&
    Object.entries(t.custom).every(
      ([k, v]) =>
        k.length < 100 &&
        (typeof v === "string" ||
          typeof v === "boolean" ||
          (Array.isArray(v) &&
            v.length <= 50 &&
            v.every((x) => typeof x === "string" && x.length <= 100))),
    )
  );
}
export async function POST(request: Request) {
  const user = await getAuthorizedUser(request);
  if (user instanceof Response) return user;

  try {
    const t = (await request.json()) as Task;
    t.created_by = user.memberId;
    t.assignees =
      t.assignees ??
      (Number.isInteger(t.person) && t.person >= 0 ? [t.person] : []);
    t.person = t.assignees[0] ?? -1;
    t.status ??= -1;
    t.date ??= "";
    t.priority ??= "";
    t.project ??= "";
    t.hours ??= null;
    t.custom ??= {};
    if (
      t.created_by !== undefined &&
      t.created_by !== null &&
      (!Number.isInteger(t.created_by) ||
        t.created_by < 0 ||
        !Number.isSafeInteger(t.created_by))
    )
      return Response.json(
        { error: "ข้อมูลผู้สร้างไม่ถูกต้อง" },
        { status: 400 },
      );
    if (!valid(t))
      return Response.json(
        { error: "ข้อมูลไม่ถูกต้อง กรุณาตรวจสอบชื่องาน วันที่ และชั่วโมง" },
        { status: 400 },
      );
    const id = crypto.randomUUID();
    const db = await getDb();
    t.parent_id ??= null;
    if (
      t.parent_id !== null &&
      (typeof t.parent_id !== "string" || t.parent_id.length > 100)
    )
      return Response.json({ error: "งานแม่ไม่ถูกต้อง" }, { status: 400 });
    const schema = await loadTaskSchema(db, t.parent_id);
    if (t.assignees.some((id) => !schema.members.has(id)))
      return Response.json({ error: "สมาชิกไม่ถูกต้อง" }, { status: 400 });
    enforceDeleted(t, schema);
    if (!validTaskStatuses(t, schema))
      return Response.json(
        { error: "สถานะถูกลบหรือเปลี่ยนไปแล้ว กรุณาโหลดข้อมูลใหม่" },
        { status: 400 },
      );
    if (!(await validMemberColumns(db, t, schema)))
      return Response.json(
        { error: "กรุณาเลือกสมาชิกจากบัญชีที่สมัครจริง ไม่เกิน 50 คนต่อช่อง" },
        { status: 400 },
      );
    if (!(await validTimelines(db, t.custom, schema)))
      return Response.json(
        { error: "Timeline ต้องเป็นช่วงวันที่เริ่มต้น–สิ้นสุดที่ถูกต้อง" },
        { status: 400 },
      );
    let groupId = t.group_id ?? "todo";
    if (t.parent_id !== null) {
      if (typeof t.parent_id !== "string" || t.parent_id.length > 100)
        return Response.json({ error: "งานแม่ไม่ถูกต้อง" }, { status: 400 });
      const parent = schema.parent;
      if (!parent || parent.parent_id)
        return Response.json(
          { error: "เลือกงานแม่ที่ยังใช้งานอยู่ งานย่อยซ้อนไม่ได้" },
          { status: 400 },
        );
      groupId = parent.group_id || (parent.status === 2 ? "done" : "todo");
    }
    if (
      groupId !== null &&
      (typeof groupId !== "string" || !schema.groups.has(groupId))
    )
      return Response.json({ error: "ไม่พบกลุ่ม" }, { status: 400 });
    const saved = await saveAndRead(
      db,
      db
        .prepare(
          "INSERT INTO tasks(id,name,person,status,date,priority,project,hours,custom,assignees,group_id,created_by,parent_id,sort_order) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,(SELECT COALESCE(MAX(COALESCE(sort_order,rowid*1024)),0)+1024 FROM tasks))",
        )
        .bind(
          id,
          t.name.trim(),
          t.person,
          t.status,
          t.date,
          t.priority,
          t.project.trim(),
          t.hours,
          JSON.stringify(t.custom),
          JSON.stringify(t.assignees),
          groupId,
          t.created_by ?? null,
          t.parent_id,
        ),
      id,
    );
    if (!saved) throw new Error("Created task not found");
    return Response.json(saved, { status: 201 });
  } catch (error) {
    console.error("D1 create failed", error);
    return Response.json({ error: "บันทึกงานไม่สำเร็จ" }, { status: 500 });
  }
}
export async function PATCH(request: Request) {
  const authError = await checkAccess(request);
  if (authError) return authError;

  try {
    const t = (await request.json()) as Task;
    t.assignees =
      t.assignees ??
      (Number.isInteger(t.person) && t.person >= 0 ? [t.person] : []);
    t.person = t.assignees[0] ?? -1;
    t.status ??= -1;
    t.date ??= "";
    t.priority ??= "";
    t.project ??= "";
    t.hours ??= null;
    t.custom ??= {};
    if (
      t.created_by !== undefined &&
      t.created_by !== null &&
      (!Number.isInteger(t.created_by) ||
        t.created_by < 0 ||
        !Number.isSafeInteger(t.created_by))
    )
      return Response.json(
        { error: "ข้อมูลผู้สร้างไม่ถูกต้อง" },
        { status: 400 },
      );
    if (!valid(t) || typeof t.id !== "string")
      return Response.json({ error: "ข้อมูลไม่ถูกต้อง" }, { status: 400 });
    const db = await getDb();
    const schema = await loadTaskSchema(db);
    if (t.assignees.some((id) => !schema.members.has(id)))
      return Response.json({ error: "สมาชิกไม่ถูกต้อง" }, { status: 400 });
    enforceDeleted(t, schema);
    if (!validTaskStatuses(t, schema))
      return Response.json(
        { error: "สถานะถูกลบหรือเปลี่ยนไปแล้ว กรุณาโหลดข้อมูลใหม่" },
        { status: 400 },
      );
    if (!(await validMemberColumns(db, t, schema)))
      return Response.json(
        { error: "กรุณาเลือกสมาชิกจากบัญชีที่สมัครจริง ไม่เกิน 50 คนต่อช่อง" },
        { status: 400 },
      );
    if (!(await validTimelines(db, t.custom, schema)))
      return Response.json(
        { error: "Timeline ต้องเป็นช่วงวันที่เริ่มต้น–สิ้นสุดที่ถูกต้อง" },
        { status: 400 },
      );
    const saved = await saveAndRead(
      db,
      db
        .prepare(
          "UPDATE tasks SET name=?,person=?,status=?,date=?,priority=?,project=?,hours=?,custom=?,assignees=?,group_id=COALESCE(group_id,CASE WHEN status=2 THEN 'done' ELSE 'todo' END) WHERE id=?",
        )
        .bind(
          t.name.trim(),
          t.person,
          t.status,
          t.date,
          t.priority,
          t.project.trim(),
          t.hours,
          JSON.stringify(t.custom),
          JSON.stringify(t.assignees),
          t.id,
        ),
      t.id,
    );
    if (!saved) return Response.json({ error: "ไม่พบงาน" }, { status: 404 });
    return Response.json(saved);
  } catch (error) {
    console.error("D1 update failed", error);
    return Response.json({ error: "แก้ไขงานไม่สำเร็จ" }, { status: 500 });
  }
}
export async function DELETE(request: Request) {
  const authError = await checkAccess(request);
  if (authError) return authError;

  try {
    const { id } = await request.json();
    if (typeof id !== "string")
      return Response.json({ error: "ข้อมูลไม่ถูกต้อง" }, { status: 400 });
    const [db, bucket] = await Promise.all([getDb(), getBucket()]);
    const attachments = await db
      .prepare(
        `${taskTreeSql} SELECT id FROM attachments WHERE task_id IN(SELECT id FROM tree) UNION ALL SELECT id FROM task_update_files WHERE task_id IN(SELECT id FROM tree)`,
      )
      .bind(JSON.stringify([id]))
      .all<{ id: string }>();
    if (attachments.results.length)
      await bucket.delete(attachments.results.map((a) => a.id));
    await db.prepare("DELETE FROM tasks WHERE id=?").bind(id).run();
    return Response.json({ ok: true });
  } catch (error) {
    console.error("D1 delete failed", error);
    return Response.json({ error: "ลบงานไม่สำเร็จ" }, { status: 500 });
  }
}
