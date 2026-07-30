"use client";
// หน้าแรก — แยกตามบทบาท (v1.14)
// แอดมิน = แดชบอร์ดรวมทุกสาขา (ของเดิม) · พนักงาน = เช็คลิสต์งานวันนี้ของสาขาตัวเอง
//
// แยกเป็น 2 คอมโพเนนต์คนละไฟล์แทนที่จะ if ในหน้าเดียว เพราะข้อมูลที่ต้องโหลดคนละชุด
// ถ้ารวมไว้ไฟล์เดียว พนักงานจะยิง /api/dashboard (admin-only) แล้วได้ 403 ทุกครั้งที่เข้าหน้าแรก
import React from "react";
import { useRouter } from "next/navigation";
import { useMe } from "@/components/nav";
import { AdminDashboard } from "./admin-dashboard-view";
import { StaffHome } from "./staff-home-view";

// v1.25: "/" กลายเป็นทางแยกไปหน้าหลักของหน่วยงาน (/store หรือ /yogi)
// ยังคงเรนเดอร์เนื้อหาให้เลยระหว่างรอเปลี่ยนหน้า เพื่อไม่ให้จอว่างแวบหนึ่ง
// (ลิงก์เก่า/บุ๊กมาร์กที่ชี้ "/" จึงยังใช้ได้ ไม่พัง)
export default function HomePage() {
  const me = useMe();
  const router = useRouter();
  const isProduction = !!me && me.workUnit === "production" && me.role !== "admin";

  React.useEffect(() => {
    if (!me) return;
    router.replace(isProduction ? "/yogi" : "/store");
  }, [me, isProduction, router]);

  if (!me) return <p className="py-10 text-center text-sm text-brand-ink/50">กำลังโหลด…</p>;
  if (isProduction) return <p className="py-10 text-center text-sm text-brand-ink/50">กำลังเปิดหน้าฝ่ายผลิต…</p>;
  return me.role === "admin" ? <AdminDashboard /> : <StaffHome />;
}
