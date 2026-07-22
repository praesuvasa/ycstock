import { NextResponse } from "next/server";
import { db, parseBranch } from "@/lib/db";
import { requireSession, resolveBranch, authErrorResponse } from "@/lib/authz";

export const dynamic = "force-dynamic";

// GET /api/cash-remittances/pending-days?branch=NVP → { days: [{date,cash}] } — วันที่มียอดเงินสด>0 แต่ยังไม่ถูกโอน
export async function GET(req: Request) {
  try {
    const s = await requireSession();
    const { searchParams } = new URL(req.url);
    const branch = resolveBranch(s, parseBranch(searchParams.get("branch")));
    const days = await db.listUnremittedCashDays(branch);
    return NextResponse.json({ days });
  } catch (e) {
    const a = authErrorResponse(e);
    if (a) return NextResponse.json(a.body, { status: a.status });
    return NextResponse.json({ error: (e as any)?.message ?? "pending-days failed" }, { status: 500 });
  }
}
