import { checkAccess } from "@/lib/auth";
import { getDb } from "@/lib/db";
type Row = {
  id: string;
  status: number;
  rank: number;
  group_id: string | null;
};
export async function POST(request: Request) {
  const authError = await checkAccess(request);
  if (authError) return authError;

  try {
    const { id, group, anchorId = null, after = false } = await request.json();
    if (
      typeof id !== "string" ||
      typeof group !== "string" ||
      (anchorId !== null && typeof anchorId !== "string") ||
      typeof after !== "boolean" ||
      id === anchorId
    )
      return Response.json(
        { error: "ตำแหน่งปลายทางไม่ถูกต้อง" },
        { status: 400 },
      );
    const db = await getDb();
    if (
      !["todo", "done"].includes(group) &&
      !(await db
        .prepare("SELECT id FROM task_groups WHERE id=?")
        .bind(group)
        .first())
    )
      return Response.json({ error: "ไม่พบกลุ่มปลายทาง" }, { status: 404 });
    const read = () =>
      db
        .prepare(
          "SELECT id,status,group_id,COALESCE(sort_order,rowid*1024) AS rank FROM tasks ORDER BY COALESCE(sort_order,rowid*1024),rowid",
        )
        .all<Row>();
    let rows = (await read()).results;
    const task = rows.find((t) => t.id === id);
    if (!task) return Response.json({ error: "ไม่พบงาน" }, { status: 404 });
    const rank = () => {
      const target = rows.filter(
        (t) =>
          t.id !== id &&
          (t.group_id || (t.status === 2 ? "done" : "todo")) === group,
      );
      let index =
        anchorId === null
          ? target.length
          : target.findIndex((t) => t.id === anchorId);
      if (index < 0) return null;
      if (anchorId !== null && after) index++;
      const left = target[index - 1]?.rank,
        right = target[index]?.rank;
      return {
        left,
        right,
        value:
          left === undefined
            ? right === undefined
              ? 1024
              : right - 1024
            : right === undefined
              ? left + 1024
              : (left + right) / 2,
      };
    };
    let destination = rank();
    if (!destination)
      return Response.json(
        { error: "งานปลายทางไม่ได้อยู่ในกลุ่มนี้ กรุณาลองใหม่" },
        { status: 409 },
      );
    if (
      destination.value === destination.left ||
      destination.value === destination.right
    ) {
      await db
        .prepare(
          "WITH ranked AS (SELECT id,ROW_NUMBER() OVER (ORDER BY COALESCE(sort_order,rowid*1024),rowid)*1024 AS position FROM tasks) UPDATE tasks SET sort_order=(SELECT position FROM ranked WHERE ranked.id=tasks.id)",
        )
        .run();
      rows = (await read()).results;
      destination = rank();
    }
    if (!destination)
      return Response.json(
        { error: "ตำแหน่งปลายทางเปลี่ยนไป กรุณาลองใหม่" },
        { status: 409 },
      );
    const status = task.status;
    const groupId = group;
    await db
      .prepare("UPDATE tasks SET status=?,sort_order=?,group_id=? WHERE id=?")
      .bind(status, destination.value, groupId, id)
      .run();
    return Response.json({ id, status, sort_order: destination.value });
  } catch (error) {
    console.error("Task move failed", error);
    return Response.json({ error: "ย้ายงานไม่สำเร็จ" }, { status: 500 });
  }
}
