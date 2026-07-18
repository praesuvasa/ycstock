import { NextResponse } from "next/server";
import { db, parseBranch } from "@/lib/db";
import { requireSession, resolveBranch, authErrorResponse } from "@/lib/authz";

export const dynamic = "force-dynamic";

// GET /api/stock-in/recent?branch=NVP&days=14 → { days: [{date,count}] } — วันนี้มาก่อน (reverse-chronological)
export async function GET(req: Request) {
  try {
    const s = await requireSession();
    const { searchParams } = new URL(req.url);
    const branch = resolveBranch(s, parseBranch(searchParams.get("branch")));
    const daysParam = parseInt(searchParams.get("days") ?? "14", 10);
    const days = Number.isFinite(daysParam) ? Math.min(Math.max(daysParam, 1), 60) : 14;
    const rows = await db.getRecentStockInDays(branch, days);
    return NextResponse.json({ days: rows, branch });
  } catch (e: any) {
    const a = authErrorResponse(e);
    return NextResponse.json(a ? a.body : { error: e?.message ?? "getRecentStockInDays failed" }, { status: a ? a.status : 500 });
  }
}
