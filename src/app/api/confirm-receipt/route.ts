import { NextResponse } from "next/server";
import { db, parseBranch } from "@/lib/db";
import { requireSession, resolveBranch, authErrorResponse } from "@/lib/authz";
import { writeAudit } from "@/lib/audit";
import { t } from "@/lib/i18n";

export const dynamic = "force-dynamic";

function fail(e: unknown, msg: string) {
  const a = authErrorResponse(e);
  if (a) return NextResponse.json(a.body, { status: a.status });
  return NextResponse.json({ error: (e as any)?.message ?? msg }, { status: 500 });
}

// GET /api/confirm-receipt?branch=NVP&date=2026-07-24 — สถานะยืนยันรับของใบนี้ (รายการในใบ + รายการนอกใบที่เคยเพิ่ม)
export async function GET(req: Request) {
  try {
    const s = await requireSession();
    const lang = s.lang ?? "th";
    const { searchParams } = new URL(req.url);
    const branch = resolveBranch(s, parseBranch(searchParams.get("branch")));
    const date = searchParams.get("date");
    if (!date) return NextResponse.json({ error: t(lang, "confirmReceipt.errDateRequired") }, { status: 400 });
    const items = await db.getRestockReceiptStatus(branch, date);
    return NextResponse.json({ items, branch });
  } catch (e) {
    return fail(e, "getRestockReceiptStatus failed");
  }
}

// POST /api/confirm-receipt { branch, date, itemId, receivedQty, receivedQtyG, isExtra }
// ติ๊กยืนยันรับ 1 รายการ (หรือเพิ่มรายการนอกใบใหม่) — auto-fill เข้าหน้าสต็อกวันนี้ทันที
export async function POST(req: Request) {
  try {
    const s = await requireSession();
    const lang = s.lang ?? "th";
    const body = (await req.json()) as {
      branch?: string; date?: string; itemId?: string;
      receivedQty?: number; receivedQtyG?: number; isExtra?: boolean; note?: string; notReceived?: boolean;
    };
    const branch = resolveBranch(s, parseBranch(body.branch ?? null));
    const date = body.date;
    const itemId = body.itemId;
    if (!date) return NextResponse.json({ error: t(lang, "confirmReceipt.errDateRequired") }, { status: 400 });
    if (!itemId) return NextResponse.json({ error: t(lang, "confirmReceipt.errItemIdRequired") }, { status: 400 });
    const receivedQty = Number(body.receivedQty ?? 0);
    const receivedQtyG = Number(body.receivedQtyG ?? 0);
    const isExtra = !!body.isExtra;
    const notReceived = !!body.notReceived;
    const note = (body.note ?? "").trim();

    await db.confirmRestockReceipt(branch, date, itemId, receivedQty, receivedQtyG, isExtra, s.userId, s.name, note, notReceived);
    await writeAudit(s, "confirm_restock_receipt", {
      branch, date, entity: itemId,
      detail: isExtra ? `เพิ่มรายการนอกใบ จำนวน ${receivedQty}` : `ยืนยันรับ ${itemId} จำนวน ${receivedQty}`,
    });
    return NextResponse.json({ ok: true });
  } catch (e) {
    return fail(e, "confirmRestockReceipt failed");
  }
}

// DELETE /api/confirm-receipt { branch, date, itemId } — ยกเลิกยืนยันรับ (พลาดติ๊ก) กลับไปเป็น "ยังไม่ยืนยัน"
export async function DELETE(req: Request) {
  try {
    const s = await requireSession();
    const lang = s.lang ?? "th";
    const body = (await req.json()) as { branch?: string; date?: string; itemId?: string };
    const branch = resolveBranch(s, parseBranch(body.branch ?? null));
    const date = body.date;
    const itemId = body.itemId;
    if (!date) return NextResponse.json({ error: t(lang, "confirmReceipt.errDateRequired") }, { status: 400 });
    if (!itemId) return NextResponse.json({ error: t(lang, "confirmReceipt.errItemIdRequired") }, { status: 400 });

    await db.unconfirmRestockReceipt(branch, date, itemId);
    await writeAudit(s, "unconfirm_restock_receipt", { branch, date, entity: itemId, detail: `ยกเลิกยืนยันรับ ${itemId}` });
    return NextResponse.json({ ok: true });
  } catch (e) {
    return fail(e, "unconfirmRestockReceipt failed");
  }
}
