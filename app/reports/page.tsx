import type { Metadata } from "next";
import Dashboard from "@/components/authenticated-dashboard";
export const metadata: Metadata = { title: "สรุปผลงาน — workly" };
export default function Page() {
  return <Dashboard view="reports" />;
}
