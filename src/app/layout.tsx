import type { Metadata, Viewport } from "next";
import "./globals.css";
import { NavShell } from "@/components/nav";

export const metadata: Metadata = {
  // ชื่อกลางของทั้งระบบ — ชื่อจริงต่อหน่วยงาน (หน้าร้าน/ฝ่ายผลิต) ตั้งทับที่ NavShell หลังรู้ว่าใครล็อกอิน
  title: "BQMP Ops — ระบบจัดการงานประจำวัน",
  description: "หน้าร้าน: สต็อก · เติมของ · ยอดขาย · เงินสด · ฝ่ายผลิต: สต็อกกลาง · บันทึกการผลิต",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  themeColor: "#FBF7F0",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="th">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link href="https://fonts.googleapis.com/css2?family=Kanit:wght@300;400;500;600;700&display=swap" rel="stylesheet" />
      </head>
      <body>
        <NavShell>{children}</NavShell>
      </body>
    </html>
  );
}
