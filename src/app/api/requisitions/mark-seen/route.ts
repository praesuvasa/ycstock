import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireSession, AuthError, authErrorResponse } from "@/lib/authz";

export const dynamic = "force-dynamic";

// POST /api/requisitions/mark-seen — เรียกตอนเปิดหน้า "ขอเบิกสินค้า" (list รวม) ครั้งแรก
// shared state ทีมเดียวกัน — ใครเปิดก่อน badge หายให้ทุกคนในทีม (restock/admin) ไม่แยกต่อ user
export async function POST() {
  try {
    const s = await requireSession();
    if (s.role !== "restock" && s.role !== "admin") {
      throw new AuthError("ไม่มีสิทธิ์เข้าถึงส่วนนี้", 403);
    }
    await db.markAllRequisitionsSeen();
    return NextResponse.json({ ok: true });
  } catch (e) {
    const a = authErrorResponse(e);
    return NextResponse.json(a ? a.body : { error: (e as any)?.message ?? "mark-seen failed" }, { status: a ? a.status : 500 });
  }
}
