export const calculations = [
  "none",
  "sum",
  "average",
  "median",
  "min",
  "max",
  "count",
] as const;
export type Calculation = (typeof calculations)[number];
export type NumberSummaryConfig = {
  unit: string;
  position: "left" | "right";
  calculation: Calculation;
};
export const defaultNumberSummary: NumberSummaryConfig = {
  unit: "",
  position: "right",
  calculation: "sum",
};
export function numericValues(values: unknown[]) {
  return values
    .filter(
      (v) =>
        (typeof v === "number" || (typeof v === "string" && v.trim() !== "")) &&
        Number.isFinite(Number(v)),
    )
    .map(Number);
}
export function calculate(
  values: unknown[],
  method: Calculation,
): number | null {
  const numbers = numericValues(values);
  if (method === "none") return null;
  if (method === "count") return numbers.length;
  if (method === "sum") return numbers.reduce((a, b) => a + b, 0);
  if (!numbers.length) return null;
  if (method === "average")
    return numbers.reduce((a, b) => a + b, 0) / numbers.length;
  if (method === "min") return Math.min(...numbers);
  if (method === "max") return Math.max(...numbers);
  const sorted = [...numbers].sort((a, b) => a - b),
    middle = Math.floor(sorted.length / 2);
  return sorted.length % 2
    ? sorted[middle]
    : (sorted[middle - 1] + sorted[middle]) / 2;
}
export function formatSummary(
  value: number | null,
  config: NumberSummaryConfig,
) {
  if (value === null) return "–";
  const number = new Intl.NumberFormat("th-TH", {
    maximumFractionDigits: 2,
  }).format(value);
  if (!config.unit) return number;
  return config.position === "left"
    ? `${config.unit} ${number}`
    : `${number} ${config.unit}`;
}
