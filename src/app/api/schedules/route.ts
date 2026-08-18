import { NextResponse } from "next/server";
import { db, parseBranch } from "@/lib/db";
import { requireSession, resolveBranch, authErrorResponse } from "@/lib/authz";
import { writeAudit } from "@/lib/audit";
import { todayBangkok } from "@/lib/fmt";
import { t } from "@/lib/i18n";
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
    // ?month=YYYY-MM → ทั้งเดือน (หน้าตารางงาน) · ไม่ใส่ → เฉพาะวันนั้น (การ์ดตารางวันนี้)
    const month = searchParams.get("month");
    if (month && /^\d{4}-\d{2}$/.test(month)) {
      const rows = await db.listSchedulesMonth(branch, month);
      return NextResponse.json({ branch, month, rows });
    }

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

// PATCH /api/schedules { branch, workDate, employeeName, shiftCode, reason }
// แก้กะรายวัน — เฉพาะแอดมินและ senior staff (กิ๊ก ที่ NVP) · ผ่านด่านเช็คกติกาก่อนเสมอ
export async function PATCH(req: Request) {
  try {
    const s = await requireSession();
    const lang = s.lang ?? "th";
    const me = await db.getUserById(s.userId);
    const allowed = s.role === "admin" || !!me?.isSenior;
    if (!allowed) {
      return NextResponse.json({ error: t(lang, "schedule.api.editForbidden") }, { status: 403 });
    }
    const body = await req.json();
    const branch = resolveBranch(s, parseBranch(body?.branch ?? null)) as Branch;
    const workDate = String(body?.workDate ?? "");
    const employeeName = String(body?.employeeName ?? "").trim();
    const shiftCode = String(body?.shiftCode ?? "").trim().toUpperCase();
    const reason = String(body?.reason ?? "").trim();
    if (!isDate(workDate)) return NextResponse.json({ error: t(lang, "schedule.api.invalidDate") }, { status: 400 });
    if (!employeeName || !shiftCode) return NextResponse.json({ error: t(lang, "schedule.api.missingPersonOrShift") }, { status: 400 });
    if (reason.length < 3) return NextResponse.json({ error: t(lang, "schedule.api.reasonTooShort") }, { status: 400 });

    const res = await db.setScheduleShift({ branch, workDate, employeeName, shiftCode, reason, changedBy: s.name });
    if (!res.ok) return NextResponse.json({ error: (res as any).error }, { status: 400 });
    await writeAudit(s, "schedule_edit", { branch, date: workDate, entity: employeeName, detail: `แก้กะเป็น ${shiftCode}: ${reason}` });
    return NextResponse.json({ ok: true });
  } catch (e) {
    const a = authErrorResponse(e);
    if (a) return NextResponse.json(a.body, { status: a.status });
    return NextResponse.json({ error: (e as any)?.message ?? "setScheduleShift failed" }, { status: 500 });
  }
}
