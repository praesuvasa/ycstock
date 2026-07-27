import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { BRANCHES } from "@/lib/types";
import type { Branch } from "@/lib/types";
import { requireSession, authErrorResponse } from "@/lib/authz";
import { weekdayFromDate, isExpiryCheckDue } from "@/lib/calc";
import { todayISO } from "@/lib/fmt";

export const dynamic = "force-dynamic";

// GET /api/expiry-checks/pending-count → { count, due }
//
// badge เตือน "ยังไม่ได้ตรวจวันหมดอายุ" ที่เมนู — ขึ้นเฉพาะวันอังคาร/ศุกร์ (รอบตรวจ)
// พนักงาน → 1 ถ้าสาขาตัวเองยังไม่บันทึก · แอดมิน → จำนวนสาขาที่ยังไม่บันทึก
//
// เทียบ "วันนี้" ที่ฝั่งเซิร์ฟเวอร์เสมอ ไม่เชื่อวันที่จากเครื่อง client
// (client ตั้งวันผิดแล้ว badge หายไปทั้งวัน = พลาดรอบตรวจโดยไม่มีอะไรเตือน)
export async function GET() {
  try {
    const s = await requireSession();
    const today = todayISO();
    if (!isExpiryCheckDue(weekdayFromDate(today))) return NextResponse.json({ count: 0, due: false });

    const done = new Set(await db.getBranchesWithExpiryCheck(today));
    const scope = s.branchScope;
    const targets: Branch[] = scope === "all" ? [...BRANCHES] : [scope as Branch];
    const count = targets.filter((b) => !done.has(b)).length;
    return NextResponse.json({ count, due: true });
  } catch (e) {
    const a = authErrorResponse(e);
    // badge พังไม่ควรทำให้ nav ทั้งแถบพัง — คืน 0 เงียบ ๆ ถ้าไม่ใช่ปัญหาสิทธิ์
    return NextResponse.json(a ? a.body : { count: 0, due: false }, { status: a ? a.status : 200 });
  }
}
