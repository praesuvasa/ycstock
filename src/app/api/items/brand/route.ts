import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireAdmin, authErrorResponse } from "@/lib/authz";
import { writeAudit } from "@/lib/audit";
import { ITEM_BRAND_LABEL } from "@/lib/types";
import type { ItemBrand } from "@/lib/types";

export const dynamic = "force-dynamic";

const BRANDS: ItemBrand[] = ["yc", "staple", "shared"];

// POST /api/items/brand { itemId, brand } — แท็กว่าสินค้าตัวนี้เป็นของแบรนด์ไหน (admin เท่านั้น)
//
// แยก endpoint จาก /api/items/config เพราะเป็นคนละเรื่อง (วิธีนับ vs ของใคร)
// และหน้าตั้งค่าจะได้บันทึกทีละอย่างโดยไม่เขียนทับค่าของอีกฝั่ง
export async function POST(req: Request) {
  try {
    const s = await requireAdmin();
    const body = (await req.json()) as { itemId?: string; brand?: string };
    if (!body.itemId) return NextResponse.json({ error: "itemId จำเป็น" }, { status: 400 });
    const brand = body.brand as ItemBrand;
    if (!BRANDS.includes(brand)) {
      return NextResponse.json({ error: `brand ไม่ถูกต้อง (${BRANDS.join("|")})` }, { status: 400 });
    }
    const res = await db.setItemBrand(body.itemId, brand);
    await writeAudit(s, "update_item", { entity: body.itemId, detail: `แบรนด์: ${ITEM_BRAND_LABEL[brand]}` });
    return NextResponse.json(res);
  } catch (e: any) {
    const a = authErrorResponse(e);
    if (a) return NextResponse.json(a.body, { status: a.status });
    return NextResponse.json({ error: e?.message ?? "setItemBrand failed" }, { status: 500 });
  }
}
