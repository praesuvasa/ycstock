import { NextResponse } from "next/server";
import { db } from "@/lib/db";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  try {
    const body = (await req.json()) as { itemId?: string; hasRemainder?: boolean; gramsPerUOM?: number; remainderGroup?: string };
    if (!body.itemId) return NextResponse.json({ error: "itemId จำเป็น" }, { status: 400 });
    const hasRemainder = !!body.hasRemainder;
    const gramsPerUOM = Number(body.gramsPerUOM) || 0;
    const remainderGroup = typeof body.remainderGroup === "string" ? body.remainderGroup : undefined;
    const res = await db.setItemConfig(body.itemId, { hasRemainder, gramsPerUOM, remainderGroup });
    return NextResponse.json(res);
  } catch (e: any) {
    return NextResponse.json({ error: e?.message ?? "setItemConfig failed" }, { status: 500 });
  }
}
