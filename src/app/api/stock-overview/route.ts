import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireAdmin, authErrorResponse } from "@/lib/authz";
import { todayBangkok } from "@/lib/fmt";
import { BRANCHES } from "@/lib/types";

export const dynamic = "force-dynamic";

// GET /api/stock-overview?date=YYYY-MM-DD → คงเหลือล่าสุดของทุกไอเทม เทียบทุกสาขาในตารางเดียว (admin เท่านั้น)
// ไม่ระบุ date = วันนี้ (เวลาไทย) — getStock ยกยอดคงเหลือล่าสุดมาให้เองแม้สาขานั้นยังไม่ได้กดบันทึกของวันนี้
export async function GET(req: Request) {
  try {
    await requireAdmin();
    const { searchParams } = new URL(req.url);
    const dateParam = searchParams.get("date");
    const date = dateParam && /^\d{4}-\d{2}-\d{2}$/.test(dateParam) ? dateParam : todayBangkok();

    const { items } = await db.getMeta();
    const stockByBranch = await Promise.all(BRANCHES.map((b) => db.getStock(b, date)));

    const rows = items.map((it) => {
      const byBranch: Record<string, { remainPack: number; remainG: number } | null> = {};
      BRANCHES.forEach((b, i) => {
        const r = stockByBranch[i].find((row) => row.itemId === it.id);
        byBranch[b] = r ? { remainPack: r.remainPack, remainG: r.remainG } : null;
      });
      return { itemId: it.id, name: it.name, category: it.category, unit: it.unit, hasRemainder: it.hasRemainder, sort: it.sort, byBranch };
    }).sort((a, b) => a.category.localeCompare(b.category, "th") || a.sort - b.sort);

    return NextResponse.json({ date, branches: BRANCHES, rows });
  } catch (e) {
    const a = authErrorResponse(e);
    if (a) return NextResponse.json(a.body, { status: a.status });
    return NextResponse.json({ error: (e as any)?.message ?? "stock overview failed" }, { status: 500 });
  }
}
