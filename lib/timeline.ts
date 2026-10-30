export type DateRange = readonly [string, string];
export const monthNames = [
  "มกราคม",
  "กุมภาพันธ์",
  "มีนาคม",
  "เมษายน",
  "พฤษภาคม",
  "มิถุนายน",
  "กรกฎาคม",
  "สิงหาคม",
  "กันยายน",
  "ตุลาคม",
  "พฤศจิกายน",
  "ธันวาคม",
];
export const weekdayNames = [
  "จันทร์",
  "อังคาร",
  "พุธ",
  "พฤหัสบดี",
  "ศุกร์",
  "เสาร์",
  "อาทิตย์",
];
export function dayKey(date: Date) {
  return `${String(date.getUTCFullYear()).padStart(4, "0")}-${String(date.getUTCMonth() + 1).padStart(2, "0")}-${String(date.getUTCDate()).padStart(2, "0")}`;
}
export function parseDay(value: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const date = new Date(value + "T00:00:00Z");
  return Number.isFinite(date.getTime()) && dayKey(date) === value
    ? date
    : null;
}
export function parseRange(value: unknown): DateRange | null {
  if (
    !Array.isArray(value) ||
    value.length !== 2 ||
    value.some((v) => typeof v !== "string" || !parseDay(v)) ||
    value[0] > value[1]
  )
    return null;
  return [value[0], value[1]];
}
export function todayKey() {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Bangkok",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}
export function addDays(value: string, count: number) {
  const date = parseDay(value)!;
  date.setUTCDate(date.getUTCDate() + count);
  return dayKey(date);
}
export function monthGrid(year: number, month: number) {
  const first = new Date(Date.UTC(year, month, 1)),
    offset = (first.getUTCDay() + 6) % 7,
    days = new Date(Date.UTC(year, month + 1, 0)).getUTCDate(),
    start = addDays(dayKey(first), -offset),
    count = Math.ceil((days + offset) / 7) * 7;
  return Array.from({ length: count }, (_, i) => addDays(start, i));
}
export function rangeLabel(range: DateRange) {
  const fmt = (s: string) => s.split("-").reverse().join("/");
  return range[0] === range[1]
    ? fmt(range[0])
    : `${fmt(range[0])} – ${fmt(range[1])}`;
}
export function rangeDuration(range: DateRange) {
  const apart = Math.round(
    (parseDay(range[1])!.getTime() - parseDay(range[0])!.getTime()) / 86400000,
  );
  return { apart, inclusive: apart + 1 };
}
export type CalendarEvent = {
  id: string;
  taskId: string;
  name: string;
  column: string;
  start: string;
  end: string;
  status: number;
  assignees: string[];
};
export function weekSegments(days: string[], events: CalendarEvent[]) {
  const lanes: string[] = [],
    segments: {
      event: CalendarEvent;
      start: number;
      span: number;
      lane: number;
      continuesBefore: boolean;
      continuesAfter: boolean;
    }[] = [];
  for (const event of events
    .filter((e) => e.start <= days[6] && e.end >= days[0])
    .sort(
      (a, b) =>
        a.start.localeCompare(b.start) ||
        b.end.localeCompare(a.end) ||
        a.id.localeCompare(b.id),
    )) {
    const start = event.start < days[0] ? days[0] : event.start,
      end = event.end > days[6] ? days[6] : event.end;
    let lane = lanes.findIndex((last) => last < start);
    if (lane < 0) lane = lanes.length;
    lanes[lane] = end;
    const index = days.indexOf(start);
    segments.push({
      event,
      start: index,
      span: days.indexOf(end) - index + 1,
      lane,
      continuesBefore: event.start < days[0],
      continuesAfter: event.end > days[6],
    });
  }
  return { segments, laneCount: lanes.length };
}
