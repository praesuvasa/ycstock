import { NextResponse } from "next/server";
import { db, parseBranch } from "@/lib/db";
import { requireSession, resolveBranch, authErrorResponse } from "@/lib/authz";
import { todayBangkok } from "@/lib/fmt";
import type { Branch } from "@/lib/types";

export const dynamic = "force-dynamic";

const isDate = (v: string | null): v is string => !!v && /^\d{4}-\d{2}-\d{2}$/.test(v);

// GET /api/schedules?branch=NVP&date=YYYY-MM-DD → ใครเข้ากะอะไรวันนั้น (ของสาขาตัวเอง)
//
// อ่านอย่างเดียวในรอบนี้ — ตารางกะเดือน 26 ก.ค.–25 ส.ค. import จากไฟล์ Excel ของแพรแล้ว
// หน้าจัดตารางของแอดมิน (แก้/สลับกะ + บันทึกเหตุผล) ทำรอบถัดไป
export async function GET(req: Request) {
  try {
    const s = await requireSession();
    const { searchParams } = new URL(req.url);
    const branch = resolveBranch(s, parseBranch(searchParams.get("branch"))) as Branch;
    const dateParam = searchParams.get("date");
    const date = isDate(dateParam) ? dateParam : todayBangkok();

    const rows = await db.listSchedules(branch, date);
    return NextResponse.json({ branch, date, rows });
  } catch (e) {
    const a = authErrorResponse(e);
    if (a) return NextResponse.json(a.body, { status: a.status });
    return NextResponse.json({ error: (e as any)?.message ?? "listSchedules failed" }, { status: 500 });
  }
}
