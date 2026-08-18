"use client";
// /store — หน้าหลักของ "หน่วยงานหน้าร้าน" (YC + Staple ใช้ร่วมกัน · v1.25)
//
// ทำไม YC กับ Staple ไม่แยก path: ที่ KCN และ NCD พนักงานคนเดียวขายทั้ง 2 แบรนด์ในกะเดียว
// ใช้ POS/สต็อก/ตู้ชุดเดียวกัน ถ้าแยก path จะต้องสลับจอไปมา และเช็คสต็อกซ้ำ 2 รอบสำหรับของชุดเดียว
// → แบรนด์แยกที่ "ตัวข้อมูล" (แท็กแบรนด์ของสินค้า/ยอดขาย) ไม่ใช่แยกที่หน้าจอ
//
// เนื้อหาหน้าเดียวกับ "/" เดิม — แอดมินเห็นแดชบอร์ดรวมทุกสาขา · พนักงานเห็นเช็คลิสต์งานวันนี้
import React from "react";
import { useRouter } from "next/navigation";
import { useMe, useLang } from "@/components/nav";
import { t } from "@/lib/i18n";
import { AdminDashboard } from "../admin-dashboard-view";
import { StaffHome } from "../staff-home-view";

export default function StoreHomePage() {
  const me = useMe();
  const lang = useLang();
  const router = useRouter();

  // ฝ่ายผลิตหลุดเข้ามา (เช่นกดลิงก์เก่า/บุ๊กมาร์กผิดหน่วย) → ส่งไปหน้าของหน่วยตัวเอง
  React.useEffect(() => {
    if (me && me.workUnit === "production" && me.role !== "admin") router.replace("/yogi");
  }, [me, router]);

  if (!me) return <p className="py-10 text-center text-sm text-brand-ink/50">{t(lang, "common.loading")}</p>;
  return me.role === "admin" ? <AdminDashboard /> : <StaffHome />;
}
