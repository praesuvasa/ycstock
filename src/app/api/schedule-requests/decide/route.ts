import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireSession, authErrorResponse } from "@/lib/authz";
import { writeAudit } from "@/lib/audit";

export const dynamic = "force-dynamic";

// POST /api/schedule-requests/decide { id, approve, note }
// อนุมัติ/ปฏิเสธคำขอสลับกะ — เฉพาะแอดมินและ senior staff
// อนุมัติแล้วระบบสลับกะให้ทั้งคู่ในวันเดียวกัน พร้อมเก็บประวัติทั้ง 2 ฝั่ง
export async function POST(req: Request) {
  try {
    const s = await requireSession();
    const me = await db.getUserById(s.userId);
    if (s.role !== "admin" && !me?.isSenior) {
      return NextResponse.json({ error: "อนุมัติได้เฉพาะแอดมินและ senior staff" }, { status: 403 });
    }
    const body = await req.json();
    const id = Number(body?.id);
    if (!Number.isFinite(id)) return NextResponse.json({ error: "ต้องระบุคำขอ" }, { status: 400 });
    const approve = !!body?.approve;
    const note = String(body?.note ?? "").trim();

    const res = await db.decideScheduleRequest(id, approve, s.name, note);
    if (!res.ok) return NextResponse.json({ error: (res as any).error }, { status: 400 });
    await writeAudit(s, "schedule_decide", { entity: String(id), detail: approve ? `อนุมัติคำขอ #${id}` : `ปฏิเสธคำขอ #${id}: ${note}` });
    return NextResponse.json({ ok: true });
  } catch (e) {
    const a = authErrorResponse(e);
    if (a) return NextResponse.json(a.body, { status: a.status });
    return NextResponse.json({ error: (e as any)?.message ?? "decide failed" }, { status: 500 });
  }
}
