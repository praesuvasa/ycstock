import { NextResponse } from "next/server";
import { requireSession, authErrorResponse } from "@/lib/authz";
import { readStaffBillImage } from "@/lib/ocr";

export const dynamic = "force-dynamic";

const ALLOWED_MEDIA = new Set(["image/jpeg", "image/png", "image/webp"]);

// POST /api/allowance/read-bill { imageBase64, mediaType } → { reading } | { error }
//
// อ่านอย่างเดียว ไม่บันทึกอะไร — ผลที่ได้ไปเติมในฟอร์มให้พนักงานตรวจก่อนกดบันทึกเสมอ
// OCR พังไม่ควรทำให้บันทึกไม่ได้ จึงคืน 200 พร้อม error message ให้หน้าจอ fallback เป็นกรอกเอง
export async function POST(req: Request) {
  try {
    await requireSession();
    const body = await req.json();
    const mediaType = body?.mediaType ?? "";
    if (!ALLOWED_MEDIA.has(mediaType)) return NextResponse.json({ error: "รองรับเฉพาะ JPEG/PNG/WebP" }, { status: 400 });
    if (!body?.imageBase64) return NextResponse.json({ error: "ไม่มีรูปแนบ" }, { status: 400 });

    try {
      const reading = await readStaffBillImage(body.imageBase64, mediaType);
      return NextResponse.json({ reading });
    } catch (ocrErr: any) {
      return NextResponse.json({ error: ocrErr?.message ?? "อ่านบิลไม่สำเร็จ" });
    }
  } catch (e) {
    const a = authErrorResponse(e);
    return NextResponse.json(a ? a.body : { error: (e as any)?.message ?? "readBill failed" }, { status: a ? a.status : 500 });
  }
}
