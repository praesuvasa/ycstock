import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import type { Branch, StaffAllowanceUse } from "@/lib/types";
import { requireSession, authErrorResponse } from "@/lib/authz";
import { monthKeyOf, ALLOWANCE_DEFAULT_MONTHLY } from "@/lib/calc";
import { todayISO } from "@/lib/fmt";
import { writeAudit } from "@/lib/audit";
import { t } from "@/lib/i18n";

export const dynamic = "force-dynamic";

const isDate = (v: unknown): v is string => typeof v === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v);
const isMonth = (v: unknown): v is string => typeof v === "string" && /^\d{4}-\d{2}$/.test(v);
const EXT: Record<string, string> = { "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp" };
const num = (v: unknown) => (Number.isFinite(Number(v)) ? Number(v) : 0);

function fail(e: unknown, msg: string) {
  const a = authErrorResponse(e);
  return NextResponse.json(a ? a.body : { error: (e as any)?.message ?? msg }, { status: a ? a.status : 500 });
}

// สิทธิ์ของ "คนที่ล็อกอินอยู่" เท่านั้น — ไม่รับ userId จาก client เพื่อกันดู/บันทึกแทนคนอื่น
async function myAllowance(userId: string, month: string) {
  const me = (await db.listUsers()).find((u) => u.id === userId);
  const monthly = Number(me?.allowanceMonthly ?? ALLOWANCE_DEFAULT_MONTHLY);
  const uses = await db.listAllowanceUses(userId, month);
  const used = uses.reduce((sum, r) => sum + Number(r.discountAmount), 0);
  return { enabled: !!me?.allowanceEnabled, monthly, used, remaining: Math.max(monthly - used, 0), uses };
}

// GET /api/allowance?month=YYYY-MM → { enabled, monthly, used, remaining, uses }
export async function GET(req: Request) {
  try {
    const s = await requireSession();
    const lang = s.lang ?? "th";
    const { searchParams } = new URL(req.url);
    const month = searchParams.get("month") ?? monthKeyOf(todayISO());
    if (!isMonth(month)) return NextResponse.json({ error: t(lang, "allowance.errors.invalidMonth") }, { status: 400 });
    return NextResponse.json({ month, ...(await myAllowance(s.userId, month)) });
  } catch (e) {
    return fail(e, "getAllowance failed");
  }
}

// POST /api/allowance { useDate, billTotal, discountAmount, paidAmount, note, imageBase64?, mediaType? }
//
// ยอดที่ตัดสิทธิ์คือ discountAmount (ส่วนลดบนบิล) ไม่ใช่ยอดที่จ่ายจริง
// ไม่บล็อกเมื่อส่วนลดเกินสิทธิ์ที่เหลือ — ของออกจากร้านไปแล้ว ปฏิเสธการบันทึก = ซ่อนปัญหา
// แต่ตั้ง needsReview ให้แอดมินเห็นแทน
export async function POST(req: Request) {
  try {
    const s = await requireSession();
    const lang = s.lang ?? "th";
    const body = await req.json();
    const useDate = body?.useDate;
    if (!isDate(useDate)) return NextResponse.json({ error: t(lang, "allowance.errors.invalidDate") }, { status: 400 });

    const month = monthKeyOf(useDate);
    const mine = await myAllowance(s.userId, month);
    if (!mine.enabled) return NextResponse.json({ error: t(lang, "allowance.notEnabled") }, { status: 403 });

    const billTotal = num(body?.billTotal);
    const discountAmount = num(body?.discountAmount);
    const paidAmount = num(body?.paidAmount);
    if (discountAmount <= 0) return NextResponse.json({ error: t(lang, "allowance.errors.discountMustBePositive") }, { status: 400 });

    // เหตุผลที่ต้องให้แอดมินตรวจ — เก็บทุกข้อที่เข้าเงื่อนไข ไม่ใช่เจอข้อแรกแล้วหยุด
    const reasons: string[] = [];
    if (discountAmount > mine.remaining) {
      reasons.push(`ส่วนลด ${discountAmount} เกินสิทธิ์ที่เหลือ ${mine.remaining}`);
    }
    if (billTotal > 0 && Math.abs(billTotal - discountAmount - paidAmount) > 0.5) {
      reasons.push(`ยอดไม่สัมพันธ์กัน (${billTotal} − ${discountAmount} ≠ ${paidAmount})`);
    }
    // OCR อ่านได้ยอดหนึ่ง แต่พนักงานแก้เป็นอีกยอด — อาจเป็นการแก้ที่ถูกต้อง (รูปไม่ชัด)
    // หรือเป็นการพิมพ์ทับให้ตัวเองได้เยอะขึ้น แยกกันเองไม่ได้ → ให้แอดมินดู
    const ocrDiscount = body?.ocrDiscount == null ? null : num(body.ocrDiscount);
    if (ocrDiscount != null && Math.abs(ocrDiscount - discountAmount) > 1) {
      reasons.push(`ยอดที่กรอก ${discountAmount} ต่างจากที่อ่านได้จากรูป ${ocrDiscount}`);
    }

    // รูปบิลเป็นตัวเลือก — เฟส 1 กรอกยอดเอง รูปเก็บไว้เป็นหลักฐานให้แอดมินย้อนดู
    let imagePath: string | null = null;
    const mediaType = body?.mediaType ?? "";
    if (body?.imageBase64 && EXT[mediaType]) {
      imagePath = `allowance/${s.userId}/${useDate}-${Date.now()}.${EXT[mediaType]}`;
      await db.uploadEvidenceImage(imagePath, Buffer.from(body.imageBase64, "base64"), mediaType);
    }

    const row: StaffAllowanceUse = {
      userId: s.userId,
      userName: s.name,
      branch: s.branchScope === "all" ? null : (s.branchScope as Branch),
      useDate, billTotal, discountAmount, paidAmount, imagePath, ocrDiscount,
      needsReview: reasons.length > 0,
      reviewNote: reasons.join(" · "),
      note: String(body?.note ?? "").trim(),
    };
    await db.addAllowanceUse(row);
    await writeAudit(s, "use_staff_allowance", {
      branch: row.branch, date: useDate,
      detail: `ใช้สิทธิ์ ${discountAmount} บาท (บิล ${billTotal} จ่ายเอง ${paidAmount})${reasons.length ? " · รอตรวจ: " + reasons.join(" · ") : ""}`,
    });

    return NextResponse.json({ ok: true, needsReview: row.needsReview, reviewNote: row.reviewNote });
  } catch (e) {
    return fail(e, "addAllowanceUse failed");
  }
}
