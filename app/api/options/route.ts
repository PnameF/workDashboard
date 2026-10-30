import { checkAccess } from "@/lib/auth";
import { getDb } from "@/lib/db";
import { defaultLayout, type BoardLayout } from "@/lib/board";
import type { CustomColumn } from "@/lib/types";
export async function PATCH(request: Request) {
  const denied = await checkAccess(request);
  if (denied) return denied;
  try {
    const { columnId, oldValue, value, color } = await request.json();
    if (
      typeof columnId !== "string" ||
      typeof oldValue !== "string" ||
      typeof value !== "string" ||
      !value.trim() ||
      value.length > 100 ||
      oldValue.length > 100 ||
      typeof color !== "string" ||
      !/^#[0-9a-f]{6}$/i.test(color)
    )
      return Response.json(
        { error: "ชื่อหรือสีตัวเลือกไม่ถูกต้อง" },
        { status: 400 },
      );
    const name = value.trim(),
      db = await getDb(),
      settings = await db
        .prepare("SELECT layout FROM board_settings WHERE id=1")
        .first<{ layout: string }>(),
      layout: BoardLayout = settings
        ? JSON.parse(settings.layout)
        : defaultLayout,
      custom = await db
        .prepare("SELECT id,name,type,options FROM custom_columns WHERE id=?")
        .bind(columnId)
        .first<Omit<CustomColumn, "options"> & { options: string }>(),
      override = layout.overrides[columnId],
      definition = override || custom,
      project = columnId === "project" && !override && !custom;
    if (
      !project &&
      (!definition || !["select", "multiselect"].includes(definition.type))
    )
      return Response.json(
        { error: "คอลัมน์นี้ไม่รองรับการแก้ไขตัวเลือก" },
        { status: 400 },
      );
    let options: string[] = project
      ? layout.projectOptions || ["Development", "Design", "Marketing"]
      : override?.options || (custom ? JSON.parse(custom.options) : []);
    if (project) {
      const projects = await db
        .prepare("SELECT DISTINCT project FROM tasks WHERE project<>''")
        .all<{ project: string }>();
      options = [
        ...new Set([...options, ...projects.results.map((p) => p.project)]),
      ];
    }
    if (!options.includes(oldValue))
      return Response.json(
        { error: "ตัวเลือกถูกเปลี่ยนไปแล้ว กรุณาโหลดข้อมูลใหม่" },
        { status: 409 },
      );
    if (name !== oldValue && options.includes(name))
      return Response.json({ error: "มีชื่อตัวเลือกนี้แล้ว" }, { status: 409 });
    const nextOptions = options.map((v) => (v === oldValue ? name : v)),
      oldColors = layout.optionColors?.[columnId] || {},
      nextColors = Object.fromEntries(
        Object.entries(oldColors).filter(([key]) => key !== oldValue),
      );
    nextColors[name] = color;
    const nextLayout: BoardLayout = {
      ...layout,
      optionColors: { ...layout.optionColors, [columnId]: nextColors },
    };
    if (project) nextLayout.projectOptions = nextOptions;
    else if (override)
      nextLayout.overrides = {
        ...layout.overrides,
        [columnId]: { ...override, options: nextOptions },
      };
    const statements = [];
    if (name !== oldValue) {
      if (project)
        statements.push(
          db
            .prepare("UPDATE tasks SET project=? WHERE project=?")
            .bind(name, oldValue),
        );
      else {
        const key = custom ? columnId : "view:" + columnId,
          path = "$." + JSON.stringify(key),
          fallback: Record<string, string> = {
            name: "name",
            project: "project",
            priority: "priority",
            date: "date",
            hours: "CAST(hours AS TEXT)",
            status:
              "CASE status WHEN 0 THEN 'ยังไม่เริ่ม' WHEN 1 THEN 'กำลังทำ' WHEN 2 THEN 'เสร็จแล้ว' WHEN 3 THEN 'ติดปัญหา' ELSE '' END",
            assignees:
              "json((SELECT json_group_array(m.name) FROM members m LEFT JOIN auth_users u ON u.id=m.user_id WHERE m.id IN(SELECT value FROM json_each(tasks.assignees)) AND (u.role IS NULL OR u.role<>'admin'))",
          },
          raw = custom ? "NULL" : fallback[columnId] || "NULL";
        statements.push(
          db
            .prepare(
              `WITH values_to_rename AS (SELECT id,CASE WHEN json_type(custom,?) IS NULL THEN json_quote(${raw}) ELSE json_quote(json_extract(custom,?)) END AS raw FROM tasks) UPDATE tasks SET custom=json_set(tasks.custom,?,json(CASE WHEN json_type(v.raw)='array' THEN (SELECT json_group_array(CASE WHEN value=? THEN ? ELSE value END) FROM json_each(v.raw)) ELSE json_quote(?) END)) FROM values_to_rename v WHERE tasks.id=v.id AND ((json_type(v.raw)='text' AND json_extract(v.raw,'$')=?) OR (json_type(v.raw)='array' AND EXISTS(SELECT 1 FROM json_each(v.raw) WHERE value=?)))`,
            )
            .bind(path, path, path, oldValue, name, name, oldValue, oldValue),
        );
      }
    }
    if (custom && !override)
      statements.push(
        db
          .prepare("UPDATE custom_columns SET options=? WHERE id=?")
          .bind(JSON.stringify(nextOptions), columnId),
      );
    statements.push(
      db
        .prepare(
          "INSERT INTO board_settings(id,layout) VALUES(1,?) ON CONFLICT(id) DO UPDATE SET layout=excluded.layout",
        )
        .bind(JSON.stringify(nextLayout)),
    );
    await db.batch(statements);
    return Response.json({ value: name, color, layout: nextLayout });
  } catch {
    return Response.json({ error: "บันทึกตัวเลือกไม่สำเร็จ" }, { status: 503 });
  }
}
