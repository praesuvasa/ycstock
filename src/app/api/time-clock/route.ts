import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import type { Branch } from "@/lib/types";
import { requireSession, authErrorResponse } from "@/lib/authz";
import { writeAudit } from "@/lib/audit";
import { identifyFace, faceConfigured, FaceNotConfiguredError } from "@/lib/face";
import { todayBangkok } from "@/lib/fmt";

export const dynamic = "force-dynamic";

function fail(e: unknown, msg: string) {
  const a = authErrorResponse(e);
  return NextResponse.json(a ? a.body : { error: (e as any)?.message ?? msg }, { status: a ? a.status : 500 });
}

/** ระยะทางระหว่าง 2 พิกัด (เมตร) — สูตร haversine */
function distanceM(aLat: number, aLng: number, bLat: number, bLng: number): number {
  const R = 6371000;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(bLat - aLat);
  const dLng = toRad(bLng - aLng);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(aLat)) * Math.cos(toRad(bLat)) * Math.sin(dLng / 2) ** 2;
  return Math.round(2 * R * Math.asin(Math.sqrt(h)));
}

// GET /api/time-clock → สถานะของคนที่ล็อกอินอยู่ (เปิดใช้ไหม · ลงทะเบียนหน้าแล้วยัง · กะที่ค้างอยู่)
export async function GET() {
  try {
    const s = await requireSession();
    const [settings, enrollment, open] = await Promise.all([
      db.getTimeClockSettings(),
      db.getFaceEnrollment(s.userId),
      db.getOpenShift(s.userId),
    ]);
    return NextResponse.json({
      settings,
      faceConfigured: faceConfigured(),
      enrolled: !!enrollment.faceId,
      enrolledAt: enrollment.enrolledAt,
      enrollAllowed: enrollment.allowedUntil ? new Date(enrollment.allowedUntil).getTime() > Date.now() : false,
      open,
      name: s.name,
    });
  } catch (e) {
    return fail(e, "time-clock status failed");
  }
}

