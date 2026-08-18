import { NextResponse } from "next/server";
import { db, parseBranch } from "@/lib/db";
import { requireSession, resolveBranch, assertCanEditDate, authErrorResponse } from "@/lib/authz";
import { readPosReportImage, checkPosReport } from "@/lib/ocr";
import type { PosReportReading } from "@/lib/ocr";
import type { MatchStatus } from "@/lib/types";
import { t } from "@/lib/i18n";

export const dynamic = "force-dynamic";

const isDate = (v: string | null | undefined): v is string => !!v && /^\d{4}-\d{2}-\d{2}$/.test(v);
const EXT: Record<string, string> = { "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp" };

function fail(e: unknown, msg: string) {
  const a = authErrorResponse(e);
  if (a) return NextResponse.json(a.body, { status: a.status });
  return NextResponse.json({ error: (e as any)?.message ?? msg }, { status: 500 });
}

// POST /api/sales/pos-report { branch, date, imageBase64, mediaType, enteredTotal, enteredCash }
//   → { ok, evidence, reading, status, note }
//
// แทนช่องพิมพ์ "ยอดขายรวมตาม POS" ด้วยการถ่ายรูปหน้ารายงานของ POS มาแนบ (แพรสั่ง 2026-07-29)
// เหตุผล: พนักงานสับสนว่าเลขที่ต้องกรอกมาจากไหน (POS หรือแอปธนาคาร) — ถ่ายรูปแล้วให้ระบบอ่านเอง ไม่มีทางกรอกผิด
export async function POST(req: Request) {
  try {
    const s = await requireSession();
    const lang = s.lang ?? "th";
    const body = (await req.json()) as {
      branch?: string; date?: string; imageBase64?: string; mediaType?: string;
      enteredTotal?: number; enteredCash?: number;
    };
    const branch = resolveBranch(s, parseBranch(body.branch ?? null));
    const date = body.date;
    if (!isDate(date)) return NextResponse.json({ error: t(lang, "sales.errInvalidDate") }, { status: 400 });
    assertCanEditDate(s, date);
    const mediaType = body.mediaType ?? "";
    if (!EXT[mediaType]) return NextResponse.json({ error: t(lang, "sales.errUnsupportedImageType") }, { status: 400 });
    if (!body.imageBase64) return NextResponse.json({ error: t(lang, "sales.errNoImageAttached") }, { status: 400 });

    const enteredTotal = Number(body.enteredTotal) || 0;
    const enteredCash = Number(body.enteredCash) || 0;

    const bytes = Buffer.from(body.imageBase64, "base64");
    const path = `${branch}/${date}/pos.${EXT[mediaType]}`;
    await db.uploadEvidenceImage(path, bytes, mediaType);

    let reading: PosReportReading | null = null;
    let status: MatchStatus = "unclear";
    let note: string | null = "อ่านรูปไม่สำเร็จ — ลองแนบใหม่อีกครั้ง";
    try {
      reading = await readPosReportImage(body.imageBase64, mediaType);
      const r = checkPosReport(reading, date, enteredTotal, enteredCash);
      status = r.status;
      note = r.note;
    } catch (ocrErr: any) {
      console.error("[pos-report] OCR failed:", ocrErr?.message ?? ocrErr);
    }

    const evidence = await db.upsertSalesEvidence({
      branch, date, type: "pos", imagePath: path,
      enteredAmount: enteredTotal,
      ocrAmount: reading?.total ?? null,
      ocrNameMatch: null,
      matchStatus: status,
      ocrTxnRef: null,
      // เก็บช่วงวันที่ที่อ่านได้ไว้ในช่องเวลาเอกสาร — ใช้ย้อนดูได้ว่ารูปที่แนบเป็นรายงานของวันไหน
      ocrTxnTime: reading?.dateFrom ?? null,
      duplicateNote: null,
      mismatchNote: status === "mismatch" || status === "unclear" ? note : null,
      userId: s.userId, userName: s.name,
    });
    const imageUrl = await db.getEvidenceSignedUrl(path);

    return NextResponse.json({
      ok: true,
      evidence: { ...evidence, imageUrl: imageUrl ?? undefined },
      reading, status, note,
    });
  } catch (e) {
    return fail(e, "uploadPosReport failed");
  }
}
