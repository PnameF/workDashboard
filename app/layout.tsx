import type { Metadata } from "next";
import "./globals.css";
import OverlayScrollLock from "@/components/overlay-scroll-lock";
export const metadata: Metadata = {
  title: "workly — พื้นที่ทำงานของทีม",
  description: "จัดการงานของคุณและทีม พร้อมตารางที่ปรับแต่งได้และรายงานผลงาน",
};
export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="th">
      <body>
        <OverlayScrollLock />
        {children}
      </body>
    </html>
  );
}
