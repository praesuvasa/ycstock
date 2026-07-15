import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireAdmin, authErrorResponse } from "@/lib/authz";

export const dynamic = "force-dynamic";

// GET /api/audit?userId=&branch=&action=&limit= → { rows } (admin เท่านั้น)
export async function GET(req: Request) {
  try {
    await requireAdmin();
    const { searchParams } = new URL(req.url);
    const filter: { userId?: string; branch?: string; action?: string; limit?: number } = {};
    const userId = searchParams.get("userId");
    const branch = searchParams.get("branch");
    const action = searchParams.get("action");
    const limit = searchParams.get("limit");
    if (userId) filter.userId = userId;
    if (branch) filter.branch = branch;
    if (action) filter.action = action;
    if (limit && Number.isFinite(Number(limit))) filter.limit = Number(limit);

    return NextResponse.json({ rows: await db.listAudit(filter) });
  } catch (e: any) {
    const a = authErrorResponse(e);
    if (a) return NextResponse.json(a.body, { status: a.status });
    return NextResponse.json({ error: e?.message ?? "audit failed" }, { status: 500 });
  }
}
