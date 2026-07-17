import { NextResponse } from "next/server";
import { db, parseBranch } from "@/lib/db";
import type { SalesRow } from "@/lib/types";
import { requireSession, resolveBranch, assertCanEditDate, authErrorResponse } from "@/lib/authz";
import { writeAudit } from "@/lib/audit";

export const dynamic = "force-dynamic";

const authFail = (e: unknown, msg: string, status = 500) => {
  const a = authErrorResponse(e);
  return NextResponse.json(a ? a.body : { error: (e as any)?.message ?? msg }, { status: a ? a.status : status });
};

const isDate = (v: string | null): v is string => !!v && /^\d{4}-\d{2}-\d{2}$/.test(v);

// รวมยอด: In-store = cash+qr+edc · Delivery = grab+lineman · Total = In-store+Delivery
function shape(row: SalesRow) {
  const inStore = row.cash + row.qr + row.edc;
  const delivery = row.grab + row.lineman;
  return { row, inStore, delivery, total: inStore + delivery };
}

// GET /api/sales?branch=NVP&date=YYYY-MM-DD → { row, inStore, delivery, total }
export async function GET(req: Request) {
  try {
    const s = await requireSession();
    const { searchParams } = new URL(req.url);
    const branch = resolveBranch(s, parseBranch(searchParams.get("branch")));
    const date = searchParams.get("date");
    if (!isDate(date)) return NextResponse.json({ error: "date ไม่ถูกต้อง (YYYY-MM-DD)" }, { status: 400 });

    const row = await db.getSales(branch, date);
    return NextResponse.json(shape(row));
  } catch (e: any) {
    return authFail(e, "sales failed");
  }
}

// POST /api/sales { branch, date, row: SalesRow } → { ok }
export async function POST(req: Request) {
  try {
    const s = await requireSession();
    const body = await req.json();
    const branch = resolveBranch(s, parseBranch(body?.branch ?? null));
    const date = body?.date ?? null;
    if (!isDate(date)) return NextResponse.json({ error: "date ไม่ถูกต้อง (YYYY-MM-DD)" }, { status: 400 });
    assertCanEditDate(s, date); // user ≤ 3 วัน · admin ไม่จำกัด
    if (!body?.row || typeof body.row !== "object")
      return NextResponse.json({ error: "row ไม่ถูกต้อง" }, { status: 400 });

    const r = body.row;
    const num = (v: any) => (Number.isFinite(Number(v)) ? Number(v) : 0);
    const row: SalesRow = {
      cash: num(r.cash), qr: num(r.qr), edc: num(r.edc), grab: num(r.grab), lineman: num(r.lineman),
    };

    const res = await db.saveSales(branch, date, row);
    await writeAudit(s, "save_sales", { branch, date, detail: `บันทึกยอดขาย` });
    return NextResponse.json(res);
  } catch (e: any) {
    return authFail(e, "sales save failed");
  }
}
