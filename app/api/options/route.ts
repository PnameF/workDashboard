import { checkAccess } from "@/lib/auth";
import { getDb } from "@/lib/db";
import { defaultLayout, type BoardLayout } from "@/lib/board";
import { statuses, type CustomColumn } from "@/lib/types";
import { statusLabel, statusOptions } from "@/lib/status-options";
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
    if (layout.deletedColumns?.includes(columnId))
      return Response.json({ error: "คอลัมน์นี้ถูกลบแล้ว" }, { status: 404 });
    if (
      definition?.type === "status" ||
      (columnId === "status" && !definition)
    ) {
      if (!statusOptions(layout, columnId).includes(oldValue))
        return Response.json(
          { error: "ไม่พบตัวเลือกสถานะนี้" },
          { status: 409 },
        );
      if (
        statusOptions(layout, columnId).some(
          (key) =>
            key !== oldValue && statusLabel(layout, columnId, key) === name,
        )
      )
        return Response.json(
          { error: "มีชื่อตัวเลือกนี้แล้ว" },
          { status: 409 },
        );
      const nextLayout: BoardLayout = {
        ...layout,
        statusLabels: {
          ...layout.statusLabels,
          [columnId]: { ...layout.statusLabels?.[columnId], [oldValue]: name },
        },
        optionColors: {
          ...layout.optionColors,
          [columnId]: { ...layout.optionColors?.[columnId], [oldValue]: color },
        },
      };
      await db
        .prepare(
          "INSERT INTO board_settings(id,layout) VALUES(1,?) ON CONFLICT(id) DO UPDATE SET layout=excluded.layout",
        )
        .bind(JSON.stringify(nextLayout))
        .run();
      return Response.json({
        value: oldValue,
        label: name,
        color,
        layout: nextLayout,
      });
    }
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

export async function POST(request: Request) {
  return manageStatus(request, "add");
}
export async function DELETE(request: Request) {
  return manageStatus(request, "delete");
}
async function manageStatus(request: Request, action: "add" | "delete") {
  const denied = await checkAccess(request);
  if (denied) return denied;
  try {
    const { columnId, value, color, oldValue } = await request.json();
    if (typeof columnId !== "string" || columnId.length > 100)
      return Response.json({ error: "คอลัมน์ไม่ถูกต้อง" }, { status: 400 });
    const db = await getDb();
    const [settings, columns] = await db.batch([
      db.prepare("SELECT layout FROM board_settings WHERE id=1"),
      db.prepare("SELECT type FROM custom_columns WHERE id=?").bind(columnId),
    ]);
    const layout: BoardLayout = settings.results[0]
      ? JSON.parse(String(settings.results[0].layout))
      : defaultLayout;
    if (layout.deletedColumns?.includes(columnId))
      return Response.json({ error: "คอลัมน์นี้ถูกลบแล้ว" }, { status: 404 });
    const type =
      layout.overrides[columnId]?.type ||
      columns.results[0]?.type ||
      (columnId === "status" ? "status" : undefined);
    if (type !== "status")
      return Response.json({ error: "คอลัมน์นี้ไม่ใช่สถานะ" }, { status: 400 });
    const choices = statusOptions(layout, columnId);
    let key: string;
    if (action === "add") {
      if (
        typeof value !== "string" ||
        !value.trim() ||
        value.length > 100 ||
        typeof color !== "string" ||
        !/^#[0-9a-f]{6}$/i.test(color)
      )
        return Response.json(
          { error: "ชื่อหรือสีสถานะไม่ถูกต้อง" },
          { status: 400 },
        );
      if (choices.length >= 50)
        return Response.json(
          { error: "เพิ่มได้ไม่เกิน 50 สถานะ" },
          { status: 400 },
        );
      if (
        choices.some(
          (key) => statusLabel(layout, columnId, key) === value.trim(),
        )
      )
        return Response.json(
          { error: "มีชื่อตัวเลือกนี้แล้ว" },
          { status: 409 },
        );
      // Recreating a removed default state restores its existing completion meaning.
      key =
        statuses.find(
          (key) => key === value.trim() && !choices.includes(key),
        ) || "status:" + crypto.randomUUID();
    } else {
      if (typeof oldValue !== "string" || !choices.includes(oldValue))
        return Response.json(
          { error: "สถานะถูกลบไปแล้ว กรุณาโหลดข้อมูลใหม่" },
          { status: 409 },
        );
      key = oldValue;
    }
    const labels = { ...layout.statusLabels?.[columnId] },
      colors = { ...layout.optionColors?.[columnId] };
    if (action === "add") {
      labels[key] = value.trim();
      colors[key] = color;
    } else {
      delete labels[key];
      delete colors[key];
    }
    const next: BoardLayout = {
      ...layout,
      statusOptions: {
        ...layout.statusOptions,
        [columnId]:
          action === "add"
            ? [...choices, key]
            : choices.filter((v) => v !== key),
      },
      statusLabels: { ...layout.statusLabels, [columnId]: labels },
      optionColors: { ...layout.optionColors, [columnId]: colors },
    };
    const statements = [];
    if (action === "delete") {
      const custom = !!columns.results[0],
        path = "$." + JSON.stringify(custom ? columnId : "view:" + columnId);
      statements.push(
        columnId === "status" && !custom
          ? db
              .prepare(
                "UPDATE tasks SET status=-1,custom=json_remove(custom,?) WHERE json_extract(custom,?)=? OR (json_type(custom,?) IS NULL AND status=?)",
              )
              .bind(
                path,
                path,
                key,
                path,
                statuses.includes(key) ? statuses.indexOf(key) : -999,
              )
          : db
              .prepare(
                "UPDATE tasks SET custom=json_remove(custom,?) WHERE json_extract(custom,?)=?",
              )
              .bind(path, path, key),
      );
    }
    statements.push(
      db
        .prepare(
          "INSERT INTO board_settings(id,layout) VALUES(1,?) ON CONFLICT(id) DO UPDATE SET layout=excluded.layout",
        )
        .bind(JSON.stringify(next)),
    );
    await db.batch(statements);
    return Response.json({ value: key, layout: next });
  } catch {
    return Response.json({ error: "บันทึกสถานะไม่สำเร็จ" }, { status: 503 });
  }
}
