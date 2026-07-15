import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireAdmin, authErrorResponse } from "@/lib/authz";
import { writeAudit } from "@/lib/audit";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  try {
    const s = await requireAdmin();
    const body = (await req.json()) as { itemId?: string; hasRemainder?: boolean; gramsPerUOM?: number; remainderGroup?: string };
    if (!body.itemId) return NextResponse.json({ error: "itemId จำเป็น" }, { status: 400 });
    const hasRemainder = !!body.hasRemainder;
    const gramsPerUOM = Number(body.gramsPerUOM) || 0;
    const remainderGroup = typeof body.remainderGroup === "string" ? body.remainderGroup : undefined;
    const res = await db.setItemConfig(body.itemId, { hasRemainder, gramsPerUOM, remainderGroup });
    await writeAudit(s, "update_item", { entity: body.itemId, detail: `config: ${hasRemainder ? "แกะ" : "เต็มกล่อง"} ${gramsPerUOM}${remainderGroup ? " · กลุ่ม " + remainderGroup : ""}` });
    return NextResponse.json(res);
  } catch (e: any) {
    const a = authErrorResponse(e);
    if (a) return NextResponse.json(a.body, { status: a.status });
    return NextResponse.json({ error: e?.message ?? "setItemConfig failed" }, { status: 500 });
  }
}
