import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireSession, authErrorResponse } from "@/lib/authz";

export const dynamic = "force-dynamic";

// GET /api/feedback/unseen-count → { count } — ใช้ทำ badge ที่เมนู "ความคิดเห็นและข้อเสนอแนะ"
//
// เฉพาะแอดมิน · role อื่นคืน 0 เงียบ ๆ ไม่ใช่ 403
// เพราะ nav ยิงเส้นนี้ทุกครั้งที่เปลี่ยนหน้า ถ้าตอบ error จะมี log ขยะเต็มไปหมดโดยไม่มีอะไรผิด
export async function GET() {
  try {
    const s = await requireSession();
    if (s.role !== "admin") return NextResponse.json({ count: 0 });
    return NextResponse.json({ count: await db.countUnseenFeedback() });
  } catch (e) {
    const a = authErrorResponse(e);
    return NextResponse.json(a ? a.body : { count: 0 }, { status: a ? a.status : 200 });
  }
}
