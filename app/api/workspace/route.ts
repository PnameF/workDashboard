import { checkAccess } from "@/lib/auth";
import { getDb } from "@/lib/db";
import type { Task, CustomColumn, Attachment, WorkGroup } from "@/lib/types";
import { baseColumns, defaultLayout, type BoardLayout } from "@/lib/board";
import { referencedColumns, removeColumnReferences } from "@/lib/column-layout";
export const dynamic = "force-dynamic";
export async function GET() {
  const authError = await checkAccess();
  if (authError) return authError;

  try {
    const db = await getDb();
    const [tasks, columns, attachments, settings, groups, members] =
      await Promise.all([
        db
          .prepare(
            "SELECT * FROM tasks WHERE archived_at IS NULL ORDER BY COALESCE(sort_order,rowid*1024),rowid",
          )
          .all<
            Omit<Task, "custom" | "assignees"> & {
              custom: string;
              assignees: string;
            }
          >(),
        db
          .prepare("SELECT * FROM custom_columns ORDER BY rowid")
          .all<Omit<CustomColumn, "options"> & { options: string }>(),
        db
          .prepare(
            "SELECT a.id,a.task_id,a.name,a.content_type,a.size,a.column_id,a.url FROM attachments a JOIN tasks t ON t.id=a.task_id WHERE t.archived_at IS NULL ORDER BY a.created_at",
          )
          .all<Attachment>(),
        db
          .prepare("SELECT layout FROM board_settings WHERE id=1")
          .first<{ layout: string }>(),
        db
          .prepare(
            "SELECT * FROM task_groups WHERE id NOT IN ('todo','done') ORDER BY rowid",
          )
          .all<WorkGroup>(),
        db
          .prepare(
            "SELECT m.id,m.name,u.avatar_url AS avatarUrl FROM members m JOIN auth_users u ON u.id=m.user_id WHERE u.role<>'admin' ORDER BY m.id",
          )
          .all<{ id: number; name: string; avatarUrl: string | null }>(),
      ]);
    const savedLayout: BoardLayout = settings
      ? JSON.parse(settings.layout)
      : defaultLayout;
    const activeIds = new Set([
      ...baseColumns
        .filter((c) => !savedLayout.deletedColumns?.includes(c.id))
        .map((c) => c.id),
      ...columns.results.map((c) => c.id),
    ]);
    const layout = removeColumnReferences(
      savedLayout,
      new Set(
        referencedColumns(savedLayout).filter((id) => !activeIds.has(id)),
      ),
    );
    return Response.json({
      people: members.results.map((m) => m.name),
      members: members.results,
      groups: groups.results,
      layout,
      tasks: tasks.results.map((t) => ({
        ...t,
        custom: JSON.parse(t.custom),
        assignees: JSON.parse(t.assignees).length
          ? JSON.parse(t.assignees)
          : t.person >= 0
            ? [t.person]
            : [],
      })),
      columns: columns.results.map((c) => ({
        ...c,
        options: JSON.parse(c.options),
      })),
      attachments: attachments.results,
    });
  } catch (error) {
    console.error("D1 read failed", error);
    return Response.json(
      {
        error:
          "ไม่สามารถเชื่อมต่อฐานข้อมูล D1 ได้ กรุณาตรวจการตั้งค่าและ migration",
      },
      { status: 503 },
    );
  }
}