// POST /api/time-clock { action: "in" | "out", imageBase64?, lat?, lng? }
//
// ลำดับการตรวจ: เปิดใช้ไหม → หน้าตรงกับเจ้าของบัญชีไหม → อยู่ที่ร้านไหม → ค่อยบันทึก
// ทุกด่านที่ไม่ผ่านต้องบอกเหตุผลตรง ๆ ไม่ใช่ "ผิดพลาด" ลอย ๆ เพราะพนักงานต้องแก้เองหน้างาน
export async function POST(req: Request) {
  try {
    const s = await requireSession();
    const settings = await db.getTimeClockSettings();
    if (!settings.enabled) {
      return NextResponse.json({ error: "ระบบลงเวลายังไม่เปิดใช้งาน" }, { status: 400 });
    }
    if (s.branchScope === "all") {
      return NextResponse.json({ error: "บัญชีที่ไม่ผูกสาขาลงเวลาไม่ได้" }, { status: 400 });
    }
    const branch = s.branchScope as Branch;
    const body = await req.json();
    const action = body?.action === "out" ? "out" : "in";

    // ── ด่าน 1: ใบหน้า ──
    let similarity: number | null = null;
    if (settings.requireFace) {
      if (!body?.imageBase64) return NextResponse.json({ error: "ต้องถ่ายรูปหน้าก่อนลงเวลา" }, { status: 400 });
      const enrollment = await db.getFaceEnrollment(s.userId);
      if (!enrollment.faceId) {
        return NextResponse.json({ error: "ยังไม่ได้ลงทะเบียนใบหน้า — ไปที่ 'ข้อมูลของฉัน' เพื่อลงทะเบียนก่อน" }, { status: 400 });
      }
      const matches = await identifyFace(String(body.imageBase64));
      if (matches.length === 0) {
        return NextResponse.json({ error: "ไม่พบใบหน้าในรูป หรือไม่ตรงกับผู้ใช้คนไหน — ถ่ายใหม่ในที่สว่าง หันหน้าตรง" }, { status: 400 });
      }
      // ถามว่า "ตรงกับหน้าที่บัญชีนี้ลงทะเบียนไว้ไหม" ไม่ใช่ "หน้านี้คือใคร"
      // คนหนึ่งคนมีได้หลายบัญชี ถ้าถามแบบหลัง จะสุ่มได้บัญชีอื่นของคนเดียวกันแล้วปฏิเสธผิด ๆ
      const mine = matches.find((m) => m.userId === s.userId);
      if (!mine) {
        // ตรงกับคนอื่นจริง = มีคนกดแทนกัน — บันทึกไว้ให้แอดมินเห็น ไม่ใช่แค่ปฏิเสธเงียบ ๆ
        await writeAudit(s, "time_clock_face_mismatch", {
          branch, detail: `หน้าที่สแกนตรงกับผู้ใช้ ${matches.map((m) => `${m.userId} (${m.similarity}%)`).join(", ")} ไม่ใช่เจ้าของบัญชี`,
        });
        return NextResponse.json({ error: "ใบหน้าไม่ตรงกับเจ้าของบัญชี — ลงเวลาแทนกันไม่ได้" }, { status: 403 });
      }
      similarity = mine.similarity;
    }

    // ── ด่าน 2: ตำแหน่ง ──
    let dist: number | null = null;
    const lat = typeof body?.lat === "number" ? body.lat : null;
    const lng = typeof body?.lng === "number" ? body.lng : null;
    if (settings.requireLocation) {
      const geo = await db.getBranchGeo(branch);
      if (!geo) {
        return NextResponse.json({ error: "ยังไม่ได้ตั้งพิกัดร้านของสาขานี้ — แจ้งแอดมินก่อน" }, { status: 400 });
      }
      if (lat === null || lng === null) {
        return NextResponse.json({ error: "เปิดให้แอปเข้าถึงตำแหน่งก่อนลงเวลา" }, { status: 400 });
      }
      dist = distanceM(lat, lng, geo.lat, geo.lng);
      if (dist > geo.radiusM) {
        // บอกให้ครบว่าเทียบกับสาขาไหนและรัศมีเท่าไหร่ — เคสที่เจอจริงคือบัญชีผูกผิดสาขา
        // (ยืนอยู่สาขา A แต่บัญชีผูกสาขา B) ถ้าบอกแค่ระยะ จะไล่หาสาเหตุไม่ถูก
        return NextResponse.json({
          error: `อยู่ห่างจากร้านสาขา ${branch} ${dist.toLocaleString()} เมตร (รัศมีที่ตั้งไว้ ${geo.radiusM} เมตร) — ` +
            `ถ้ายืนอยู่ที่ร้านจริง แปลว่าพิกัดร้านหรือสาขาของบัญชีนี้ตั้งไว้ไม่ตรง`,
        }, { status: 403 });
      }
    } else if (lat !== null && lng !== null) {
      const geo = await db.getBranchGeo(branch);
      if (geo) dist = distanceM(lat, lng, geo.lat, geo.lng); // เก็บระยะไว้ดูเฉย ๆ ไม่บล็อก
    }

    // ── บันทึก ──
    const open = await db.getOpenShift(s.userId);
    if (action === "in") {
      if (open) return NextResponse.json({ error: "ยังไม่ได้กดออกงานของกะก่อนหน้า" }, { status: 400 });
      const row = await db.clockIn({
        branch, userId: s.userId, userName: s.name, workDate: todayBangkok(),
        similarity, lat, lng, distanceM: dist,
      });
      await writeAudit(s, "clock_in", { branch, detail: `เข้างาน${dist !== null ? ` · ห่างร้าน ${dist}m` : ""}` });
      return NextResponse.json({ ok: true, entry: row });
    }

    if (!open) return NextResponse.json({ error: "ยังไม่ได้กดเข้างาน" }, { status: 400 });
    const row = await db.clockOut(open.id, { similarity, lat, lng, distanceM: dist });
    await writeAudit(s, "clock_out", { branch, detail: "ออกงาน" });
    return NextResponse.json({ ok: true, entry: row });
  } catch (e) {
    if (e instanceof FaceNotConfiguredError) {
      return NextResponse.json({ error: e.message }, { status: 503 });
    }
    return fail(e, "time-clock failed");
  }
}
