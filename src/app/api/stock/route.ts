import { NextResponse } from "next/server";
import { db, parseBranch } from "@/lib/db";
import type { StockRow, CupSize } from "@/lib/types";
import { requireSession, resolveBranch, assertCanEditDate, authErrorResponse } from "@/lib/authz";
import { writeAudit } from "@/lib/audit";
import { t } from "@/lib/i18n";

export const dynamic = "force-dynamic";

function fail(e: unknown, msg: string) {
  const a = authErrorResponse(e);
  if (a) return NextResponse.json(a.body, { status: a.status });
  return NextResponse.json({ error: (e as any)?.message ?? msg }, { status: 500 });
}

export async function GET(req: Request) {
  try {
    const s = await requireSession();
    const lang = s.lang ?? "th";
    const { searchParams } = new URL(req.url);
    const branch = resolveBranch(s, parseBranch(searchParams.get("branch")));
    const date = searchParams.get("date");
    if (!date) return NextResponse.json({ error: t(lang, "stock.errDateRequired") }, { status: 400 });
    const rows = await db.getStock(branch, date);
    // savedAt = ลายเซ็นเวลาของข้อมูลชุดที่ส่งไป · หน้าจอต้องส่งกลับมาตอนบันทึก เพื่อให้เช็คได้ว่ามีคนแทรกไหม
    const { savedAt, savedBy } = await db.getStockSavedAt(branch, date);
    const ownCups = await db.getOwnCups(branch, date);
    return NextResponse.json({ rows, branch, savedAt, savedBy, ownCups });
  } catch (e) {
    return fail(e, "getStock failed");
  }
}

export async function POST(req: Request) {
  try {
    const s = await requireSession();
    const lang = s.lang ?? "th";
    const body = (await req.json()) as {
      branch?: string; date?: string; rows?: StockRow[]; baseSavedAt?: string | null; force?: boolean;
      ownCups?: { size: CupSize; ownCup: number }[];
    };
    const branch = resolveBranch(s, parseBranch(body.branch ?? null));
    const date = body.date;
    if (!date) return NextResponse.json({ error: t(lang, "stock.errDateRequired") }, { status: 400 });
    assertCanEditDate(s, date); // user ≤ 3 วัน · admin ไม่จำกัด
    if (!Array.isArray(body.rows)) return NextResponse.json({ error: t(lang, "stock.errRowsRequired") }, { status: 400 });

    // กันบันทึกทับกัน (v1.14) — ถ้ามีคนบันทึกแทรกหลังจากที่หน้าจอนี้โหลดข้อมูลไป ให้หยุดไว้ก่อน
    // ไม่ปฏิเสธถาวร แค่ให้คนกดรู้ตัวแล้วเลือกเอง (โหลดใหม่ หรือยืนยันทับ) — เงียบ ๆ ทับคือสิ่งที่แย่ที่สุด
    //
    // ข้อจำกัดที่ยอมรับ: ยังมีช่องว่างเสี้ยววินาทีระหว่างเช็คกับเขียน ถ้าสองคนกดพร้อมกันเป๊ะ ๆ ก็ยังทับได้
    // แต่เคสจริงคือ "เปิดค้างไว้คนละชั่วโมงแล้วต่างคนต่างกด" ซึ่งอันนี้จับได้หมด
    const current = await db.getStockSavedAt(branch, date);
    if (!body.force && body.baseSavedAt !== undefined && current.savedAt) {
      const base = body.baseSavedAt ? Date.parse(body.baseSavedAt) : 0;
      if (Date.parse(current.savedAt) > base) {
        return NextResponse.json({
          conflict: true,
          savedAt: current.savedAt,
          savedBy: current.savedBy,
          error: t(lang, "stock.errConflictAfterOpen", { who: current.savedBy ?? t(lang, "stock.conflictOtherPerson") }),
        }, { status: 409 });
      }
    }

    // ลูกค้าเอาแก้วมาเอง — พนักงานกรอกในหมวดถ้วยที่หน้าสต็อก บันทึกไปพร้อมกันเลย
    // (คนละตารางกับ stock_daily แต่เป็นข้อมูลของ "วันเดียวกัน" ที่กรอกในจังหวะเดียวกัน)
    if (Array.isArray(body.ownCups) && body.ownCups.length > 0) {
      await db.saveOwnCups(branch, date, body.ownCups);
    }

    const result = await db.saveStock(branch, date, body.rows, s.name, s.role === "admin");
    await writeAudit(s, "save_stock", {
      branch, date,
      detail: `บันทึกสต็อก ${body.rows.length} รายการ${body.force ? " · ยืนยันทับงานของ " + (current.savedBy ?? "คนอื่น") : ""}`,
    });
    const after = await db.getStockSavedAt(branch, date);
    return NextResponse.json({ ...result, savedAt: after.savedAt, savedBy: after.savedBy });
  } catch (e) {
    return fail(e, "saveStock failed");
  }
}
