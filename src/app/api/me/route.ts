import { NextResponse } from "next/server";
import { getSession, requireSession, authErrorResponse } from "@/lib/authz";
import { db } from "@/lib/db";
import { faceConfigured } from "@/lib/face";
import { signSession, SESSION_COOKIE } from "@/lib/session";

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
  // อ่านสดจาก DB เหมือน allowanceEnabled/workUnit — แอดมินแก้ที่หน้า /users แล้วเห็นผลทันที
  // ไม่ต้องรอ session หมดอายุ (session.lang เป็นแค่ค่าตอนล็อกอิน ใช้แปล error ฝั่งเซิร์ฟเวอร์เท่านั้น)
  let preferredLang: "th" | "en" = s.lang ?? "th";
  // เมนูที่ยังไม่เปิดใช้ — ปิดไว้ทั้งเมนู เช็คลิสต์ และ badge พร้อมกัน
  // ถ้าปิดแค่เมนู งานจะยังค้างอยู่ในเช็คลิสต์ แล้วขึ้นว่า "งานวันนี้ยังไม่ครบ" ทุกวันโดยไม่มีใครทำได้
  let expiryCheckEnabled = false;
  // เมนูลงเวลา + ตารางงาน — ปิดไว้จนกว่าจะเปิดใช้จริงกับพนักงาน (แพรสั่ง 2026-07-31)
  let staffTimeMenuEnabled = false;
  try {
    const u = await db.getUserById(s.userId);
    allowanceEnabled = !!u?.allowanceEnabled;
    workUnit = u?.workUnit ?? "store";
    isSenior = !!u?.isSenior;
    preferredLang = u?.preferredLang ?? "th";
    expiryCheckEnabled = (await db.getAppSetting("expiry_check_enabled")) === "1";
    staffTimeMenuEnabled = (await db.getAppSetting("staff_time_menu_enabled")) === "1";
    if (s.role !== "admin" && faceConfigured()) {
      const enrollment = await db.getFaceEnrollment(s.userId);
      mustEnrollFace = !enrollment.faceId;
    }
  } catch {
    // อ่านไม่ได้ = ถือว่ายังไม่ได้รับสิทธิ์ (ซ่อนเมนู) ดีกว่าโชว์เมนูที่กดแล้วพัง
  }
  return NextResponse.json({
    user: { id: s.userId, name: s.name, role: s.role, branchScope: s.branchScope, allowanceEnabled, mustEnrollFace, workUnit, isSenior, preferredLang, features: { expiryCheck: expiryCheckEnabled, staffTimeMenu: staffTimeMenuEnabled } },
  });
}

// PATCH /api/me { preferredLang } — พนักงานสลับภาษาของตัวเองได้เลย ไม่ต้องรอแอดมิน
// (แพรสั่ง 2026-08-17 — ทั้ง self-service และแอดมินตั้งให้ที่ /users ได้ทั้งคู่)
// ออก session ใหม่ทันทีที่มี lang อัปเดต ไม่งั้น error ฝั่งเซิร์ฟเวอร์ (เช่น validatePin) จะยังพูดภาษาเดิม
// จนกว่าจะ login ใหม่รอบหน้า
export async function PATCH(req: Request) {
  try {
    const s = await requireSession();
    const body = (await req.json()) as { preferredLang?: string };
    if (body.preferredLang !== "th" && body.preferredLang !== "en") {
      return NextResponse.json({ error: "invalid preferredLang" }, { status: 400 });
    }
    await db.updateUser(s.userId, { preferredLang: body.preferredLang });
    const token = await signSession({
      userId: s.userId, name: s.name, role: s.role, branchScope: s.branchScope, lang: body.preferredLang,
      ...(s.mustSetPasscode ? { mustSetPasscode: true } : {}),
    });
    const res = NextResponse.json({ ok: true, preferredLang: body.preferredLang });
    res.cookies.set(SESSION_COOKIE, token, {
      httpOnly: true, sameSite: "lax", path: "/", secure: process.env.NODE_ENV === "production",
      maxAge: 24 * 3600,
    });
    return res;
  } catch (e) {
    const a = authErrorResponse(e);
    if (!a) console.error("[me PATCH] unexpected error:", e);
    return NextResponse.json(a ? a.body : { error: "บันทึกไม่สำเร็จ" }, { status: a ? a.status : 500 });
  }
}
