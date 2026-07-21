import { NextRequest, NextResponse } from "next/server";
import { db, parseBranch } from "@/lib/db";
import { requireAdminOrRestock, authErrorResponse } from "@/lib/authz";
import { writeAudit } from "@/lib/audit";
import { BRANCHES } from "@/lib/types";
import type { RestockSelectionEntry } from "@/lib/types";

export const dynamic = "force-dynamic";

function fail(e: unknown, msg: string) {
  const a = authErrorResponse(e);
  if (a) return NextResponse.json(a.body, { status: a.status });
  return NextResponse.json({ error: (e as any)?.message ?? msg }, { status: 500 });
}

// GET /api/restock/selections?branch=NVP&date=2026-07-22 → { entries: Record<itemId, {selected,qty}> }
// ยังไม่เคย save (branch,date) นี้เลย → entries = {} (ไม่ error) — client fallback ไป default จาก need/PAR เอง
export async function GET(req: NextRequest) {
  try {
    await requireAdminOrRestock();
    const { searchParams } = new URL(req.url);
    const branch = parseBranch(searchParams.get("branch"));
    if (!branch) {
      return NextResponse.json({ error: `branch ต้องเป็น ${BRANCHES.join(" หรือ ")}` }, { status: 400 });
    }
    const date = searchParams.get("date");
    if (!date) return NextResponse.json({ error: "date จำเป็น" }, { status: 400 });

    const entries = await db.getRestockSelections(branch, date);
    return NextResponse.json({ entries });
  } catch (e) {
    return fail(e, "getRestockSelections failed");
  }
}

// POST /api/restock/selections { branch, date, entries } — upsert "ทุกตัว" รวม selected=false ด้วย
// เพื่อรักษาความหมาย "เคยตัดสินใจแล้วว่าไม่เอารายการนี้" ให้ต่างจาก "ยังไม่เคยแตะเลย"
export async function POST(req: NextRequest) {
  try {
    const s = await requireAdminOrRestock();
    const body = (await req.json()) as { branch?: string; date?: string; entries?: RestockSelectionEntry[] };
    const branch = parseBranch(body.branch ?? null);
    if (!branch) {
      return NextResponse.json({ error: `branch ต้องเป็น ${BRANCHES.join(" หรือ ")}` }, { status: 400 });
    }
    const date = body.date;
    if (!date) return NextResponse.json({ error: "date จำเป็น" }, { status: 400 });
    if (!Array.isArray(body.entries)) return NextResponse.json({ error: "entries จำเป็น" }, { status: 400 });

    const result = await db.saveRestockSelections(branch, date, body.entries, s.userId, s.name);
    const selectedCount = body.entries.filter((e) => e.selected).length;
    await writeAudit(s, "save_restock_selection", {
      branch, date, detail: `บันทึกตัวเลือกเติมของ ${body.entries.length} รายการ (เลือก ${selectedCount})`,
    });
    return NextResponse.json(result);
  } catch (e) {
    return fail(e, "saveRestockSelections failed");
  }
}
