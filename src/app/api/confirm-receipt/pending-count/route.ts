import { NextResponse } from "next/server";
import { db, parseBranch } from "@/lib/db";
import { requireSession, resolveBranch, authErrorResponse } from "@/lib/authz";

export const dynamic = "force-dynamic";

// GET /api/confirm-receipt/pending-count?branch=NVP — ใช้ทำ badge ที่เมนู "ยืนยันรับของ" + banner หน้าสต็อก
export async function GET(req: Request) {
  try {
    const s = await requireSession();
    const { searchParams } = new URL(req.url);
    const branch = resolveBranch(s, parseBranch(searchParams.get("branch")));
    const count = await db.getPendingReceiptCount(branch);
    return NextResponse.json({ count, hasPending: count > 0, branch });
  } catch (e) {
    const a = authErrorResponse(e);
    return NextResponse.json(a ? a.body : { error: (e as any)?.message ?? "pending-count failed" }, { status: a ? a.status : 500 });
  }
}
