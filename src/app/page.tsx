"use client";
// หน้าแรก — แยกตามบทบาท (v1.14)
// แอดมิน = แดชบอร์ดรวมทุกสาขา (ของเดิม) · พนักงาน = เช็คลิสต์งานวันนี้ของสาขาตัวเอง
//
// แยกเป็น 2 คอมโพเนนต์คนละไฟล์แทนที่จะ if ในหน้าเดียว เพราะข้อมูลที่ต้องโหลดคนละชุด
// ถ้ารวมไว้ไฟล์เดียว พนักงานจะยิง /api/dashboard (admin-only) แล้วได้ 403 ทุกครั้งที่เข้าหน้าแรก
import React from "react";
import { useMe } from "@/components/nav";
import { AdminDashboard } from "./admin-dashboard-view";
import { StaffHome } from "./staff-home-view";

export default function HomePage() {
  const me = useMe();
  if (!me) return <p className="py-10 text-center text-sm text-brand-ink/50">กำลังโหลด…</p>;
  return me.role === "admin" ? <AdminDashboard /> : <StaffHome />;
}
