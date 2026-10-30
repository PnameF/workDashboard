export type AuthUser = {
  id: string;
  name: string;
  email: string;
  role: "admin" | "member";
  memberId: number;
  avatarUrl?: string | null;
  preferences?: import("./preferences").Preferences;
};
export function nameInitials(name: string) {
  return (
    name
      .trim()
      .split(/\s+/)
      .slice(0, 2)
      .map((word) => Array.from(word)[0] || "")
      .join("")
      .toLocaleUpperCase() || "?"
  );
}
