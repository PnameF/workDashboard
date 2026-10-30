import { checkAccess, getSessionUser } from "@/lib/auth";
import { getDb, getBucket, getPublicFileUrl } from "@/lib/db";
import type { Task, Attachment, ArchivedTask } from "@/lib/types";
type Row = Omit<Task, "custom" | "assignees"> & {
  custom: string;
  assignees: string;
  archived_at: string | null;
};
export const dynamic = "force-dynamic";
export async function GET() {
  const authError = await checkAccess();
  if (authError) return authError;

  try {
    const db = await getDb();
    const { results } = await db
      .prepare(
        "SELECT t.id,t.name,t.parent_id,(SELECT name FROM tasks p WHERE p.id=t.parent_id) AS parent_name,t.archived_at,t.archived_group_id,COALESCE(t.group_id,CASE WHEN t.status=2 THEN 'done' ELSE 'todo' END) AS group_id,(SELECT COUNT(*) FROM attachments a WHERE a.task_id=t.id) AS file_count FROM tasks t WHERE t.archived_at IS NOT NULL ORDER BY t.archived_at DESC,t.rowid DESC",
      )
      .all<ArchivedTask>();
    return Response.json(results);
  } catch (error) {
    console.error("Read archive failed", error);
    return Response.json(
      { error: "โหลดงานที่เก็บถาวรไม่สำเร็จ" },
      { status: 503 },
    );
  }
}
export async function POST(request: Request) {
  const authError = await checkAccess(request);
  if (authError) return authError;

  try {
    const body = await request.json();
    const action = body.action;
    let ids = body.ids;
    const createdBy = (await getSessionUser())!.memberId;
    if (
      !["archive", "restore", "duplicate"].includes(action) ||
      !Array.isArray(ids) ||
      ids.length < 1 ||
      ids.length > 50 ||
      ids.some((id) => typeof id !== "string" || id.length > 100) ||
      new Set(ids).size !== ids.length ||
      (createdBy !== undefined &&
        (!Number.isInteger(createdBy) || createdBy < 0))
    )
      return Response.json(
        { error: "รายการงานหรือคำสั่งไม่ถูกต้อง (สูงสุด 50 งานต่อคำขอ)" },
        { status: 400 },
      );
    const db = await getDb();
    let slots = ids.map(() => "?").join(",");
    let { results: rows } = await db
      .prepare(
        `SELECT * FROM tasks WHERE id IN (${slots}) AND archived_at IS ${action === "restore" ? "NOT " : ""}NULL ORDER BY COALESCE(sort_order,rowid*1024),rowid`,
      )
      .bind(...ids)
      .all<Row>();
    if (rows.length !== ids.length)
      return Response.json(
        { error: "มีงานที่ถูกเปลี่ยนแปลงหรือลบไปแล้ว กรุณาโหลดข้อมูลใหม่" },
        { status: 409 },
      );
    const seeds = JSON.stringify(
      action === "restore"
        ? [...new Set(rows.flatMap((t) => [t.id, t.parent_id || t.id]))]
        : ids,
    );
    rows = (
      await db
        .prepare(
          action === "restore"
            ? "SELECT * FROM tasks WHERE archived_at IS NOT NULL AND (id IN(SELECT value FROM json_each(?)) OR archived_parent_id IN(SELECT value FROM json_each(?))) ORDER BY parent_id IS NOT NULL,COALESCE(sort_order,rowid*1024),rowid"
            : "SELECT * FROM tasks WHERE archived_at IS NULL AND (id IN(SELECT value FROM json_each(?)) OR parent_id IN(SELECT value FROM json_each(?))) ORDER BY parent_id IS NOT NULL,COALESCE(sort_order,rowid*1024),rowid",
        )
        .bind(seeds, seeds)
        .all<Row>()
    ).results;
    ids = rows.map((t) => t.id);
    // JSON parameters keep parent batches within D1's bound-parameter limit.
    const selected = JSON.stringify(ids);
    slots = "SELECT value FROM json_each(?)";
    if (action === "archive" || action === "restore") {
      const change = db
        .prepare(
          `UPDATE tasks SET archived_group_id=NULL,archived_parent_id=${action === "archive" ? "CASE WHEN parent_id IN(SELECT value FROM json_each(?)) THEN parent_id ELSE NULL END" : "NULL"},archived_at=${action === "archive" ? "CURRENT_TIMESTAMP" : "NULL"} WHERE id IN (${slots})`,
        )
        .bind(...(action === "archive" ? [selected, selected] : [selected]));
      if (action === "restore") {
        const clear = (key: string) =>
          db
            .prepare(
              `UPDATE board_settings SET layout=json_set(layout,'$.${key}',json((SELECT json_group_array(value) FROM json_each(layout,'$.${key}') WHERE value NOT IN (SELECT COALESCE(group_id,CASE WHEN status=2 THEN 'done' ELSE 'todo' END) FROM tasks WHERE id IN (${slots}))))) WHERE id=1`,
            )
            .bind(selected);
        await db.batch([
          change,
          clear("hiddenGroups"),
          db
            .prepare(
              `UPDATE board_settings SET layout=json_set(layout,'$.archivedGroups',json((SELECT json_group_array(value) FROM json_each(layout,'$.archivedGroups') WHERE value NOT IN (SELECT COALESCE(group_id,CASE WHEN status=2 THEN 'done' ELSE 'todo' END) FROM tasks WHERE id IN (${slots})) OR EXISTS(SELECT 1 FROM tasks t WHERE t.archived_group_id=value AND t.archived_at IS NOT NULL)))) WHERE id=1`,
            )
            .bind(selected),
        ]);
      } else await change.run();
      return Response.json({ ids });
    }
    const rank = await db
      .prepare(
        "SELECT COALESCE(MAX(COALESCE(sort_order,rowid*1024)),0) AS value FROM tasks",
      )
      .first<{ value: number }>();
    const copies = new Map(rows.map((t) => [t.id, crypto.randomUUID()]));
    const statements = rows.map((t, i) =>
      db
        .prepare(
          "INSERT INTO tasks(id,name,person,status,date,priority,project,hours,custom,assignees,group_id,created_by,sort_order,parent_id,archived_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,NULL)",
        )
        .bind(
          copies.get(t.id),
          t.name.slice(0, 240) + " (สำเนา)",
          t.person,
          t.status,
          t.date,
          t.priority,
          t.project,
          t.hours,
          t.custom,
          t.assignees,
          t.group_id ?? (t.status === 2 ? "done" : "todo"),
          createdBy ?? t.created_by ?? null,
          (rank?.value ?? 0) + (i + 1) * 1024,
          t.parent_id ? copies.get(t.parent_id) || t.parent_id : null,
        ),
    );
    const files = (
      await db
        .prepare(
          `SELECT id,task_id,name,content_type,size,column_id,url FROM attachments WHERE task_id IN (${slots})`,
        )
        .bind(selected)
        .all<Attachment>()
    ).results;
    const uploaded: string[] = [];
    const bucket = files.length ? await getBucket() : null;
    try {
      for (const file of files) {
        const object = await bucket!.get(file.id);
        if (!object) throw Error("Source attachment missing");
        const id = crypto.randomUUID(),
          url = await getPublicFileUrl(id);
        await bucket!.put(id, new Uint8Array(await object.arrayBuffer()), {
          httpMetadata: { contentType: file.content_type },
        });
        uploaded.push(id);
        statements.push(
          db
            .prepare(
              "INSERT INTO attachments(id,task_id,name,content_type,size,column_id,url) VALUES(?,?,?,?,?,?,?)",
            )
            .bind(
              id,
              copies.get(file.task_id),
              file.name,
              file.content_type,
              file.size,
              file.column_id ?? "images",
              url,
            ),
        );
      }
      await db.batch(statements);
    } catch (error) {
      for (const id of uploaded)
        await bucket!
          .delete(id)
          .catch((cleanupError) =>
            console.error("Duplicate file cleanup failed", cleanupError),
          );
      throw error;
    }
    return Response.json({ ids: [...copies.values()] }, { status: 201 });
  } catch (error) {
    console.error("Bulk task operation failed", error);
    return Response.json(
      { error: "ดำเนินการกับงานไม่สำเร็จ กรุณาลองอีกครั้ง" },
      { status: 500 },
    );
  }
}
