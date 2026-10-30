import { applyDeletedColumns } from "@/lib/deleted-columns";
import type { Database } from "@/lib/database";
import { checkAccess, getSessionUser, validMembers } from "@/lib/auth";
import { getDb, getBucket } from "@/lib/db";
import type { Task } from "@/lib/types";
import { validTimelines } from "@/lib/timeline-validation";
async function enforceDeleted(db: Database, t: Task) {
  const settings = await db
    .prepare("SELECT layout FROM board_settings WHERE id=1")
    .first<{ layout: string }>();
  if (settings)
    Object.assign(t, applyDeletedColumns(t, JSON.parse(settings.layout)));
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
  const authError = await checkAccess(request);
  if (authError) return authError;

  try {
    const t = (await request.json()) as Task;
    t.created_by = (await getSessionUser())!.memberId;
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
    if (!valid(t) || !(await validMembers(t.assignees)))
      return Response.json(
        { error: "ข้อมูลไม่ถูกต้อง กรุณาตรวจสอบชื่องาน วันที่ และชั่วโมง" },
        { status: 400 },
      );
    const id = crypto.randomUUID();
    const db = await getDb();
    await enforceDeleted(db, t);
    if (!(await validTimelines(db, t.custom)))
      return Response.json(
        { error: "Timeline ต้องเป็นช่วงวันที่เริ่มต้น–สิ้นสุดที่ถูกต้อง" },
        { status: 400 },
      );
    const groupId = t.group_id ?? "todo";
    if (
      groupId !== null &&
      (typeof groupId !== "string" ||
        !(await db
          .prepare("SELECT id FROM task_groups WHERE id=?")
          .bind(groupId)
          .first()))
    )
      return Response.json({ error: "ไม่พบกลุ่ม" }, { status: 400 });
    await db
      .prepare(
        "INSERT INTO tasks(id,name,person,status,date,priority,project,hours,custom,assignees,group_id,created_by,sort_order) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,(SELECT COALESCE(MAX(COALESCE(sort_order,rowid*1024)),0)+1024 FROM tasks))",
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
      )
      .run();
    return Response.json({ ...t, id }, { status: 201 });
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
    if (
      !valid(t) ||
      !(await validMembers(t.assignees)) ||
      typeof t.id !== "string"
    )
      return Response.json({ error: "ข้อมูลไม่ถูกต้อง" }, { status: 400 });
    const db = await getDb();
    await enforceDeleted(db, t);
    if (!(await validTimelines(db, t.custom)))
      return Response.json(
        { error: "Timeline ต้องเป็นช่วงวันที่เริ่มต้น–สิ้นสุดที่ถูกต้อง" },
        { status: 400 },
      );
    const result = await db
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
      )
      .run();
    if (!result.meta.changes)
      return Response.json({ error: "ไม่พบงาน" }, { status: 404 });
    const saved = await db
      .prepare("SELECT * FROM tasks WHERE id=?")
      .bind(t.id)
      .first<
        Omit<Task, "custom" | "assignees"> & {
          custom: string;
          assignees: string;
        }
      >();
    if (!saved) return Response.json({ error: "ไม่พบงาน" }, { status: 404 });
    const assignees = JSON.parse(saved.assignees) as number[];
    return Response.json({
      ...saved,
      custom: JSON.parse(saved.custom),
      assignees: assignees.length
        ? assignees
        : saved.person >= 0
          ? [saved.person]
          : [],
    });
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
        "SELECT id FROM attachments WHERE task_id=? UNION ALL SELECT id FROM task_update_files WHERE task_id=?",
      )
      .bind(id, id)
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
