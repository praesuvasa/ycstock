import { NextResponse } from "next/server";
import { db, parseBranch } from "@/lib/db";
import type { PaymentIncident } from "@/lib/types";
import { PAYMENT_INCIDENT_KINDS } from "@/lib/types";
import { requireSession, resolveBranch, assertCanEditDate, authErrorResponse } from "@/lib/authz";
import { writeAudit } from "@/lib/audit";

export const dynamic = "force-dynamic";

const isDate = (v: string | null): v is string => !!v && /^\d{4}-\d{2}-\d{2}$/.test(v);
const VALID_KINDS = new Set<string>(PAYMENT_INCIDENT_KINDS);

// POST /api/sales/incidents { branch, date, incidents } → { ok, count }
//
// บันทึก "เคสรับเงินไม่ตรงบิล" แยกจากการบันทึกยอดขาย (แพรขอ 2026-07-26)
// ลำดับการทำงานจริงคือ บันทึกเคส → แนบหลักฐาน → บันทึกยอดขาย
// เพราะยอดที่เอาไปเทียบสลิปต้องรวมผลของเคสแล้ว จึงต้องเก็บเคสให้อยู่ตัวก่อนแนบรูป
export async function POST(req: Request) {
  try {
    const s = await requireSession();
    const body = await req.json();
    const branch = resolveBranch(s, parseBranch(body?.branch ?? null));
    const date = body?.date ?? null;
    if (!isDate(date)) return NextResponse.json({ error: "date ไม่ถูกต้อง (YYYY-MM-DD)" }, { status: 400 });
    assertCanEditDate(s, date); // user ≤ 3 วัน · admin ไม่จำกัด

    const num = (v: any) => (Number.isFinite(Number(v)) ? Number(v) : 0);
    // บันทึกทับทั้งชุด · ตัดแถวที่ยังไม่ได้กรอกยอดเลยทิ้ง (กันแถวเปล่าที่กด "เพิ่มเคส" ค้างไว้)
    const incidents: PaymentIncident[] = (Array.isArray(body?.incidents) ? body.incidents : [])
      .filter((i: any) => VALID_KINDS.has(i?.kind))
      .map((i: any) => ({
        kind: i.kind, billAmount: num(i.billAmount), actualAmount: num(i.actualAmount),
        note: String(i.note ?? "").trim(),
      }))
      // ⚠️ ต้อง !== 0 ไม่ใช่ > 0 — "under_cash_topup" (โอนขาด·จ่ายสดเพิ่ม) เก็บ actualAmount ติดลบเสมอ
      // (ดู incidentAdjustment ใน calc.ts) ถ้าใช้ > 0 เคสนี้จะถูกกรองทิ้งทุกครั้งแล้วไม่เคยถูกบันทึกลง DB เลย
      .filter((i: PaymentIncident) => i.billAmount !== 0 || i.actualAmount !== 0);

    await db.savePaymentIncidents(branch, date, incidents, s.userId, s.name);
    await writeAudit(s, "save_payment_incidents", {
      branch, date, detail: `บันทึกเคสรับเงินไม่ตรงบิล ${incidents.length} เคส`,
    });
    return NextResponse.json({ ok: true, count: incidents.length, incidents });
  } catch (e: any) {
    const a = authErrorResponse(e);
    return NextResponse.json(a ? a.body : { error: e?.message ?? "save incidents failed" }, { status: a ? a.status : 500 });
  }
}
