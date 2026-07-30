import { NextResponse } from "next/server";
import { db, parseBranch } from "@/lib/db";
import { requireSession, resolveBranch, authErrorResponse } from "@/lib/authz";
import { writeAudit } from "@/lib/audit";
import type { Branch } from "@/lib/types";

export const dynamic = "force-dynamic";

const isDate = (v: unknown): v is string => typeof v === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v);
const LEAVE_CODES = ["AL", "PL", "SL", "LWP"];

function fail(e: unknown, msg: string) {
  const a = authErrorResponse(e);
  if (a) return NextResponse.json(a.body, { status: a.status });
  return NextResponse.json({ error: (e as any)?.message ?? msg }, { status: 500 });
}

// GET /api/schedule-requests?branch=NVP → คำขอของสาขานั้น (ค้างอยู่ก่อน แล้วตามด้วยที่ตัดสินแล้ว)
export async function GET(req: Request) {
  try {
    const s = await requireSession();
    const { searchParams } = new URL(req.url);
    const branch = resolveBranch(s, parseBranch(searchParams.get("branch"))) as Branch;
    const rows = await db.listScheduleRequests(branch);
    return NextResponse.json({ branch, rows });
  } catch (e) {
    return fail(e, "listScheduleRequests failed");
  }
}

// POST /api/schedule-requests { branch, workDate, employeeName, kind, leaveCode?, swapWith?, reason }
//
// ลา AL/PL/SL → มีผลทันทีถ้าสิทธิ์ปีนี้ยังเหลือ (แพรตัดสิน: ไม่ต้องรออนุมัติ พนักงานทำงานต่อได้เลย)
// ถ้าสิทธิ์หมด → ระบบไม่ปฏิเสธ แต่แปลงเป็น LWP (ลาไม่รับค่าจ้าง) แล้วบอกให้รู้ตัว
// ขอสลับวันหยุด → เข้าคิวรออนุมัติจาก senior staff หรือแอดมิน
export async function POST(req: Request) {
  try {
    const s = await requireSession();
    const body = await req.json();
    const branch = resolveBranch(s, parseBranch(body?.branch ?? null)) as Branch;
    const workDate = body?.workDate;
    const employeeName = String(body?.employeeName ?? "").trim();
    const kind = body?.kind === "swap" ? "swap" : "leave";
    const reason = String(body?.reason ?? "").trim();

    if (!isDate(workDate)) return NextResponse.json({ error: "วันที่ไม่ถูกต้อง" }, { status: 400 });
    if (!employeeName) return NextResponse.json({ error: "ต้องระบุว่าเป็นตารางของใคร" }, { status: 400 });
    if (reason.length < 3) return NextResponse.json({ error: "เขียนเหตุผลสั้น ๆ ด้วย (อย่างน้อย 3 ตัวอักษร)" }, { status: 400 });

    if (kind === "swap") {
      const swapWith = String(body?.swapWith ?? "").trim();
      if (!swapWith) return NextResponse.json({ error: "ต้องเลือกคนที่จะสลับด้วย" }, { status: 400 });
      const request = await db.createScheduleRequest({
        branch, workDate, employeeName, requestedBy: s.name, kind: "swap",
        swapWith, reason,
      });
      await writeAudit(s, "schedule_request", {
        branch, date: workDate, detail: `ขอสลับกะ ${employeeName} ↔ ${swapWith}: ${reason}`,
      });
      return NextResponse.json({ ok: true, request, applied: false });
    }

    const leaveCode = String(body?.leaveCode ?? "").toUpperCase();
    if (!LEAVE_CODES.includes(leaveCode)) {
      return NextResponse.json({ error: `ประเภทการลาไม่ถูกต้อง (${LEAVE_CODES.join("|")})` }, { status: 400 });
    }

    const result = await db.applyLeaveRequest({
      branch, workDate, employeeName, requestedBy: s.name, leaveCode, reason,
    });
    await writeAudit(s, "schedule_request", {
      branch, date: workDate,
      detail: `ลา ${result.appliedCode} ของ ${employeeName}: ${reason}${result.downgraded ? " (สิทธิ์หมด → ลาไม่รับค่าจ้าง)" : ""}`,
    });
    return NextResponse.json({ ok: true, ...result, applied: true });
  } catch (e) {
    return fail(e, "createScheduleRequest failed");
  }
}
