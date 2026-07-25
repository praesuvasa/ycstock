import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireAdmin, authErrorResponse } from "@/lib/authz";
import { writeAudit } from "@/lib/audit";

export const dynamic = "force-dynamic";

function fail(e: unknown, msg: string) {
  const a = authErrorResponse(e);
  if (a) return NextResponse.json(a.body, { status: a.status });
  return NextResponse.json({ error: (e as any)?.message ?? msg }, { status: 500 });
}

// GET /api/admin-flags — คิวตรวจสอบ (รับไม่ตรงยอด / เพิ่มนอกใบ / แก้ทับ auto-fill) เฉพาะที่ยังไม่ตรวจ
export async function GET() {
  try {
    await requireAdmin();
    const flags = await db.listAdminFlags(false);
    return NextResponse.json({ flags });
  } catch (e) {
    return fail(e, "listAdminFlags failed");
  }
}

// PATCH /api/admin-flags { id } — กด "ตรวจแล้ว"
export async function PATCH(req: Request) {
  try {
    const s = await requireAdmin();
    const body = (await req.json()) as { id?: number };
    if (!body.id) return NextResponse.json({ error: "id จำเป็น" }, { status: 400 });
    await db.resolveAdminFlag(body.id, s.name);
    await writeAudit(s, "resolve_admin_flag", { entity: String(body.id), detail: "ตรวจสอบรายการแจ้งเตือนแล้ว" });
    return NextResponse.json({ ok: true });
  } catch (e) {
    return fail(e, "resolveAdminFlag failed");
  }
}
