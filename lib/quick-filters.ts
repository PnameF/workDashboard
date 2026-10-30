import {
  filterRaw,
  type FilterField,
  type FilterRule,
  type FilterContext,
} from "./advanced-filters";
import type { Task } from "./types";
import { todayKey, parseDay, addDays, dayKey } from "./timeline";
export type QuickOption = FilterRule & { label: string };
export function quickOptions(
  field: FilterField,
  tasks: Task[],
  context: FilterContext,
  today = todayKey(),
  currentUser?: number,
): QuickOption[] {
  const option = (
    suffix: string,
    label: string,
    operator: string,
    value = "",
    to = "",
  ): QuickOption => ({
    id: `quick:${field.id}:${suffix}`,
    column: field.id,
    operator,
    value,
    to,
    label,
  });
  let options: QuickOption[] = [];
  if (field.type === "date" || field.type === "timeline") {
    const day = parseDay(today)!,
      monday = addDays(today, -((day.getUTCDay() + 6) % 7)),
      first = dayKey(
        new Date(Date.UTC(day.getUTCFullYear(), day.getUTCMonth(), 1)),
      ),
      last = dayKey(
        new Date(Date.UTC(day.getUTCFullYear(), day.getUTCMonth() + 1, 0)),
      ),
      single = field.type === "timeline" ? "on" : "eq",
      range = field.type === "timeline" ? "overlaps" : "between";
    options = [
      option("today", "วันนี้", single, today),
      option("tomorrow", "พรุ่งนี้", single, addDays(today, 1)),
      option("yesterday", "เมื่อวาน", single, addDays(today, -1)),
      option("week", "สัปดาห์นี้", range, monday, addDays(monday, 6)),
      option("month", "เดือนนี้", range, first, last),
      option("past", "ก่อนวันนี้", "lt", today),
    ];
  } else {
    const entries = field.options.length
      ? field.options
      : [
          ...new Set(
            tasks.flatMap((t) => {
              const raw = filterRaw(t, field, context);
              return (Array.isArray(raw) ? raw : [raw])
                .filter((v) => v !== null && v !== undefined && v !== "")
                .map(String);
            }),
          ),
        ]
          .sort()
          .map((value) => ({ value, label: value }));
    options = entries.map((entry) =>
      option(
        entry.value,
        (field.type === "people" || field.type === "member") &&
          entry.value === String(currentUser)
          ? `ฉัน (${entry.label})`
          : entry.label,
        "eq",
        entry.value,
      ),
    );
  }
  return [...options, option("empty", "ยังไม่ระบุ", "empty")];
}
