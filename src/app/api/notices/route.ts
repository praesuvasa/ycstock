import { NextResponse } from "next/server";
import { db, parseBranch } from "@/lib/db";
import { requireSession, requireAdmin, authErrorResponse } from "@/lib/authz";

export const dynamic = "force-dynamic";

function fail(e: unknown, msg: string) {
  const a = authErrorResponse(e);
  if (a) return NextResponse.json(a.body, { status: a.status });
  return NextResponse.json({ error: (e as any)?.message ?? msg }, { status: 500 });
}

// GET /api/notices?branch=NVP → ประกาศที่ยังใช้งานอยู่ของสาขานั้น (รวมประกาศ "ทุกสาขา") — ทุก role อ่านได้
// GET /api/notices (ไม่ระบุ branch) → ทั้งหมด สำหรับหน้าจัดการ (admin เท่านั้น)
export async function GET(req: Request) {
  try {
    await requireSession();
    const { searchParams } = new URL(req.url);
    const branch = parseBranch(searchParams.get("branch"));
    if (branch) return NextResponse.json({ rows: await db.listActiveNotices(branch) });
    await requireAdmin();
    return NextResponse.json({ rows: await db.listAllNotices() });
  } catch (e) {
    return fail(e, "getNotices failed");
  }
}

// POST /api/notices { branch: Branch|null, message } — admin เท่านั้น
export async function POST(req: Request) {
  try {
    const s = await requireAdmin();
    const body = (await req.json()) as { branch?: string | null; message?: string };
    const message = (body.message ?? "").trim();
    if (!message) return NextResponse.json({ error: "ต้องระบุข้อความ" }, { status: 400 });
    const branch = body.branch ? parseBranch(body.branch) : null;
    if (body.branch && !branch) return NextResponse.json({ error: "สาขาไม่ถูกต้อง" }, { status: 400 });
    const notice = await db.createNotice({ branch, message }, s.name);
    return NextResponse.json({ ok: true, notice });
  } catch (e) {
    return fail(e, "createNotice failed");
  }
}
