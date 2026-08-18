import { NextResponse } from "next/server";
import { db, parseBranch } from "@/lib/db";
import type { Branch, TimeClockEntry } from "@/lib/types";
import { requireAdmin, authErrorResponse } from "@/lib/authz";
import { writeAudit } from "@/lib/audit";
import { t } from "@/lib/i18n";

export const dynamic = "force-dynamic";

function fail(e: unknown, msg: string) {
  const a = authErrorResponse(e);
  return NextResponse.json(a ? a.body : { error: (e as any)?.message ?? msg }, { status: a ? a.status : 500 });
}

const isMonth = (v: string | null): v is string => !!v && /^\d{4}-\d{2}$/.test(v);

/** ชั่วโมงทำงานของกะ (นาที) — กะที่ยังไม่กดออกงานคืน null ไม่ใช่ 0 */
function shiftMinutes(e: TimeClockEntry): number | null {
  if (!e.clockOut) return null;
  const ms = new Date(e.clockOut).getTime() - new Date(e.clockIn).getTime();
  return ms > 0 ? Math.round(ms / 60000) : 0;
}

// GET /api/time-clock/report?month=YYYY-MM&branch=NVP → รายการลงเวลา + สรุปชั่วโมงรายคน
//
// สรุปเป็น "นาที" ตลอดทาง แล้วค่อยแปลงเป็นชั่วโมงตอนแสดงผล
// ถ้าปัดเป็นชั่วโมงตั้งแต่รายกะ แล้วเอามาบวกกัน เศษจะหายไปทีละนิดจนยอดเดือนเพี้ยน
export async function GET(req: Request) {
  try {
    const s = await requireAdmin();
    const lang = s.lang ?? "th";
    const { searchParams } = new URL(req.url);
    const month = searchParams.get("month");
    if (!isMonth(month)) return NextResponse.json({ error: t(lang, "timeclockReport.errInvalidMonth") }, { status: 400 });
    const branch = parseBranch(searchParams.get("branch")) as Branch | null;

    const entries = await db.listTimeClock(month, branch ?? undefined);

    const byUser = new Map<string, { userId: string; userName: string; minutes: number; shifts: number; openShifts: number; days: Set<string> }>();
    for (const e of entries) {
      const cur = byUser.get(e.userId) ?? {
        userId: e.userId, userName: e.userName, minutes: 0, shifts: 0, openShifts: 0, days: new Set<string>(),
      };
      const m = shiftMinutes(e);
      if (m === null) cur.openShifts += 1;
      else { cur.minutes += m; cur.shifts += 1; }
      cur.days.add(e.workDate);
      byUser.set(e.userId, cur);
    }

    const summary = [...byUser.values()]
      .map((u) => ({ userId: u.userId, userName: u.userName, minutes: u.minutes, shifts: u.shifts, openShifts: u.openShifts, days: u.days.size }))
      .sort((a, b) => b.minutes - a.minutes);

    return NextResponse.json({
      month, branch: branch ?? null,
      entries: entries.map((e) => ({ ...e, minutes: shiftMinutes(e) })),
      summary,
      totalMinutes: summary.reduce((s, u) => s + u.minutes, 0),
    });
  } catch (e) {
    return fail(e, "report failed");
  }
}

// PATCH /api/time-clock/report { id, clockIn?, clockOut?, note }
//
// แอดมินแก้เวลาย้อนหลังได้ แต่ ** บังคับต้องมีเหตุผล ** — เวลาที่ถูกแก้คือตัวเลขที่เอาไปคิดค่าแรง
// ถ้าแก้ได้เงียบ ๆ ระบบลงเวลาทั้งระบบก็ไม่มีน้ำหนักให้ใครเชื่อ
export async function PATCH(req: Request) {
  try {
    const s = await requireAdmin();
    const lang = s.lang ?? "th";
    const body = await req.json();
    const id = Number(body?.id);
    if (!Number.isFinite(id)) return NextResponse.json({ error: t(lang, "timeclockReport.errIdRequired") }, { status: 400 });

    const note = String(body?.note ?? "").trim();
    if (note.length < 3) {
      return NextResponse.json({ error: t(lang, "timeclockReport.errNoteRequired") }, { status: 400 });
    }

    const clockIn = body?.clockIn ? new Date(body.clockIn) : null;
    const clockOut = body?.clockOut ? new Date(body.clockOut) : null;
    if (clockIn && Number.isNaN(clockIn.getTime())) return NextResponse.json({ error: t(lang, "timeclockReport.errClockInInvalid") }, { status: 400 });
    if (clockOut && Number.isNaN(clockOut.getTime())) return NextResponse.json({ error: t(lang, "timeclockReport.errClockOutInvalid") }, { status: 400 });
    if (clockIn && clockOut && clockOut.getTime() <= clockIn.getTime()) {
      return NextResponse.json({ error: t(lang, "timeclockReport.errClockOutAfterClockIn") }, { status: 400 });
    }

    await db.editTimeClock(id, {
      clockIn: clockIn ? clockIn.toISOString() : undefined,
      clockOut: body?.clockOut === null ? null : clockOut ? clockOut.toISOString() : undefined,
      note, editedBy: s.name,
    });
    await writeAudit(s, "edit_time_clock", { entity: String(id), detail: `แก้เวลาลงงาน: ${note}` });
    return NextResponse.json({ ok: true });
  } catch (e) {
    return fail(e, "edit failed");
  }
}
