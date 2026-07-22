import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireSession, authErrorResponse } from "@/lib/authz";

export const dynamic = "force-dynamic";

// DELETE /api/cash-remittances/:id — ลบใบโอนที่ผิด/อัปโหลดพลาด ให้วันที่ที่ครอบคลุมกลับไปเป็น "ยังไม่โอน" (แก้ไขใหม่ได้)
export async function DELETE(_req: Request, { params }: { params: { id: string } }) {
  try {
    await requireSession();
    await db.deleteCashRemittance(params.id);
    return NextResponse.json({ ok: true });
  } catch (e) {
    const a = authErrorResponse(e);
    if (a) return NextResponse.json(a.body, { status: a.status });
    return NextResponse.json({ error: (e as any)?.message ?? "deleteCashRemittance failed" }, { status: 500 });
  }
}
