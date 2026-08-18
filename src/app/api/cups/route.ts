import { NextRequest, NextResponse } from "next/server";
import { db, parseBranch } from "@/lib/db";
import { cupReconcile } from "@/lib/calc";
import type { CupRow, CupSize } from "@/lib/types";
import { BRANCHES } from "@/lib/types";
import { requireAdmin, authErrorResponse } from "@/lib/authz";
import { writeAudit } from "@/lib/audit";
import { t } from "@/lib/i18n";

export const dynamic = "force-dynamic";

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;
const SIZES: CupSize[] = ["P", "S", "BOWL", "14OZ"];
const cupFail = (e: unknown, msg: string) => {
  const a = authErrorResponse(e);
  return NextResponse.json(a ? a.body : { error: (e as any)?.message ?? msg }, { status: a ? a.status : 500 });
};

// GET /api/cups?branch=NVP&date=2026-07-15 → { rows: CupRow[], summary }
export async function GET(req: NextRequest) {
  try {
    const s = await requireAdmin();
    const lang = s.lang ?? "th";
    const { searchParams } = new URL(req.url);
    const branch = parseBranch(searchParams.get("branch"));
    if (!branch) {
      return NextResponse.json({ error: t(lang, "cups.api.branchRequired", { list: BRANCHES.join(lang === "en" ? " or " : " หรือ ") }) }, { status: 400 });
    }
    const date = searchParams.get("date");
    if (!date || !ISO_DATE.test(date)) {
      return NextResponse.json({ error: t(lang, "cups.api.dateFormat") }, { status: 400 });
    }

    const rows = await db.getCups(branch, date);
    const summary = cupReconcile(rows);
    return NextResponse.json({ rows, summary });
  } catch (e: any) {
    return cupFail(e, "cups failed");
  }
}

// POST /api/cups { branch, date, rows: CupRow[] } → { ok }
export async function POST(req: NextRequest) {
  try {
    const s = await requireAdmin();
    const lang = s.lang ?? "th";
    const body = await req.json().catch(() => null);
    if (!body || typeof body !== "object") {
      return NextResponse.json({ error: t(lang, "cups.api.bodyInvalid") }, { status: 400 });
    }

    const branch = parseBranch(body.branch ?? null);
    if (!branch) {
      return NextResponse.json({ error: t(lang, "cups.api.branchRequired", { list: BRANCHES.join(lang === "en" ? " or " : " หรือ ") }) }, { status: 400 });
    }
    const date = body.date;
    if (typeof date !== "string" || !ISO_DATE.test(date)) {
      return NextResponse.json({ error: t(lang, "cups.api.dateFormat") }, { status: 400 });
    }
    if (!Array.isArray(body.rows)) {
      return NextResponse.json({ error: t(lang, "cups.api.rowsMustBeArray") }, { status: 400 });
    }

    const num = (v: unknown): number => {
      const x = typeof v === "number" ? v : parseFloat(String(v ?? ""));
      return Number.isFinite(x) ? x : 0;
    };
    const rows: CupRow[] = body.rows.map((r: any): CupRow => {
      if (!r || !SIZES.includes(r.size)) {
        throw new Error(t(lang, "cups.api.sizeInvalid"));
      }
      return {
        size: r.size,
        start: num(r.start),
        in: num(r.in),
        remain: num(r.remain),
        sold: num(r.sold),
      };
    });

    const res = await db.saveCups(branch, date, rows);
    await writeAudit(s, "save_cups", { branch, date, detail: "บันทึก reconcile ถ้วย" });
    return NextResponse.json({ ...res });
  } catch (e: any) {
    return cupFail(e, "save cups failed");
  }
}
