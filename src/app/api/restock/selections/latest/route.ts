import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireAdminOrRestock, authErrorResponse } from "@/lib/authz";

export const dynamic = "force-dynamic";

// GET /api/restock/selections/latest → { rows: RestockSelectionLatestRow[] }
// ไม่มี query param — คืนค่าล่าสุดของ "ทุกสาขา" พร้อมกัน (โหมด B ต้องใช้ทุกสาขาอยู่แล้ว)
// เฉพาะ selected=true, 1 แถวต่อ (branch,itemId) ค่าล่าสุด
export async function GET() {
  try {
    await requireAdminOrRestock();
    const rows = await db.getLatestRestockSelections();
    return NextResponse.json({ rows });
  } catch (e: any) {
    const a = authErrorResponse(e);
    return NextResponse.json(a ? a.body : { error: e?.message ?? "getLatestRestockSelections failed" }, { status: a ? a.status : 500 });
  }
}
