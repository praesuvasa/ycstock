import { NextResponse } from "next/server";
import { db, parseBranch } from "@/lib/db";
import type { SalesRow, PaymentIncident } from "@/lib/types";
import { sumIncidentAdjustments } from "@/lib/calc";
import { requireSession, resolveBranch, assertCanEditDate, authErrorResponse } from "@/lib/authz";
import { writeAudit } from "@/lib/audit";

export const dynamic = "force-dynamic";

const authFail = (e: unknown, msg: string, status = 500) => {
  const a = authErrorResponse(e);
  return NextResponse.json(a ? a.body : { error: (e as any)?.message ?? msg }, { status: a ? a.status : status });
};

const isDate = (v: string | null): v is string => !!v && /^\d{4}-\d{2}-\d{2}$/.test(v);

// รวมยอด: In-store = cash+qr+edc · Delivery = grab+lineman · Total = In-store+Delivery
//
// v1.11: row = ยอดตาม POS ที่พนักงานกรอก · actual = ยอดเงินเข้าจริง (POS + ผลรวมเคสรับเงินไม่ตรงบิล)
// ตัวที่เอาไปเทียบสลิปตอนอัปโหลดหลักฐานคือ actual ไม่ใช่ row
function shape(row: SalesRow, incidents: PaymentIncident[] = []) {
  const inStore = row.cash + row.qr + row.edc;
  const delivery = row.grab + row.lineman;
  const adj = sumIncidentAdjustments(incidents);
  const actual: SalesRow = { ...row, qr: row.qr + adj.qr, cash: row.cash + adj.cash };
  return {
    row, inStore, delivery, total: inStore + delivery,
    incidents, adjustment: adj, actual,
    // ยอดรวมเงินเข้าจริง — ต่างจาก total เท่ากับส่วนที่ลูกค้าโอนเกินแล้วไม่ได้ทอนคืน
    actualTotal: inStore + delivery + adj.overBill,
  };
}

// GET /api/sales?branch=NVP&date=YYYY-MM-DD → { row, inStore, delivery, total }
export async function GET(req: Request) {
  try {
    const s = await requireSession();
    const { searchParams } = new URL(req.url);
    const branch = resolveBranch(s, parseBranch(searchParams.get("branch")));
    const date = searchParams.get("date");
    if (!isDate(date)) return NextResponse.json({ error: "date ไม่ถูกต้อง (YYYY-MM-DD)" }, { status: 400 });

    const [row, incidents] = await Promise.all([
      db.getSales(branch, date),
      db.getPaymentIncidents(branch, date),
    ]);
    return NextResponse.json(shape(row, incidents));
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

    // เคสรับเงินไม่ตรงบิล — บันทึกทับทั้งชุด · กรองแถวที่ยอดยังไม่ได้กรอกทั้งคู่ออก
    const VALID_KINDS = new Set(["over_no_change", "over_cash_change", "under_cash_topup"]);
    const incidents: PaymentIncident[] = (Array.isArray(body?.incidents) ? body.incidents : [])
      .filter((i: any) => VALID_KINDS.has(i?.kind))
      .map((i: any) => ({
        kind: i.kind, billAmount: num(i.billAmount), actualAmount: num(i.actualAmount),
        note: String(i.note ?? "").trim(),
      }))
      .filter((i: PaymentIncident) => i.billAmount > 0 || i.actualAmount > 0);

    const [res] = await Promise.all([
      db.saveSales(branch, date, row),
      db.savePaymentIncidents(branch, date, incidents, s.userId, s.name),
    ]);
    const incidentNote = incidents.length ? ` · เคสรับเงินไม่ตรงบิล ${incidents.length} เคส` : "";
    await writeAudit(s, "save_sales", { branch, date, detail: `บันทึกยอดขาย${incidentNote}` });
    return NextResponse.json(res);
  } catch (e: any) {
    return authFail(e, "sales save failed");
  }
}
