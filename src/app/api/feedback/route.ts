import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import type { Branch } from "@/lib/types";
import { requireSession, requireAdmin, authErrorResponse } from "@/lib/authz";
import { t } from "@/lib/i18n";

export const dynamic = "force-dynamic";

const TOPICS = new Set(["system", "work", "team", "place", "other"]);

function fail(e: unknown, msg: string) {
  const a = authErrorResponse(e);
  return NextResponse.json(a ? a.body : { error: (e as any)?.message ?? msg }, { status: a ? a.status : 500 });
}

// GET /api/feedback → รายการทั้งหมด (admin เท่านั้น) · เปิดหน้าแล้วถือว่าอ่านแล้ว
export async function GET() {
  try {
    const s = await requireAdmin();
    const rows = await db.listFeedback();
    await db.markAllFeedbackSeen(s.name);
    return NextResponse.json({ rows });
  } catch (e) {
    return fail(e, "listFeedback failed");
  }
}

// POST /api/feedback { topic, message, wantedAction, anonymous }
//
// ** ไม่ตอบกลับข้อมูลผู้ส่งใด ๆ ** และถ้าเลือกไม่ระบุชื่อ จะไม่เก็บชื่อลงฐานตั้งแต่แรก
// (ไม่ใช่เก็บแล้วซ่อน — ถ้าเก็บไว้ก็เท่ากับไม่ได้ไม่ระบุชื่อจริง)
export async function POST(req: Request) {
  try {
    const s = await requireSession();
    const lang = s.lang ?? "th";
    const body = await req.json();
    const message = String(body?.message ?? "").trim();
    if (message.length < 5) {
      return NextResponse.json({ error: t(lang, "feedback.errMessageTooShort") }, { status: 400 });
    }
    const topic = TOPICS.has(body?.topic) ? String(body.topic) : "other";

    await db.createFeedback({
      userId: s.userId,
      userName: s.name,
      branch: s.branchScope === "all" ? null : (s.branchScope as Branch),
      anonymous: body?.anonymous === true,
      topic,
      message,
      wantedAction: String(body?.wantedAction ?? "").trim(),
    });

    // ไม่เขียน audit log — audit เก็บชื่อผู้ทำเสมอ ซึ่งจะทำให้ "ไม่ระบุชื่อ" เสียความหมาย
    return NextResponse.json({ ok: true });
  } catch (e) {
    return fail(e, "createFeedback failed");
  }
}
