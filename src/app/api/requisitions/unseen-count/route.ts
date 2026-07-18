import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireSession, authErrorResponse } from "@/lib/authz";

export const dynamic = "force-dynamic";

// GET /api/requisitions/unseen-count — ใช้ทำ badge ที่เมนู "ขอเบิกสินค้า" + การ์ดใน Dashboard
// เฉพาะ restock/admin ที่เห็น list รวมทุกสาขา — role user คืน 0 เสมอ (ไม่เกี่ยวกับเขา)
export async function GET() {
  try {
    const s = await requireSession();
    if (s.role !== "restock" && s.role !== "admin") {
      return NextResponse.json({ count: 0 });
    }
    const count = await db.countUnseenRequisitions();
    return NextResponse.json({ count });
  } catch (e) {
    const a = authErrorResponse(e);
    return NextResponse.json(a ? a.body : { error: (e as any)?.message ?? "unseen-count failed" }, { status: a ? a.status : 500 });
  }
}
