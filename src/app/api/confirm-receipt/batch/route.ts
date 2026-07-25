import { NextResponse } from "next/server";
import { db, parseBranch } from "@/lib/db";
import { requireSession, resolveBranch, authErrorResponse } from "@/lib/authz";
import { writeAudit } from "@/lib/audit";
import type { RestockReceiptBatchEntry } from "@/lib/types";

export const dynamic = "force-dynamic";

// POST /api/confirm-receipt/batch { branch, date, entries: RestockReceiptBatchEntry[] }
// กด "ยืนยันทั้งหมด" — ยืนยันรับ/ไม่ได้รับหลายรายการทีเดียว
export async function POST(req: Request) {
  try {
    const s = await requireSession();
    const body = (await req.json()) as { branch?: string; date?: string; entries?: RestockReceiptBatchEntry[] };
    const branch = resolveBranch(s, parseBranch(body.branch ?? null));
    const date = body.date;
    if (!date) return NextResponse.json({ error: "date จำเป็น" }, { status: 400 });
    if (!Array.isArray(body.entries) || body.entries.length === 0) {
      return NextResponse.json({ error: "entries จำเป็น" }, { status: 400 });
    }
    const entries = body.entries.map((e) => ({
      itemId: e.itemId,
      receivedQty: Number(e.receivedQty ?? 0),
      receivedQtyG: Number(e.receivedQtyG ?? 0),
      isExtra: !!e.isExtra,
      notReceived: !!e.notReceived,
      note: (e.note ?? "").trim(),
    }));

    await db.batchConfirmRestockReceipt(branch, date, entries, s.userId, s.name);
    await writeAudit(s, "confirm_restock_receipt_batch", {
      branch, date, detail: `ยืนยันรับทั้งหมด ${entries.length} รายการ`,
    });
    return NextResponse.json({ ok: true });
  } catch (e) {
    const a = authErrorResponse(e);
    return NextResponse.json(a ? a.body : { error: (e as any)?.message ?? "batchConfirmRestockReceipt failed" }, { status: a ? a.status : 500 });
  }
}
