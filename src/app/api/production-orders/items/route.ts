import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireAdminOrRestock, authErrorResponse } from "@/lib/authz";
import { writeAudit } from "@/lib/audit";

export const dynamic = "force-dynamic";

function fail(e: unknown, msg: string) {
  const a = authErrorResponse(e);
  if (a) return NextResponse.json(a.body, { status: a.status });
  return NextResponse.json({ error: (e as any)?.message ?? msg }, { status: 500 });
}

// PATCH /api/production-orders/items { id, qty?, qtyG?, confirmed?, confirmedQty?, confirmedQtyG?, itemName?, branch? }
// → { ok, item }
// itemName/branch เป็น optional metadata จาก client ใช้แค่เขียน audit detail ให้อ่านง่าย (กันต้อง query ชื่อ item ซ้ำฝั่ง server)
export async function PATCH(req: NextRequest) {
  try {
    const s = await requireAdminOrRestock();
    const body = (await req.json()) as {
      id?: number; qty?: number; qtyG?: number;
      confirmed?: boolean; confirmedQty?: number; confirmedQtyG?: number;
      itemName?: string; branch?: string;
    };
    const id = Number(body.id);
    if (!Number.isFinite(id)) return NextResponse.json({ error: "ต้องระบุ id" }, { status: 400 });

    const item = await db.updateProductionOrderItem(id, {
      qty: body.qty, qtyG: body.qtyG,
      confirmed: body.confirmed, confirmedQty: body.confirmedQty, confirmedQtyG: body.confirmedQtyG,
    }, s.userId, s.name);
    if (!item) return NextResponse.json({ error: "ไม่พบรายการ" }, { status: 404 });

    const label = [body.itemName, body.branch].filter(Boolean).join(" · ") || `#${id}`;
    const action = body.confirmed !== undefined ? "confirm_production_item" : "edit_production_order";
    await writeAudit(s, action, { entity: String(id), detail: label });

    return NextResponse.json({ ok: true, item });
  } catch (e) {
    return fail(e, "updateProductionOrderItem failed");
  }
}
