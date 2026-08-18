import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireSession, AuthError, authErrorResponse } from "@/lib/authz";
import { writeAudit } from "@/lib/audit";
import { t } from "@/lib/i18n";

export const dynamic = "force-dynamic";

// POST /api/requisitions/move { id, date } — ย้ายคำขอเบิกไปเป็นรายการพิเศษในเมนู "ต้องเติม"
// admin + restock เท่านั้น (แพรยืนยัน 2026-08-07) — พนักงานทั่วไป (role user) เข้าไม่ได้เลย
export async function POST(req: Request) {
  try {
    const s = await requireSession();
    const lang = s.lang ?? "th";
    if (s.role !== "admin" && s.role !== "restock") {
      throw new AuthError(t(lang, "requisitions.errMoveRestrictedRole"), 403);
    }
    const body = (await req.json()) as { id?: string; date?: string };
    const id = String(body.id ?? "");
    const date = String(body.date ?? "");
    if (!id) return NextResponse.json({ error: t(lang, "requisitions.errRequisitionRequired") }, { status: 400 });
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return NextResponse.json({ error: t(lang, "requisitions.errInvalidDate") }, { status: 400 });

    const updated = await db.moveRequisitionToRestock(id, date, s.userId, s.name);
    await writeAudit(s, "requisition_moved", {
      branch: updated.branch, date, entity: id,
      detail: `ย้าย "${updated.itemName} × ${updated.qty}" ไปเมนูต้องเติม`,
    });
    return NextResponse.json({ ok: true, requisition: updated });
  } catch (e) {
    const a = authErrorResponse(e);
    if (a) return NextResponse.json(a.body, { status: a.status });
    return NextResponse.json({ error: (e as any)?.message ?? "moveRequisition failed" }, { status: 500 });
  }
}
