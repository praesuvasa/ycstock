import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireSession, authErrorResponse } from "@/lib/authz";
import { writeAudit } from "@/lib/audit";
import { enrollFace, deleteFace, identifyFace, faceConfigured, FaceNotConfiguredError } from "@/lib/face";

export const dynamic = "force-dynamic";

// POST /api/time-clock/enroll { imageBase64 } → ลงทะเบียนใบหน้าของตัวเอง
//
// ลงทะเบียนเองเท่านั้น — แอดมินลงทะเบียนแทนคนอื่นไม่ได้ ไม่งั้นความหมายของ "ยืนยันตัวตน" หายไปทันที
// ลงทะเบียนซ้ำได้ (ตัดผม/ใส่แว่นใหม่แล้วสแกนไม่ผ่าน) — ของเก่าถูกลบทิ้งก่อนเสมอ กันหน้าเก่าค้างในระบบ
export async function POST(req: Request) {
  try {
    const s = await requireSession();
    if (!faceConfigured()) throw new FaceNotConfiguredError();

    const body = await req.json();
    const imageBase64 = String(body?.imageBase64 ?? "");
    if (!imageBase64) return NextResponse.json({ error: "ไม่มีรูป" }, { status: 400 });

    const prev = await db.getFaceEnrollment(s.userId);

    // ── ด่าน 1: ต้องได้รับอนุญาตจากแอดมินก่อนเสมอ ──
    // ถ้าปล่อยให้ลงทะเบียนเองได้อิสระ ใครรู้รหัสของอีกคนก็ล็อกอินไปเปลี่ยนเป็นหน้าตัวเองได้
    // แล้วลงเวลาแทนกันได้ตลอดไป — ระบบสแกนหน้าจะไม่เหลือความหมาย
    const allowed = prev.allowedUntil ? new Date(prev.allowedUntil).getTime() > Date.now() : false;
    if (!allowed) {
      return NextResponse.json({
        error: prev.faceId
          ? "ลงทะเบียนใบหน้าใหม่ต้องให้แอดมินเปิดสิทธิ์ให้ก่อน (กันคนอื่นเอาหน้าตัวเองมาลงทะเบียนทับ)"
          : "ต้องให้แอดมินเปิดสิทธิ์ลงทะเบียนใบหน้าให้ก่อน",
      }, { status: 403 });
    }

    // ── ด่าน 2: หน้านี้ต้องไม่ใช่ของบัญชีอื่นที่ลงทะเบียนไว้แล้ว ──
    // กันเคสที่แอดมินเผลอเปิดสิทธิ์ให้ แล้วมีคนอื่นมายืนถ่ายแทน
    const matches = await identifyFace(imageBase64);
    const other = matches.find((m) => m.userId !== s.userId);
    if (other) {
      await writeAudit(s, "face_enroll_blocked", {
        detail: `พยายามลงทะเบียนด้วยใบหน้าที่ตรงกับบัญชี ${other.userId} (${other.similarity}%)`,
      });
      return NextResponse.json({
        error: "ใบหน้านี้ลงทะเบียนไว้กับบัญชีอื่นแล้ว — ลงทะเบียนซ้ำในอีกบัญชีไม่ได้",
      }, { status: 403 });
    }

    if (prev.faceId) {
      try { await deleteFace(prev.faceId); } catch { /* ของเก่าหายไปแล้วก็ไม่เป็นไร */ }
    }

    const faceId = await enrollFace(s.userId, imageBase64);
    await db.saveFaceEnrollment(s.userId, faceId);
    await writeAudit(s, "face_enroll", { detail: prev.faceId ? "ลงทะเบียนใบหน้าใหม่ (แทนของเดิม)" : "ลงทะเบียนใบหน้าครั้งแรก" });

    return NextResponse.json({ ok: true });
  } catch (e) {
    if (e instanceof FaceNotConfiguredError) return NextResponse.json({ error: e.message }, { status: 503 });
    const a = authErrorResponse(e);
    return NextResponse.json(a ? a.body : { error: (e as any)?.message ?? "enroll failed" }, { status: a ? a.status : 500 });
  }
}
