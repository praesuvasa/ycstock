import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireSession, authErrorResponse } from "@/lib/authz";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    await requireSession();
    const meta = await db.getMeta();
    return NextResponse.json(meta);
  } catch (e: any) {
    const a = authErrorResponse(e);
    return NextResponse.json(a ? a.body : { error: e?.message ?? "meta failed" }, { status: a ? a.status : 500 });
  }
}
