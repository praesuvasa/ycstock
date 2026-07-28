import { NextResponse } from "next/server";
import { db, parseBranch } from "@/lib/db";
import { BRANCHES } from "@/lib/types";
import type { Branch } from "@/lib/types";
import { requireAdmin, authErrorResponse } from "@/lib/authz";
import { writeAudit } from "@/lib/audit";

export const dynamic = "force-dynamic";

function fail(e: unknown, msg: string) {
  const a = authErrorResponse(e);
  return NextResponse.json(a ? a.body : { error: (e as any)?.message ?? msg }, { status: a ? a.status : 500 });
}

// GET /api/time-clock/settings → สวิตช์ทั้งหมด + พิกัดร้านรายสาขา (admin เท่านั้น)
export async function GET() {
  try {
    await requireAdmin();
    const [settings, ...geos] = await Promise.all([
      db.getTimeClockSettings(),
      ...BRANCHES.map((b) => db.getBranchGeo(b)),
    ]);
    const branches = BRANCHES.map((b, i) => ({ branch: b, geo: geos[i] ?? null }));
    return NextResponse.json({ settings, branches });
  } catch (e) {
    return fail(e, "settings failed");
  }
}

// POST /api/time-clock/settings
//   { settings: {...} }                          → เปิด/ปิดสวิตช์
//   { branch, lat, lng, radiusM }                → ตั้งพิกัดร้าน
//
// แยก 2 แบบในเส้นเดียว เพราะหน้าตั้งค่ามีทั้งคู่ และไม่คุ้มที่จะทำ 2 endpoint สำหรับตารางเดียวกัน
export async function POST(req: Request) {
  try {
    const s = await requireAdmin();
    const body = await req.json();

    if (body?.settings) {
      const map: Record<string, string> = {
        time_clock_enabled: body.settings.enabled ? "1" : "0",
        time_clock_require_face: body.settings.requireFace ? "1" : "0",
        time_clock_require_location: body.settings.requireLocation ? "1" : "0",
      };
      for (const [k, v] of Object.entries(map)) await db.setAppSetting(k, v, s.name);
      await writeAudit(s, "time_clock_settings", {
        detail: `ลงเวลา: ${body.settings.enabled ? "เปิด" : "ปิด"} · สแกนหน้า ${body.settings.requireFace ? "บังคับ" : "ไม่บังคับ"} · ตำแหน่ง ${body.settings.requireLocation ? "บังคับ" : "ไม่บังคับ"}`,
      });
      return NextResponse.json({ ok: true });
    }

    const branch = parseBranch(body?.branch ?? null) as Branch | null;
    if (!branch) return NextResponse.json({ error: "ต้องระบุสาขา" }, { status: 400 });
    const lat = Number(body?.lat);
    const lng = Number(body?.lng);
    const radiusM = Math.max(30, Math.min(2000, Number(body?.radiusM) || 150));
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
      return NextResponse.json({ error: "พิกัดไม่ถูกต้อง" }, { status: 400 });
    }
    await db.setBranchGeo(branch, lat, lng, radiusM);
    await writeAudit(s, "branch_geo", { branch, detail: `ตั้งพิกัดร้าน ${lat},${lng} รัศมี ${radiusM}m` });
    return NextResponse.json({ ok: true });
  } catch (e) {
    return fail(e, "save settings failed");
  }
}
