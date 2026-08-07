import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireSession, authErrorResponse } from "@/lib/authz";
import { visibleBranches } from "@/lib/types";

export const dynamic = "force-dynamic";

// NCD เห็นเฉพาะแอดมิน (แพรสั่ง 2026-08-07) — endpoint นี้ทุก role เรียกได้ (requireSession เฉยๆ)
// จึงต้องกรองที่นี่โดยเฉพาะ ไม่งั้นทุกคนได้ branches list ที่มี NCD ผ่าน fetch ตรงๆ แม้ UI จะไม่โชว์ก็ตาม
// ไม่กรอง meta.items/meta.par — ต้องครบทุกสาขารวม NCD เสมอ (ใช้คำนวณ par ต่อสาขาภายใน)
export async function GET() {
  try {
    const s = await requireSession();
    const meta = await db.getMeta();
    return NextResponse.json({ ...meta, branches: visibleBranches(s.role) });
  } catch (e: any) {
    const a = authErrorResponse(e);
    return NextResponse.json(a ? a.body : { error: e?.message ?? "meta failed" }, { status: a ? a.status : 500 });
  }
}
