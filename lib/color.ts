export type Hsv = { h: number; s: number; v: number };
export const clamp = (value: number, max = 1) =>
  Math.max(0, Math.min(max, value));
export function hsvToHex({ h, s, v }: Hsv): string {
  const hue = (((h % 360) + 360) % 360) / 60;
  const c = clamp(v) * clamp(s),
    x = c * (1 - Math.abs((hue % 2) - 1)),
    m = clamp(v) - c;
  const rgb =
    hue < 1
      ? [c, x, 0]
      : hue < 2
        ? [x, c, 0]
        : hue < 3
          ? [0, c, x]
          : hue < 4
            ? [0, x, c]
            : hue < 5
              ? [x, 0, c]
              : [c, 0, x];
  return (
    "#" +
    rgb
      .map((channel) =>
        Math.round((channel + m) * 255)
          .toString(16)
          .padStart(2, "0"),
      )
      .join("")
  );
}
export function hexToHsv(hex: string): Hsv {
  const normalized = parseColorCode(hex, "hex") || "#000000";
  const [r, g, b] = [1, 3, 5].map(
    (i) => parseInt(normalized.slice(i, i + 2), 16) / 255,
  );
  const max = Math.max(r, g, b),
    min = Math.min(r, g, b),
    delta = max - min;
  let h = 0;
  if (delta)
    h =
      max === r
        ? ((g - b) / delta) % 6
        : max === g
          ? (b - r) / delta + 2
          : (r - g) / delta + 4;
  return { h: (h * 60 + 360) % 360, s: max ? delta / max : 0, v: max };
}
export function parseColorCode(
  value: string,
  format: "hex" | "rgb",
): string | null {
  if (format === "hex") {
    const hex = value.trim().replace(/^#/, "");
    if (/^[0-9a-f]{6}$/i.test(hex)) return "#" + hex.toLowerCase();
    if (/^[0-9a-f]{3}$/i.test(hex))
      return (
        "#" +
        hex
          .toLowerCase()
          .split("")
          .map((c) => c + c)
          .join("")
      );
    return null;
  }
  const match = value
    .trim()
    .match(
      /^(?:rgb\(\s*)?(\d{1,3})\s*,\s*(\d{1,3})\s*,\s*(\d{1,3})(?:\s*\))?$/i,
    );
  if (!match || /\(/.test(value) !== /\)/.test(value)) return null;
  const channels = match.slice(1).map(Number);
  return channels.every((c) => c <= 255)
    ? "#" + channels.map((c) => c.toString(16).padStart(2, "0")).join("")
    : null;
}
export function colorCode(color: Hsv, format: "hex" | "rgb") {
  const hex = hsvToHex(color);
  return format === "hex"
    ? hex.slice(1).toUpperCase()
    : [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16)).join(", ");
}
