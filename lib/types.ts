export const people = ["ธนกร", "พิมพ์ชนก", "ณัฐวุฒิ", "ศิริพร"];
export const initials = ["ธก", "พช", "ณว", "ศพ"];
export const statuses = ["ยังไม่เริ่ม", "กำลังทำ", "เสร็จแล้ว", "ติดปัญหา"];
export type ColumnType =
  | "text"
  | "number"
  | "status"
  | "date"
  | "checkbox"
  | "url"
  | "email"
  | "multiselect"
  | "select"
  | "files"
  | "timeline";
/* Timeline values are stored as [startDate,endDate] inside task.custom. */
export type CustomColumn = {
  id: string;
  name: string;
  type: ColumnType;
  options?: string[];
};
export type Task = {
  created_by?: number | null;
  group_id?: string | null;
  id: string;
  name: string;
  person: number;
  assignees: number[];
  status: number;
  date: string;
  priority: string;
  project: string;
  hours: number | null;
  custom: Record<string, string | boolean | string[]>;
};
export type Attachment = {
  url?: string | null;
  column_id?: string | null;
  id: string;
  task_id: string;
  name: string;
  content_type: string;
  size: number;
};
export type ArchivedTask = {
  archived_group_id?:string|null;
  id: string;
  name: string;
  archived_at: string;
  group_id: string | null;
  file_count: number;
};
export type Workspace = {
  members?: { id: number; name: string }[];
  people?: string[];
  groups?: WorkGroup[];
  layout?: import("./board").BoardLayout;
  tasks: Task[];
  columns: CustomColumn[];
  attachments: Attachment[];
};
export type WorkGroup = { id: string; name: string; color: string };
