import { NextResponse } from "next/server";
import { db, parseBranch } from "@/lib/db";
import { requireSession, resolveBranch, AuthError, authErrorResponse } from "@/lib/authz";
import type { Requisition } from "@/lib/types";

export const dynamic = "force-dynamic";

function fail(e: unknown, msg: string) {
  const a = authErrorResponse(e);
  if (a) return NextResponse.json(a.body, { status: a.status });
  return NextResponse.json({ error: (e as any)?.message ?? msg }, { status: 500 });
}

// GET /api/requisitions?mine=1 หรือ ?branch=NVP
// role user → เห็นแค่ของตัวเองเสมอ (ไม่สนใจ query) · role restock/admin → เห็นทั้งหมด เลือก filter สาขาได้
export async function GET(req: Request) {
  try {
    const s = await requireSession();
    const { searchParams } = new URL(req.url);
    const mineOnly = s.role === "user" || searchParams.get("mine") === "1";
    const branch = parseBranch(searchParams.get("branch"));
    const rows = await db.listRequisitions({
      userId: mineOnly ? s.userId : undefined,
      branch: branch ?? undefined,
      limit: 100,
    });
    return NextResponse.json({ rows });
  } catch (e) {
    return fail(e, "getRequisitions failed");
  }
}

// POST /api/requisitions — ส่งคำขอเบิก (user/admin เท่านั้น — restock role เป็นฝ่ายรับคำขอ ไม่ใช่ผู้ขอ)
export async function POST(req: Request) {
  try {
    const s = await requireSession();
    if (s.role === "restock") throw new AuthError("จนท. Restock ไม่ต้องส่งคำขอเบิก", 403);

    const body = (await req.json()) as {
      branch?: string; itemId?: string; itemName?: string; qty?: number; unit?: string; note?: string;
    };
    const branch = resolveBranch(s, parseBranch(body.branch ?? null));
    const itemName = (body.itemName ?? "").trim();
    if (!itemName) return NextResponse.json({ error: "ต้องระบุชื่อรายการ" }, { status: 400 });
    const qty = Number(body.qty);
    if (!Number.isFinite(qty) || qty <= 0) return NextResponse.json({ error: "จำนวนต้องมากกว่า 0" }, { status: 400 });

    const input: Omit<Requisition, "id" | "createdAt"> = {
      branch, itemId: body.itemId || undefined, itemName, qty,
      unit: body.unit?.trim() || undefined, note: (body.note ?? "").trim(),
      requestedBy: s.name, requestedByUserId: s.userId,
    };
    const result = await db.createRequisition(input);
    return NextResponse.json({ ok: true, requisition: result });
  } catch (e) {
    return fail(e, "createRequisition failed");
  }
}
