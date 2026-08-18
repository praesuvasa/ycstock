import { NextResponse } from "next/server";
import { requireSession, authErrorResponse } from "@/lib/authz";
import { readStaffBillImage } from "@/lib/ocr";
import { t } from "@/lib/i18n";

export const dynamic = "force-dynamic";

const ALLOWED_MEDIA = new Set(["image/jpeg", "image/png", "image/webp"]);

// POST /api/allowance/read-bill { imageBase64, mediaType } → { reading } | { error }
//
// อ่านอย่างเดียว ไม่บันทึกอะไร — ผลที่ได้ไปเติมในฟอร์มให้พนักงานตรวจก่อนกดบันทึกเสมอ
// OCR พังไม่ควรทำให้บันทึกไม่ได้ จึงคืน 200 พร้อม error message ให้หน้าจอ fallback เป็นกรอกเอง
export async function POST(req: Request) {
  try {
    const s = await requireSession();
    const lang = s.lang ?? "th";
    const body = await req.json();
    const mediaType = body?.mediaType ?? "";
    if (!ALLOWED_MEDIA.has(mediaType)) return NextResponse.json({ error: t(lang, "allowance.errors.unsupportedMediaType") }, { status: 400 });
    if (!body?.imageBase64) return NextResponse.json({ error: t(lang, "allowance.errors.noImageAttached") }, { status: 400 });

    try {
      const reading = await readStaffBillImage(body.imageBase64, mediaType);
      return NextResponse.json({ reading });
    } catch (ocrErr: any) {
      return NextResponse.json({ error: ocrErr?.message ?? t(lang, "allowance.errors.readBillFailed") });
    }
  } catch (e) {
    const a = authErrorResponse(e);
    return NextResponse.json(a ? a.body : { error: (e as any)?.message ?? "readBill failed" }, { status: a ? a.status : 500 });
  }
}
