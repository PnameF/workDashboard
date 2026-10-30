import type { Database } from "./database";
import { parseRange } from "./timeline";
export async function validTimelines(
  db: Database,
  custom: Record<string, unknown>,
) {
  if (!Object.keys(custom).length) return true;
  const [columns, settings] = await Promise.all([
    db
      .prepare("SELECT id,type FROM custom_columns")
      .all<{ id: string; type: string }>(),
    db
      .prepare("SELECT layout FROM board_settings WHERE id=1")
      .first<{ layout: string }>(),
  ]);
  const overrides: Record<string, { type: string }> = settings
    ? JSON.parse(settings.layout).overrides || {}
    : {};
  const customIds = new Set(columns.results.map((c) => c.id)),
    types = new Map(columns.results.map((c) => [c.id, c.type]));
  for (const [id, c] of Object.entries(overrides))
    types.set(customIds.has(id) ? id : "view:" + id, c.type);
  for (const [key, type] of types) {
    if (
      type !== "timeline" ||
      custom[key] === undefined ||
      custom[key] === "" ||
      (Array.isArray(custom[key]) && (custom[key] as unknown[]).length === 0)
    )
      continue;
    if (!parseRange(custom[key])) return false;
  }
  return true;
}
