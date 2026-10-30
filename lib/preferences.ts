export type Preferences = {
  homePage: "/my-work" | "/tasks" | "/reports" | "/archive";
  taskTab: "all" | "open" | "done";
  density: "comfortable" | "compact";
};
export const defaultPreferences: Preferences = {
  homePage: "/my-work",
  taskTab: "all",
  density: "comfortable",
};
export function normalizePreferences(value: unknown): Preferences {
  const p = (
    value && typeof value === "object" ? value : {}
  ) as Partial<Preferences>;
  return {
    homePage: ["/my-work", "/tasks", "/reports", "/archive"].includes(
      p.homePage || "",
    )
      ? p.homePage!
      : defaultPreferences.homePage,
    taskTab: ["all", "open", "done"].includes(p.taskTab || "")
      ? p.taskTab!
      : defaultPreferences.taskTab,
    density: p.density === "compact" ? "compact" : "comfortable",
  };
}
