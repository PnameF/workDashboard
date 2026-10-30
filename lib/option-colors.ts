export const optionPalette = [
  "#3159a5",
  "#7543b6",
  "#ac512f",
  "#147f89",
  "#a33e83",
  "#a1711b",
];
export function optionColor(
  colors: Record<string, string> | undefined,
  value: string,
) {
  const color = colors?.[value];
  return typeof color === "string" && /^#[0-9a-f]{6}$/i.test(color)
    ? color
    : undefined;
}
export function validOptionColors(value: unknown, ids: Set<string>) {
  return (
    value === undefined ||
    (!!value &&
      typeof value === "object" &&
      !Array.isArray(value) &&
      Object.entries(value).every(
        ([id, colors]) =>
          ids.has(id) &&
          colors &&
          typeof colors === "object" &&
          !Array.isArray(colors) &&
          Object.entries(colors).length <= 100 &&
          Object.entries(colors).every(
            ([name, color]) =>
              name.trim() &&
              name.length <= 100 &&
              typeof color === "string" &&
              /^#[0-9a-f]{6}$/i.test(color),
          ),
      ))
  );
}
