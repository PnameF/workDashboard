export type TaskUpdate = {
  images?:import('./types').Attachment[];
  id: string;
  body: string;
  created_at: number;
  updated_at: number;
  authorName: string;
  avatarUrl: string | null;
  isAdmin: boolean;
  canEdit: boolean;
};
export function validUpdateBody(value: unknown): value is string {
  return (
    typeof value === "string" &&
    value.trim().length > 0 &&
    value.length <= 10000 &&
    !value.includes("\u0000")
  );
}
export function validUpdateCursor(value: string | null) {
  if (!value) return null;
  const match = /^(\d{1,16}):([a-zA-Z0-9-]{1,100})$/.exec(value);
  return match && Number.isSafeInteger(Number(match[1]))
    ? { time: Number(match[1]), id: match[2] }
    : null;
}
