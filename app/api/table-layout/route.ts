import { getDb } from "@/lib/db";
import { checkAccess } from "@/lib/auth";
import { baseColumns, columnTypes, type BoardLayout } from "@/lib/board";
import { calculations } from "@/lib/column-summary";
import { validOptionColors } from "@/lib/option-colors";
import { referencedColumns, removeColumnReferences } from "@/lib/column-layout";
export async function PUT(request: Request) {
  const authError = await checkAccess(request);
  if (authError) return authError;
  try {
    let body = (await request.json()) as BoardLayout;
    const db = await getDb(),
      saved = await db
        .prepare("SELECT layout FROM board_settings WHERE id=1")
        .first<{ layout: string }>(),
      deleted: string[] = saved
        ? JSON.parse(saved.layout).deletedColumns || []
        : [];
    body.deletedColumns = deleted;
    const custom = await db
      .prepare("SELECT id FROM custom_columns")
      .all<{ id: string }>();
    const ids = new Set([
      ...baseColumns.filter((c) => !deleted.includes(c.id)).map((c) => c.id),
      ...custom.results.map((c) => c.id),
    ]);
    const savedLayout: BoardLayout | null = saved
      ? JSON.parse(saved.layout)
      : null;
    const stale = new Set([
      ...deleted,
      ...(savedLayout
        ? referencedColumns(savedLayout).filter((id) => !ids.has(id))
        : []),
    ]);
    body = removeColumnReferences(body, stale);
    const customGroups = await db
      .prepare("SELECT id FROM task_groups")
      .all<{ id: string }>();
    const groupIds = new Set([
      "todo",
      "done",
      ...customGroups.results.map((g) => g.id),
    ]);
    const validIds = (list: unknown): list is string[] =>
      Array.isArray(list) &&
      list.length <= ids.size &&
      new Set(list).size === list.length &&
      list.every((id) => typeof id === "string" && ids.has(id));
    if (
      !validIds(body.order) ||
      !validOptionColors(body.optionColors, ids) ||
      (body.projectOptions !== undefined &&
        (!Array.isArray(body.projectOptions) ||
          body.projectOptions.length > 100 ||
          new Set(body.projectOptions).size !== body.projectOptions.length ||
          body.projectOptions.some(
            (v) => typeof v !== "string" || !v.trim() || v.length > 100,
          ))) ||
      (body.hiddenGroups !== undefined &&
        (!Array.isArray(body.hiddenGroups) ||
          new Set(body.hiddenGroups).size !== body.hiddenGroups.length ||
          body.hiddenGroups.some((id) => !groupIds.has(id)))) ||
      (body.archivedGroups !== undefined &&
        (!Array.isArray(body.archivedGroups) ||
          new Set(body.archivedGroups).size !== body.archivedGroups.length ||
          body.archivedGroups.some((id) => !groupIds.has(id)))) ||
      !validIds(body.hidden) ||
      (body.calendarFields !== undefined &&
        (!validIds(body.calendarFields) || body.calendarFields.length === 0)) ||
      (body.numberSummaries !== undefined &&
        (!body.numberSummaries ||
          typeof body.numberSummaries !== "object" ||
          Array.isArray(body.numberSummaries) ||
          Object.entries(body.numberSummaries).some(
            ([id, c]) =>
              !ids.has(id) ||
              !c ||
              typeof c.unit !== "string" ||
              c.unit.length > 20 ||
              !["left", "right"].includes(c.position) ||
              !calculations.includes(c.calculation),
          ))) ||
      (body.groupOrder !== undefined &&
        (!Array.isArray(body.groupOrder) ||
          body.groupOrder.length > groupIds.size ||
          new Set(body.groupOrder).size !== body.groupOrder.length ||
          body.groupOrder.some((id) => !groupIds.has(id)))) ||
      (body.groupNames !== undefined &&
        (!body.groupNames ||
          typeof body.groupNames !== "object" ||
          Array.isArray(body.groupNames) ||
          Object.entries(body.groupNames).some(
            ([id, name]) =>
              !groupIds.has(id) ||
              typeof name !== "string" ||
              !name.trim() ||
              name.length > 60,
          ))) ||
      (body.groupColors !== undefined &&
        (!body.groupColors ||
          typeof body.groupColors !== "object" ||
          Array.isArray(body.groupColors) ||
          Object.entries(body.groupColors).some(
            ([id, color]) =>
              !groupIds.has(id) ||
              typeof color !== "string" ||
              !/^#[0-9a-f]{6}$/i.test(color),
          ))) ||
      (body.widths !== undefined &&
        (!body.widths ||
          typeof body.widths !== "object" ||
          Array.isArray(body.widths) ||
          Object.entries(body.widths).some(
            ([id, width]) =>
              !ids.has(id) ||
              !Number.isFinite(width) ||
              width < 80 ||
              width > 800,
          ))) ||
      !body.overrides ||
      typeof body.overrides !== "object" ||
      Array.isArray(body.overrides) ||
      Object.entries(body.overrides).some(
        ([id, c]) =>
          !ids.has(id) ||
          !c ||
          c.id !== id ||
          typeof c.name !== "string" ||
          !c.name.trim() ||
          c.name.length > 100 ||
          !Object.keys(columnTypes).includes(c.type) ||
          (c.options !== undefined &&
            (!Array.isArray(c.options) ||
              c.options.length > 50 ||
              c.options.some(
                (v) => typeof v !== "string" || !v.trim() || v.length > 100,
              ))),
      )
    )
      return Response.json(
        { error: "การตั้งค่าคอลัมน์ไม่ถูกต้อง" },
        { status: 400 },
      );
    await db
      .prepare(
        "INSERT INTO board_settings(id,layout) VALUES(1,?) ON CONFLICT(id) DO UPDATE SET layout=excluded.layout",
      )
      .bind(JSON.stringify(body))
      .run();
    return Response.json(body);
  } catch (error) {
    console.error("Board layout failed", error);
    return Response.json(
      { error: "บันทึกการจัดตารางไม่สำเร็จ" },
      { status: 500 },
    );
  }
}
