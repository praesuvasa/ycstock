import { NextResponse } from "next/server";
import { db, parseBranch } from "@/lib/db";
import { requireSession, resolveBranch, authErrorResponse } from "@/lib/authz";

export const dynamic = "force-dynamic";

// GET /api/confirm-receipt/sheets?branch=NVP — ใบ "ต้องเติม" ทุกใบของสาขานั้นที่ยังยืนยันรับไม่ครบ (ไม่ผูกวันนี้อย่างเดียว เผื่อของมาส่งช้า)
export async function GET(req: Request) {
  try {
    const s = await requireSession();
    const { searchParams } = new URL(req.url);
    const branch = resolveBranch(s, parseBranch(searchParams.get("branch")));
    const sheets = await db.listOutstandingRestockSheets(branch);
    return NextResponse.json({ sheets, branch });
  } catch (e) {
    const a = authErrorResponse(e);
    return NextResponse.json(a ? a.body : { error: (e as any)?.message ?? "list sheets failed" }, { status: a ? a.status : 500 });
  }
}
