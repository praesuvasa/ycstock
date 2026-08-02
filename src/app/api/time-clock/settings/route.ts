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
    const [settings, expiryFlag, staffTimeFlag, ...geos] = await Promise.all([
      db.getTimeClockSettings(),
      db.getAppSetting("expiry_check_enabled"),
      db.getAppSetting("staff_time_menu_enabled"),
      ...BRANCHES.map((b) => db.getBranchGeo(b)),
    ]);
    const branches = BRANCHES.map((b, i) => ({ branch: b, geo: (geos[i] as any) ?? null }));
    return NextResponse.json({ settings, branches, expiryCheckEnabled: expiryFlag === "1", staffTimeMenuEnabled: staffTimeFlag === "1" });
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

    // เมนูตรวจวันหมดอายุ — เปิดวันที่พนักงานเริ่มใช้จริง (แพรสั่งปิดไว้ก่อน 2026-07-28)
    if (typeof body?.expiryCheckEnabled === "boolean") {
      await db.setAppSetting("expiry_check_enabled", body.expiryCheckEnabled ? "1" : "0", s.name);
      await writeAudit(s, "feature_toggle", {
        detail: `เมนูตรวจวันหมดอายุ: ${body.expiryCheckEnabled ? "เปิด" : "ปิด"}`,
      });
      return NextResponse.json({ ok: true });
    }

    // เมนูลงเวลา + ตารางงานของพนักงาน — เปิดวันที่เริ่มใช้จริง
    if (typeof body?.staffTimeMenuEnabled === "boolean") {
      await db.setAppSetting("staff_time_menu_enabled", body.staffTimeMenuEnabled ? "1" : "0", s.name);
      await writeAudit(s, "feature_toggle", {
        detail: `เมนูลงเวลา+ตารางงานของพนักงาน: ${body.staffTimeMenuEnabled ? "เปิด" : "ปิด"}`,
      });
      return NextResponse.json({ ok: true });
    }

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
