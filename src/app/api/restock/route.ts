import { NextRequest, NextResponse } from "next/server";
import { db, parseBranch } from "@/lib/db";
import { requireAdminOrRestock, authErrorResponse } from "@/lib/authz";
import { BRANCHES, type Weekday } from "@/lib/types";
import { t } from "@/lib/i18n";

export const dynamic = "force-dynamic";

const VALID_DAYS: Weekday[] = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"];

// GET /api/restock?branch=NVP&day=wed → { rows: RestockRow[], specialActive: boolean }
// day รับได้ทุกวันในสัปดาห์ (ไม่ใช่แค่ wed/sat) — ตั้งแต่หน้า restock เปลี่ยนมาใช้ date picker จริง
export async function GET(req: NextRequest) {
  try {
    const s = await requireAdminOrRestock();
    const lang = s.lang ?? "th";
    const { searchParams } = new URL(req.url);
    const branch = parseBranch(searchParams.get("branch"));
    if (!branch) {
      return NextResponse.json({ error: t(lang, "restock.errBranchInvalid", { branches: BRANCHES.join(lang === "en" ? " or " : " หรือ ") }) }, { status: 400 });
    }
    // NCD เห็นเฉพาะแอดมิน (แพรสั่ง 2026-08-07) — เหมือน /api/restock/selections
    if (branch === "NCD" && s.role !== "admin") {
      return NextResponse.json({ error: t(lang, "restock.errBranchForbidden") }, { status: 403 });
    }
    const day = searchParams.get("day") as Weekday | null;
    if (!day || !VALID_DAYS.includes(day)) {
      return NextResponse.json({ error: t(lang, "restock.errDayInvalid", { days: VALID_DAYS.join("|") }) }, { status: 400 });
    }

    const { rows, specialActive } = await db.getRestock(branch, day);
    return NextResponse.json({ rows, specialActive });
  } catch (e: any) {
    const a = authErrorResponse(e);
    return NextResponse.json(a ? a.body : { error: e?.message ?? "restock failed" }, { status: a ? a.status : 500 });
  }
}
