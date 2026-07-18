import { NextResponse } from "next/server";
import { requireSession, authErrorResponse } from "@/lib/authz";
import { writeAudit } from "@/lib/audit";

export const dynamic = "force-dynamic";

// export/print เป็น client-side ล้วน (Blob download / window.print) — endpoint นี้ไว้แค่บันทึก audit log
// เรียกแบบ fire-and-forget จากหน้า restock ไม่ block การ export/print จริง
const ALLOWED_ACTIONS = new Set(["export_restock_csv", "export_production_csv", "print_restock_slip"]);

export async function POST(req: Request) {
  try {
    const s = await requireSession();
    const body = (await req.json()) as { action?: string; branch?: string; date?: string; detail?: string };
    if (!body.action || !ALLOWED_ACTIONS.has(body.action)) {
      return NextResponse.json({ error: "action ไม่ถูกต้อง" }, { status: 400 });
    }
    await writeAudit(s, body.action, { branch: body.branch ?? null, date: body.date ?? null, detail: body.detail ?? "" });
    return NextResponse.json({ ok: true });
  } catch (e) {
    const a = authErrorResponse(e);
    return NextResponse.json(a ? a.body : { error: (e as any)?.message ?? "export-log failed" }, { status: a ? a.status : 500 });
  }
}
