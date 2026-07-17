import { NextResponse } from "next/server";
import { db, parseBranch } from "@/lib/db";
import type { StockRow } from "@/lib/types";
import { requireSession, resolveBranch, assertCanEditDate, authErrorResponse } from "@/lib/authz";
import { writeAudit } from "@/lib/audit";

export const dynamic = "force-dynamic";

function fail(e: unknown, msg: string) {
  const a = authErrorResponse(e);
  if (a) return NextResponse.json(a.body, { status: a.status });
  return NextResponse.json({ error: (e as any)?.message ?? msg }, { status: 500 });
}

export async function GET(req: Request) {
  try {
    const s = await requireSession();
    const { searchParams } = new URL(req.url);
    const branch = resolveBranch(s, parseBranch(searchParams.get("branch")));
    const date = searchParams.get("date");
    if (!date) return NextResponse.json({ error: "date จำเป็น" }, { status: 400 });
    const rows = await db.getStock(branch, date);
    return NextResponse.json({ rows, branch });
  } catch (e) {
    return fail(e, "getStock failed");
  }
}

export async function POST(req: Request) {
  try {
    const s = await requireSession();
    const body = (await req.json()) as { branch?: string; date?: string; rows?: StockRow[] };
    const branch = resolveBranch(s, parseBranch(body.branch ?? null));
    const date = body.date;
    if (!date) return NextResponse.json({ error: "date จำเป็น" }, { status: 400 });
    assertCanEditDate(s, date); // user ≤ 3 วัน · admin ไม่จำกัด
    if (!Array.isArray(body.rows)) return NextResponse.json({ error: "rows จำเป็น" }, { status: 400 });

    const result = await db.saveStock(branch, date, body.rows);
    await writeAudit(s, "save_stock", { branch, date, detail: `บันทึกสต็อก ${body.rows.length} รายการ` });
    return NextResponse.json(result);
  } catch (e) {
    return fail(e, "saveStock failed");
  }
}
