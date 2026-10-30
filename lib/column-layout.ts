import type { BoardLayout } from "./board";

export function referencedColumns(layout: BoardLayout): string[] {
  return [
    ...new Set([
      ...layout.order,
      ...layout.hidden,
      ...(layout.calendarFields || []),
      ...Object.keys(layout.overrides),
      ...Object.keys(layout.widths || {}),
      ...Object.keys(layout.numberSummaries || {}),
      ...Object.keys(layout.optionColors || {}),
    ]),
  ];
}

// Remove references to previously deleted columns without touching task values.
// Keep malformed input intact so the API's existing validation can reject it.
export function removeColumnReferences(
  layout: BoardLayout,
  removed: Set<string>,
): BoardLayout {
  const list = (value: string[]) =>
    Array.isArray(value) ? value.filter((id) => !removed.has(id)) : value;
  const record = <T>(value: Record<string, T> | undefined) =>
    value && typeof value === "object" && !Array.isArray(value)
      ? Object.fromEntries(
          Object.entries(value).filter(([id]) => !removed.has(id)),
        )
      : value;
  const next: BoardLayout = {
    ...layout,
    order: list(layout.order),
    hidden: list(layout.hidden),
    overrides: record(layout.overrides)!,
    ...(layout.widths !== undefined ? { widths: record(layout.widths) } : {}),
    ...(layout.numberSummaries !== undefined
      ? { numberSummaries: record(layout.numberSummaries) }
      : {}),
    ...(layout.optionColors !== undefined
      ? { optionColors: record(layout.optionColors) }
      : {}),
  };
  if (layout.calendarFields !== undefined) {
    next.calendarFields = list(layout.calendarFields);
    if (Array.isArray(next.calendarFields) && !next.calendarFields.length)
      next.calendarFields = ["name"];
  }
  return next;
}
