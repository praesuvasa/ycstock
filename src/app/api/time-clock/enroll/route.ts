import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireSession, authErrorResponse } from "@/lib/authz";
import { writeAudit } from "@/lib/audit";
import { enrollFace, identifyFace, faceConfigured, FaceNotConfiguredError } from "@/lib/face";

export const dynamic = "force-dynamic";

// POST /api/time-clock/enroll { imageBase64 } → ลงทะเบียนใบหน้าของตัวเอง
//
// ลงทะเบียนเองเท่านั้น — แอดมินลงทะเบียนแทนคนอื่นไม่ได้ ไม่งั้นความหมายของ "ยืนยันตัวตน" หายไปทันที
// ทำได้ครั้งเดียว · จะลงใหม่ต้องให้แอดมินรีเซ็ตให้ก่อน (ดูเหตุผลในตัวฟังก์ชัน)
export async function POST(req: Request) {
  try {
    const s = await requireSession();
    if (!faceConfigured()) throw new FaceNotConfiguredError();

    const body = await req.json();
    const imageBase64 = String(body?.imageBase64 ?? "");
    if (!imageBase64) return NextResponse.json({ error: "ไม่มีรูป" }, { status: 400 });

    const prev = await db.getFaceEnrollment(s.userId);

    // ── ด่าน 1: ลงทะเบียนได้ครั้งเดียว แก้เองไม่ได้ (แพรสั่ง 2026-07-28) ──
    // แพรอยู่กับพนักงานทุกคนตอนลงทะเบียนไม่ได้ ครั้งแรกจึงให้ทำเองได้เลย
    // แต่ต้องล็อกหลังจากนั้น ไม่งั้นใครรู้รหัสของอีกคนก็เข้าไปเปลี่ยนเป็นหน้าตัวเองแล้วลงเวลาแทนได้
    // เปลี่ยนทรงผมจนสแกนไม่ผ่าน = ให้แอดมินกดรีเซ็ตให้ แล้วลงทะเบียนใหม่เหมือนครั้งแรก
    if (prev.faceId) {
      return NextResponse.json({
        error: "บัญชีนี้ลงทะเบียนใบหน้าไว้แล้ว แก้เองไม่ได้ — ถ้าสแกนไม่ผ่าน แจ้งแอดมินให้รีเซ็ตให้",
      }, { status: 403 });
    }

    // ── ด่าน 2: หน้านี้ต้องไม่ใช่ของบัญชีอื่นที่ลงทะเบียนไว้แล้ว ──
    // ครั้งแรกทำเองได้ = มีช่องให้เอาหน้าคนอื่นมาลง ด่านนี้จับได้ทันทีถ้าคนนั้นลงทะเบียนไว้แล้ว
    // และถ้าเขายังไม่ได้ลง วันที่เขามาลงของตัวเองจะโดนปฏิเสธ + เข้า audit ให้แอดมินเห็นย้อนหลัง
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

    const faceId = await enrollFace(s.userId, imageBase64);
    await db.saveFaceEnrollment(s.userId, faceId);
    await writeAudit(s, "face_enroll", { detail: "ลงทะเบียนใบหน้า" });

    return NextResponse.json({ ok: true });
  } catch (e) {
    if (e instanceof FaceNotConfiguredError) return NextResponse.json({ error: e.message }, { status: 503 });
    const a = authErrorResponse(e);
    return NextResponse.json(a ? a.body : { error: (e as any)?.message ?? "enroll failed" }, { status: a ? a.status : 500 });
  }
}
