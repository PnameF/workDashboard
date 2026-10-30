const palette = [
  "#ffb547",
  "#5da5ff",
  "#41d9ad",
  "#be8cff",
  "#ff789f",
  "#45cee5",
];
export function memberColor(id: number) {
  return palette[id] || `hsl(${Math.round((id * 137.508) % 360)} 78% 65%)`;
}
