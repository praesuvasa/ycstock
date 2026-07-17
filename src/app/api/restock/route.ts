import { NextRequest, NextResponse } from "next/server";
import { db, parseBranch } from "@/lib/db";
import { requireAdminOrRestock, authErrorResponse } from "@/lib/authz";
import { BRANCHES } from "@/lib/types";

export const dynamic = "force-dynamic";

// GET /api/restock?branch=NVP&day=wed → { rows: RestockRow[], specialActive: boolean }
export async function GET(req: NextRequest) {
  try {
    await requireAdminOrRestock();
    const { searchParams } = new URL(req.url);
    const branch = parseBranch(searchParams.get("branch"));
    if (!branch) {
      return NextResponse.json({ error: `branch ต้องเป็น ${BRANCHES.join(" หรือ ")}` }, { status: 400 });
    }
    const day = searchParams.get("day");
    if (day !== "wed" && day !== "sat") {
      return NextResponse.json({ error: "day ต้องเป็น wed หรือ sat" }, { status: 400 });
    }

    const { rows, specialActive } = await db.getRestock(branch, day);
    return NextResponse.json({ rows, specialActive });
  } catch (e: any) {
    const a = authErrorResponse(e);
    return NextResponse.json(a ? a.body : { error: e?.message ?? "restock failed" }, { status: a ? a.status : 500 });
  }
}
