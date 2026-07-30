import { NextResponse } from "next/server";
import { getSession } from "@/lib/authz";
import { db } from "@/lib/db";
import { faceConfigured } from "@/lib/face";

export const dynamic = "force-dynamic";

export async function GET() {
  const s = await getSession();
  if (!s) return NextResponse.json({ user: null }, { status: 401 });
  // allowanceEnabled อ่านสดจาก DB ทุกครั้ง ไม่เก็บใน session — แอดมินเปิด/ปิดสิทธิ์แล้วมีผลทันที
  // ไม่ต้องรอพนักงาน logout เข้าใหม่ (session cookie อายุยาว กว่าจะหมดอาจเป็นสัปดาห์)
  let allowanceEnabled = false;
  // ต้องลงทะเบียนใบหน้าก่อนใช้งานไหม — ทำตั้งแต่วันแรกที่ตั้ง PIN (แพรสั่ง 2026-07-28)
  // เหตุผล: ตอนเพิ่งรับ "รหัสตั้งค่า" จากแอดมิน ยังไม่มีใครรู้รหัสของเขา จึงเป็นจังหวะเดียว
  // ที่มั่นใจได้ว่าคนที่ถ่ายคือเจ้าของบัญชีจริง โดยที่แอดมินไม่ต้องไปยืนดูทุกคน
  // ลงทะเบียนไว้ก่อนได้เลย แม้ระบบลงเวลายังไม่เปิด — เปิดวันไหนก็ใช้ได้ทันที ไม่ต้องไล่เก็บทีหลัง
  let mustEnrollFace = false;
  let workUnit: "store" | "production" = "store";
  let isSenior = false;
  // เมนูที่ยังไม่เปิดใช้ — ปิดไว้ทั้งเมนู เช็คลิสต์ และ badge พร้อมกัน
  // ถ้าปิดแค่เมนู งานจะยังค้างอยู่ในเช็คลิสต์ แล้วขึ้นว่า "งานวันนี้ยังไม่ครบ" ทุกวันโดยไม่มีใครทำได้
  let expiryCheckEnabled = false;
  try {
    const u = await db.getUserById(s.userId);
    allowanceEnabled = !!u?.allowanceEnabled;
    workUnit = u?.workUnit ?? "store";
    isSenior = !!u?.isSenior;
    expiryCheckEnabled = (await db.getAppSetting("expiry_check_enabled")) === "1";
    if (s.role !== "admin" && faceConfigured()) {
      const enrollment = await db.getFaceEnrollment(s.userId);
      mustEnrollFace = !enrollment.faceId;
    }
  } catch {
    // อ่านไม่ได้ = ถือว่ายังไม่ได้รับสิทธิ์ (ซ่อนเมนู) ดีกว่าโชว์เมนูที่กดแล้วพัง
  }
  return NextResponse.json({
    user: { id: s.userId, name: s.name, role: s.role, branchScope: s.branchScope, allowanceEnabled, mustEnrollFace, workUnit, isSenior, features: { expiryCheck: expiryCheckEnabled } },
  });
}
