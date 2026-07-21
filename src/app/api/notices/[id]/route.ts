import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireAdmin, authErrorResponse } from "@/lib/authz";

export const dynamic = "force-dynamic";

// DELETE /api/notices/:id — ปิดประกาศ (admin เท่านั้น)
export async function DELETE(_req: Request, { params }: { params: { id: string } }) {
  try {
    await requireAdmin();
    await db.deleteNotice(params.id);
    return NextResponse.json({ ok: true });
  } catch (e) {
    const a = authErrorResponse(e);
    if (a) return NextResponse.json(a.body, { status: a.status });
    return NextResponse.json({ error: (e as any)?.message ?? "deleteNotice failed" }, { status: 500 });
  }
}
