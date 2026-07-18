import { NextResponse } from "next/server";
import { db, parseBranch } from "@/lib/db";
import { requireSession, resolveBranch, authErrorResponse } from "@/lib/authz";

export const dynamic = "force-dynamic";

// GET /api/stock-in?branch=NVP&date=2026-07-18 → { rows: [{itemId,name,category,unit,inPack,inG}] }
// เข้าได้ทุก role ที่ login แล้ว (user เห็นแค่สาขาตัวเอง, admin ระบุสาขาไหนก็ได้) — role "restock" ถูกกันตั้งแต่ middleware แล้ว
export async function GET(req: Request) {
  try {
    const s = await requireSession();
    const { searchParams } = new URL(req.url);
    const branch = resolveBranch(s, parseBranch(searchParams.get("branch")));
    const date = searchParams.get("date");
    if (!date) return NextResponse.json({ error: "date จำเป็น" }, { status: 400 });
    const rows = await db.getStockIn(branch, date);
    return NextResponse.json({ rows, branch });
  } catch (e: any) {
    const a = authErrorResponse(e);
    return NextResponse.json(a ? a.body : { error: e?.message ?? "getStockIn failed" }, { status: a ? a.status : 500 });
  }
}
