import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireAdmin, requireSession, AuthError, authErrorResponse } from "@/lib/authz";
import { writeAudit } from "@/lib/audit";
import type { AdminFlagReason } from "@/lib/types";

export const dynamic = "force-dynamic";

// senior เห็นได้เฉพาะ 2 เหตุผลนี้ (แพรขอ 2026-08-06) — ไม่ใช่คิวเต็มแบบแอดมิน
// (รับไม่ตรงยอด/เพิ่มนอกใบ/ฯลฯ ยังเป็นเรื่องที่ต้องยกให้แอดมินจัดการเท่านั้น)
const SENIOR_VISIBLE_REASONS: AdminFlagReason[] = ["stock_same_day_edit", "stock_backdated_edit"];

function fail(e: unknown, msg: string) {
  const a = authErrorResponse(e);
  if (a) return NextResponse.json(a.body, { status: a.status });
  return NextResponse.json({ error: (e as any)?.message ?? msg }, { status: 500 });
}

// GET /api/admin-flags — คิวตรวจสอบ เฉพาะที่ยังไม่ตรวจ
// admin เห็นทุกเหตุผล/ทุกสาขา · senior เห็นได้ด้วย (แพรสั่ง) แต่ล็อกสาขาตัวเอง + เห็นแค่ "แก้ยอดซ้ำ/ย้อนหลัง"
export async function GET() {
  try {
    const s = await requireSession();
    const isAdmin = s.role === "admin";
    let isSenior = false;
    if (!isAdmin) {
      const me = await db.getUserById(s.userId);
      isSenior = !!me?.isSenior;
      if (!isSenior) throw new AuthError("เฉพาะ Admin และ senior staff เท่านั้น", 403);
    }
    const flags = isAdmin
      ? await db.listAdminFlags({ includeResolved: false })
      : await db.listAdminFlags({
          includeResolved: false,
          branch: s.branchScope !== "all" ? s.branchScope : undefined,
          reasons: SENIOR_VISIBLE_REASONS,
        });
    return NextResponse.json({ flags, isSenior });
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
