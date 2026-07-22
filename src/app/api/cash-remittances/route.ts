import { NextResponse } from "next/server";
import { db, parseBranch } from "@/lib/db";
import { requireSession, resolveBranch, authErrorResponse } from "@/lib/authz";
import { readEvidenceImage, computeMatchStatus } from "@/lib/ocr";

export const dynamic = "force-dynamic";

const isDate = (v: unknown): v is string => typeof v === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v);
const EXT: Record<string, string> = { "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp" };

function fail(e: unknown, msg: string) {
  const a = authErrorResponse(e);
  if (a) return NextResponse.json(a.body, { status: a.status });
  return NextResponse.json({ error: (e as any)?.message ?? msg }, { status: 500 });
}

// GET /api/cash-remittances?branch=NVP → { rows } ประวัติการโอนเงินสด
export async function GET(req: Request) {
  try {
    const s = await requireSession();
    const { searchParams } = new URL(req.url);
    const branch = resolveBranch(s, parseBranch(searchParams.get("branch")));
    const rows = await db.listCashRemittances(branch);
    const withUrls = await Promise.all(rows.map(async (r) => ({ ...r, imageUrl: (await db.getEvidenceSignedUrl(r.imagePath)) ?? undefined })));
    return NextResponse.json({ rows: withUrls });
  } catch (e) {
    return fail(e, "listCashRemittances failed");
  }
}

// POST /api/cash-remittances { branch, transferredAt, dates: string[], imageBase64, mediaType } → { ok, remittance }
export async function POST(req: Request) {
  try {
    const s = await requireSession();
    const body = (await req.json()) as {
      branch?: string; transferredAt?: string; dates?: string[]; imageBase64?: string; mediaType?: string;
    };
    const branch = resolveBranch(s, parseBranch(body.branch ?? null));
    if (!isDate(body.transferredAt)) return NextResponse.json({ error: "transferredAt ไม่ถูกต้อง (YYYY-MM-DD)" }, { status: 400 });
    const dates = Array.isArray(body.dates) ? body.dates.filter(isDate) : [];
    if (dates.length === 0) return NextResponse.json({ error: "ต้องเลือกอย่างน้อย 1 วัน" }, { status: 400 });
    const mediaType = body.mediaType ?? "";
    if (!EXT[mediaType]) return NextResponse.json({ error: "รองรับเฉพาะ JPEG/PNG/WebP" }, { status: 400 });
    if (!body.imageBase64) return NextResponse.json({ error: "ไม่มีรูปแนบ" }, { status: 400 });

    // กันเลือกวันที่ถูกโอนไปแล้ว (race) — เช็คซ้ำจาก pending list ปัจจุบัน
    const pending = await db.listUnremittedCashDays(branch);
    const pendingSet = new Set(pending.map((p) => p.date));
    const invalid = dates.filter((d) => !pendingSet.has(d));
    if (invalid.length > 0) return NextResponse.json({ error: `วันที่ ${invalid.join(", ")} ถูกโอนไปแล้วหรือไม่มียอด` }, { status: 409 });
    const declaredAmount = dates.reduce((sum, d) => sum + (pending.find((p) => p.date === d)?.cash ?? 0), 0);

    const bytes = Buffer.from(body.imageBase64, "base64");
    const path = `${branch}/cash-remit/${body.transferredAt}-${Date.now()}.${EXT[mediaType]}`;
    await db.uploadEvidenceImage(path, bytes, mediaType);

    let ocrAmount: number | null = null;
    let ocrNameMatch: boolean | null = null;
    let matchStatus: "ok" | "mismatch" | "unclear" | "pending" = "pending";
    try {
      const ocr = await readEvidenceImage(body.imageBase64, mediaType, "cash");
      ocrAmount = ocr.amount;
      ocrNameMatch = ocr.nameMatch;
      matchStatus = computeMatchStatus(declaredAmount, ocr, true);
    } catch {
      matchStatus = "unclear";
    }

    const remittance = await db.createCashRemittance({
      branch, transferredAt: body.transferredAt, dates, declaredAmount, imagePath: path,
      ocrAmount, ocrNameMatch, matchStatus, userId: s.userId, userName: s.name,
    });
    const imageUrl = await db.getEvidenceSignedUrl(path);
    return NextResponse.json({ ok: true, remittance: { ...remittance, imageUrl: imageUrl ?? undefined } });
  } catch (e) {
    return fail(e, "createCashRemittance failed");
  }
}
