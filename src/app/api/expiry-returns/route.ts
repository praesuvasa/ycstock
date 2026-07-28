import { NextResponse } from "next/server";
import { db, parseBranch } from "@/lib/db";
import type { Branch } from "@/lib/types";
import { requireSession, resolveBranch, authErrorResponse } from "@/lib/authz";
import { writeAudit } from "@/lib/audit";

export const dynamic = "force-dynamic";

function fail(e: unknown, msg: string) {
  const a = authErrorResponse(e);
  return NextResponse.json(a ? a.body : { error: (e as any)?.message ?? msg }, { status: a ? a.status : 500 });
}

// GET /api/expiry-returns?branch=NVP → ของที่ตรวจแล้วสั่งส่งคืน แต่ยังไม่ได้ฝากขึ้นรถ
//
// ไม่จำกัดช่วงวัน — ของที่ค้างมาหลายวันยิ่งต้องเตือน ไม่ใช่หายไปเพราะเก่าเกิน
export async function GET(req: Request) {
  try {
    const s = await requireSession();
    const { searchParams } = new URL(req.url);
    const branch = resolveBranch(s, parseBranch(searchParams.get("branch")));
    const rows = await db.listPendingReturns(branch);
    return NextResponse.json({ rows, branch });
  } catch (e) {
    return fail(e, "listPendingReturns failed");
  }
}

// POST /api/expiry-returns { branch } → ปิดทุกรายการที่ค้างว่า "ฝากรถแล้ว"
//
// ปิดทีเดียวทั้งสาขา เพราะของขึ้นรถไปพร้อมกันอยู่แล้ว — ให้ติ๊กทีละชิ้นจะกลายเป็นงานเพิ่มโดยไม่ได้ข้อมูลอะไรกลับมา
export async function POST(req: Request) {
  try {
    const s = await requireSession();
    const body = await req.json().catch(() => ({}));
    const branch = resolveBranch(s, parseBranch(body?.branch ?? null)) as Branch;
    const n = await db.markReturnsDispatched(branch);
    if (n > 0) {
      await writeAudit(s, "dispatch_expiry_returns", { branch, detail: `ฝากของส่งคืนขึ้นรถ ${n} รายการ` });
    }
    return NextResponse.json({ ok: true, dispatched: n });
  } catch (e) {
    return fail(e, "markReturnsDispatched failed");
  }
}
