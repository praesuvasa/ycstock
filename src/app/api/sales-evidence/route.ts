import { NextResponse } from "next/server";
import { db, parseBranch } from "@/lib/db";
import { requireSession, resolveBranch, assertCanEditDate, authErrorResponse } from "@/lib/authz";
import { readEvidenceImage, computeMatchStatus, describeMismatch } from "@/lib/ocr";
import type { EvidenceType, MatchStatus } from "@/lib/types";

export const dynamic = "force-dynamic";

const isDate = (v: string | null): v is string => !!v && /^\d{4}-\d{2}-\d{2}$/.test(v);
const TYPES: EvidenceType[] = ["qr", "grab", "lineman"];
const TYPE_LABEL: Record<EvidenceType, string> = { qr: "QR", grab: "Grab", lineman: "Lineman" };
const EXT: Record<string, string> = { "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp" };

function fail(e: unknown, msg: string) {
  const a = authErrorResponse(e);
  if (a) return NextResponse.json(a.body, { status: a.status });
  return NextResponse.json({ error: (e as any)?.message ?? msg }, { status: 500 });
}

// GET /api/sales-evidence?branch=NVP&date=YYYY-MM-DD → { rows: SalesEvidence[] } (พร้อม imageUrl signed)
export async function GET(req: Request) {
  try {
    const s = await requireSession();
    const { searchParams } = new URL(req.url);
    const branch = resolveBranch(s, parseBranch(searchParams.get("branch")));
    const date = searchParams.get("date");
    if (!isDate(date)) return NextResponse.json({ error: "date ไม่ถูกต้อง (YYYY-MM-DD)" }, { status: 400 });

    const rows = await db.listSalesEvidence(branch, date);
    const withUrls = await Promise.all(rows.map(async (r) => ({ ...r, imageUrl: (await db.getEvidenceSignedUrl(r.imagePath)) ?? undefined })));
    return NextResponse.json({ rows: withUrls });
  } catch (e) {
    return fail(e, "getSalesEvidence failed");
  }
}

// POST /api/sales-evidence { branch, date, type, imageBase64, mediaType } → { ok, evidence }
export async function POST(req: Request) {
  try {
    const s = await requireSession();
    const body = (await req.json()) as { branch?: string; date?: string; type?: string; imageBase64?: string; mediaType?: string; enteredAmount?: number };
    const branch = resolveBranch(s, parseBranch(body.branch ?? null));
    const date = body.date ?? null;
    if (!isDate(date)) return NextResponse.json({ error: "date ไม่ถูกต้อง (YYYY-MM-DD)" }, { status: 400 });
    assertCanEditDate(s, date);
    const type = body.type as EvidenceType;
    if (!TYPES.includes(type)) return NextResponse.json({ error: `type ไม่ถูกต้อง (${TYPES.join("|")})` }, { status: 400 });
    const mediaType = body.mediaType ?? "";
    if (!EXT[mediaType]) return NextResponse.json({ error: "รองรับเฉพาะ JPEG/PNG/WebP" }, { status: 400 });
    if (!body.imageBase64) return NextResponse.json({ error: "ไม่มีรูปแนบ" }, { status: 400 });
    const enteredAmount = Number.isFinite(Number(body.enteredAmount)) ? Number(body.enteredAmount) : 0;

    const bytes = Buffer.from(body.imageBase64, "base64");
    const path = `${branch}/${date}/${type}.${EXT[mediaType]}`;
    await db.uploadEvidenceImage(path, bytes, mediaType);

    let ocrAmount: number | null = null;
    let ocrNameMatch: boolean | null = null;
    let matchStatus: MatchStatus = "pending";
    let ocrTxnRef: string | null = null;
    let ocrTxnTime: string | null = null;
    let duplicateNote: string | null = null;
    let mismatchNote: string | null = null;
    try {
      const ocr = await readEvidenceImage(body.imageBase64, mediaType, type);
      ocrAmount = ocr.amount;
      ocrNameMatch = ocr.nameMatch;
      ocrTxnRef = ocr.txnRef;
      ocrTxnTime = ocr.txnTime;
      matchStatus = computeMatchStatus(enteredAmount, ocr, type === "qr");
      if (matchStatus === "mismatch") mismatchNote = describeMismatch(enteredAmount, ocr, type === "qr");
      if (ocrTxnRef) {
        const dup = await db.findDuplicateEvidence(ocrTxnRef, branch, date, type);
        if (dup) {
          matchStatus = "duplicate";
          duplicateNote = `ซ้ำกับหลักฐาน ${TYPE_LABEL[dup.type]} สาขา ${dup.branch} วันที่ ${dup.date}`;
        }
      }
    } catch (ocrErr: any) {
      console.error("[sales-evidence] OCR failed:", ocrErr?.message ?? ocrErr);
      matchStatus = "unclear";
    }

    const evidence = await db.upsertSalesEvidence({
      branch, date, type, imagePath: path, enteredAmount, ocrAmount, ocrNameMatch, matchStatus,
      ocrTxnRef, ocrTxnTime, duplicateNote, mismatchNote, userId: s.userId, userName: s.name,
    });
    const imageUrl = await db.getEvidenceSignedUrl(path);
    return NextResponse.json({ ok: true, evidence: { ...evidence, imageUrl: imageUrl ?? undefined } });
  } catch (e) {
    return fail(e, "uploadSalesEvidence failed");
  }
}
