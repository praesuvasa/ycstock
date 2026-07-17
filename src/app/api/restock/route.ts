import { NextRequest, NextResponse } from "next/server";
import { db, parseBranch } from "@/lib/db";
import { requireAdminOrRestock, authErrorResponse } from "@/lib/authz";
import { BRANCHES, type Weekday } from "@/lib/types";

export const dynamic = "force-dynamic";

const VALID_DAYS: Weekday[] = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"];

// GET /api/restock?branch=NVP&day=wed → { rows: RestockRow[], specialActive: boolean }
// day รับได้ทุกวันในสัปดาห์ (ไม่ใช่แค่ wed/sat) — ตั้งแต่หน้า restock เปลี่ยนมาใช้ date picker จริง
export async function GET(req: NextRequest) {
  try {
    await requireAdminOrRestock();
    const { searchParams } = new URL(req.url);
    const branch = parseBranch(searchParams.get("branch"));
    if (!branch) {
      return NextResponse.json({ error: `branch ต้องเป็น ${BRANCHES.join(" หรือ ")}` }, { status: 400 });
    }
    const day = searchParams.get("day") as Weekday | null;
    if (!day || !VALID_DAYS.includes(day)) {
      return NextResponse.json({ error: `day ต้องเป็นหนึ่งใน ${VALID_DAYS.join("|")}` }, { status: 400 });
    }

    const { rows, specialActive } = await db.getRestock(branch, day);
    return NextResponse.json({ rows, specialActive });
  } catch (e: any) {
    const a = authErrorResponse(e);
    return NextResponse.json(a ? a.body : { error: e?.message ?? "restock failed" }, { status: a ? a.status : 500 });
  }
}
