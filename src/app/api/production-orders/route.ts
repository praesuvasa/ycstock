import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireAdminOrRestock, requireAdmin, authErrorResponse } from "@/lib/authz";
import { writeAudit } from "@/lib/audit";
import type { ProductionOrderItemInput } from "@/lib/types";

export const dynamic = "force-dynamic";

function fail(e: unknown, msg: string) {
  const a = authErrorResponse(e);
  if (a) return NextResponse.json(a.body, { status: a.status });
  return NextResponse.json({ error: (e as any)?.message ?? msg }, { status: 500 });
}

// GET /api/production-orders → { orders: ProductionOrderSummary[] } (ไม่มี ?id=) · limit default 50
// GET /api/production-orders?id=123 → { order: ProductionOrder } เต็มพร้อม items — ไม่พบ → 404
export async function GET(req: NextRequest) {
  try {
    await requireAdminOrRestock();
    const { searchParams } = new URL(req.url);
    const idParam = searchParams.get("id");
    if (idParam) {
      const id = Number(idParam);
      if (!Number.isFinite(id)) return NextResponse.json({ error: "id ไม่ถูกต้อง" }, { status: 400 });
      const order = await db.getProductionOrder(id);
      if (!order) return NextResponse.json({ error: "ไม่พบใบสั่งผลิต" }, { status: 404 });
      return NextResponse.json({ order });
    }
    const limitParam = searchParams.get("limit");
    const limit = limitParam ? Number(limitParam) : 50;
    const orders = await db.listProductionOrders(Number.isFinite(limit) ? limit : 50);
    return NextResponse.json({ orders });
  } catch (e) {
    return fail(e, "getProductionOrders failed");
  }
}

// POST /api/production-orders { orderDate, deliveryDate, note?, items } → { ok, order }
// สร้างใบใหม่เสมอ (ไม่เช็ค orderDate ซ้ำ — 1 วันสั่งได้หลายรอบ ดู spec ข้อ 0.1)
export async function POST(req: NextRequest) {
  try {
    const s = await requireAdminOrRestock();
    const body = (await req.json()) as {
      orderDate?: string; deliveryDate?: string; note?: string; items?: ProductionOrderItemInput[];
    };
    const orderDate = body.orderDate;
    const deliveryDate = body.deliveryDate;
    if (!orderDate) return NextResponse.json({ error: "orderDate จำเป็น" }, { status: 400 });
    if (!deliveryDate) return NextResponse.json({ error: "deliveryDate จำเป็น" }, { status: 400 });
    if (!Array.isArray(body.items)) return NextResponse.json({ error: "items จำเป็น" }, { status: 400 });

    const order = await db.createProductionOrder(
      { orderDate, deliveryDate, note: body.note ?? "", items: body.items },
      s.userId, s.name
    );
    await writeAudit(s, "save_production_order", {
      date: orderDate, detail: `สร้างใบสั่งผลิต ${body.items.length} รายการ (ส่ง ${deliveryDate})`,
    });
    return NextResponse.json({ ok: true, order });
  } catch (e) {
    return fail(e, "createProductionOrder failed");
  }
}

// PATCH /api/production-orders { id, orderDate?, deliveryDate?, note?, items?, removedItemIds? } → { ok, order }
// แก้ไขย้อนหลัง = UPDATE แถวเดิม ไม่ใช่สร้างใบใหม่ (ดู spec ข้อ 0.5)
export async function PATCH(req: NextRequest) {
  try {
    const s = await requireAdminOrRestock();
    const body = (await req.json()) as {
      id?: number; orderDate?: string; deliveryDate?: string; note?: string;
      items?: ProductionOrderItemInput[]; removedItemIds?: number[];
    };
    const id = Number(body.id);
    if (!Number.isFinite(id)) return NextResponse.json({ error: "ต้องระบุ id" }, { status: 400 });

    const order = await db.updateProductionOrder(id, {
      orderDate: body.orderDate, deliveryDate: body.deliveryDate, note: body.note,
      items: body.items, removedItemIds: body.removedItemIds,
    });
    if (!order) return NextResponse.json({ error: "ไม่พบใบสั่งผลิต" }, { status: 404 });

    await writeAudit(s, "edit_production_order", {
      date: order.orderDate, detail: `แก้ไขใบสั่งผลิต #${id}`,
    });
    return NextResponse.json({ ok: true, order });
  } catch (e) {
    return fail(e, "updateProductionOrder failed");
  }
}

// DELETE /api/production-orders?id=123 → { ok } — admin เท่านั้น (ลบใบผิด/ซ้ำ กันสับสนในหน้าประวัติ)
export async function DELETE(req: NextRequest) {
  try {
    const s = await requireAdmin();
    const { searchParams } = new URL(req.url);
    const id = Number(searchParams.get("id"));
    if (!Number.isFinite(id)) return NextResponse.json({ error: "ต้องระบุ id" }, { status: 400 });

    const order = await db.getProductionOrder(id);
    if (!order) return NextResponse.json({ error: "ไม่พบใบสั่งผลิต" }, { status: 404 });

    await db.deleteProductionOrder(id);
    await writeAudit(s, "delete_production_order", {
      date: order.orderDate, detail: `ลบใบสั่งผลิต #${id} (${order.items.length} รายการ)`,
    });
    return NextResponse.json({ ok: true });
  } catch (e) {
    return fail(e, "deleteProductionOrder failed");
  }
}
