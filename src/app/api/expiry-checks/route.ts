import { NextResponse } from "next/server";
import { db, parseBranch } from "@/lib/db";
import type { ExpiryCheckRow, ExpiryDisposition } from "@/lib/types";
import { requireSession, resolveBranch, assertCanEditDate, authErrorResponse } from "@/lib/authz";
import { writeAudit } from "@/lib/audit";
import { t } from "@/lib/i18n";

export const dynamic = "force-dynamic";

const isDate = (v: string | null | undefined): v is string => !!v && /^\d{4}-\d{2}-\d{2}$/.test(v);
const VALID_DISPOSITION = new Set(["sell_front", "return", "convert"]);

function fail(e: unknown, msg: string) {
  const a = authErrorResponse(e);
  return NextResponse.json(a ? a.body : { error: (e as any)?.message ?? msg }, { status: a ? a.status : 500 });
}

// GET /api/expiry-checks?branch=NVP&date=2026-07-28 → { rows }
export async function GET(req: Request) {
  try {
    const s = await requireSession();
    const lang = s.lang ?? "th";
    const { searchParams } = new URL(req.url);
    const branch = resolveBranch(s, parseBranch(searchParams.get("branch")));
    const date = searchParams.get("date");
    if (!isDate(date)) return NextResponse.json({ error: t(lang, "expiry.errInvalidDate") }, { status: 400 });
    const rows = await db.getExpiryChecks(branch, date);
    return NextResponse.json({ rows, branch });
  } catch (e) {
    return fail(e, "getExpiryChecks failed");
  }
}

// POST /api/expiry-checks { branch, date, rows } → { ok, count }
//
// บันทึกทับทั้งรอบตรวจ · ชุดที่เลือกปลายทางไว้จะถูกเขียนลง used/returned ในหน้าสต็อกให้เอง
// (ฝั่ง store ทำแบบ idempotent — บันทึกซ้ำไม่บวกทบ และไม่ทับยอดที่พนักงานกรอกเอง)
export async function POST(req: Request) {
  try {
    const s = await requireSession();
    const lang = s.lang ?? "th";
    const body = await req.json();
    const branch = resolveBranch(s, parseBranch(body?.branch ?? null));
    const date = body?.date ?? null;
    if (!isDate(date)) return NextResponse.json({ error: t(lang, "expiry.errInvalidDate") }, { status: 400 });
    assertCanEditDate(s, date); // user ≤ 3 วัน · admin ไม่จำกัด

    const num = (v: any) => (Number.isFinite(Number(v)) ? Number(v) : 0);
    // ตัดแถวที่ยังไม่ได้กรอกวันหมดอายุ หรือจำนวนเป็น 0 ทิ้ง (แถวเปล่าที่กดเพิ่มค้างไว้)
    const rows: ExpiryCheckRow[] = (Array.isArray(body?.rows) ? body.rows : [])
      .filter((r: any) => typeof r?.itemId === "string" && isDate(r?.expiryDate) && num(r?.qty) > 0)
      .map((r: any) => ({
        itemId: r.itemId,
        expiryDate: r.expiryDate,
        qty: num(r.qty),
        disposition: VALID_DISPOSITION.has(r?.disposition) ? (r.disposition as ExpiryDisposition) : null,
        note: String(r?.note ?? "").trim(),
      }));

    await db.saveExpiryChecks(branch, date, rows, s.userId, s.name);
    const returned = rows.filter((r) => r.disposition === "return").length;
    const sellFront = rows.filter((r) => r.disposition === "sell_front").length;
    await writeAudit(s, "save_expiry_check", {
      branch, date, detail: `ตรวจวันหมดอายุ ${rows.length} ชุด · ส่งคืน ${returned} · แกะขายหน้าร้าน ${sellFront}`,
    });
    return NextResponse.json({ ok: true, count: rows.length });
  } catch (e) {
    return fail(e, "saveExpiryChecks failed");
  }
}
