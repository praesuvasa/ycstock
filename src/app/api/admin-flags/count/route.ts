import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireSession, authErrorResponse } from "@/lib/authz";

export const dynamic = "force-dynamic";

// GET /api/admin-flags/count — ใช้ทำ badge ที่เมนู admin — role อื่นคืน 0 เสมอ
export async function GET() {
  try {
    const s = await requireSession();
    if (s.role !== "admin") return NextResponse.json({ count: 0 });
    const flags = await db.listAdminFlags({ includeResolved: false });
    return NextResponse.json({ count: flags.length });
  } catch (e) {
    const a = authErrorResponse(e);
    return NextResponse.json(a ? a.body : { error: (e as any)?.message ?? "count failed" }, { status: a ? a.status : 500 });
  }
}
