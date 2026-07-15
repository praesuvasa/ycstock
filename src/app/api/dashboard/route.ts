import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { todayISO } from "@/lib/fmt";
import { requireAdmin, authErrorResponse } from "@/lib/authz";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  try {
    await requireAdmin();
    const { searchParams } = new URL(req.url);
    const date = searchParams.get("date") || todayISO();
    const data = await db.getDashboard(date);
    return NextResponse.json(data);
  } catch (e: any) {
    const a = authErrorResponse(e);
    if (a) return NextResponse.json(a.body, { status: a.status });
    return NextResponse.json({ error: e?.message ?? "dashboard failed" }, { status: 500 });
  }
}
