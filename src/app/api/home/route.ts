import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import type { Branch } from "@/lib/types";
import { requireSession, authErrorResponse } from "@/lib/authz";
import { weekdayFromDate, isExpiryCheckDue } from "@/lib/calc";
import { todayISO } from "@/lib/fmt";

export const dynamic = "force-dynamic";

export interface HomeTask {
  key: string;
  label: string;
  href: string;
  status: "done" | "todo" | "due";  // due = ถึงรอบวันนี้ ยังไม่ทำ (เร่งกว่า todo)
  hint?: string;
}

// GET /api/home → เช็คลิสต์งานวันนี้ของ "สาขาตัวเอง"
//
// สำคัญ: เช็คลิสต์นี้เป็นของสาขา ไม่ใช่ของแต่ละคน — ข้อมูลทุกอย่างในระบบผูกกับ (สาขา, วันที่)
// A ยืนยันรับของแล้ว B เปิดมาก็เห็นว่าติ๊กแล้ว ไม่ต้องทำซ้ำ ซึ่งเป็นสิ่งที่ต้องการ
//
// เทียบ "วันนี้" ที่ฝั่งเซิร์ฟเวอร์เสมอ ไม่เชื่อวันที่จากเครื่อง client
export async function GET() {
  try {
    const s = await requireSession();
    if (s.branchScope === "all") {
      return NextResponse.json({ error: "หน้านี้สำหรับพนักงานที่ผูกสาขา" }, { status: 400 });
    }
    const branch = s.branchScope as Branch;
    const date = todayISO();

    const [pendingReceipt, stockRows, salesToday, expiryDone] = await Promise.all([
      db.getPendingReceiptCount(branch),
      db.getStock(branch, date),
      db.getSales(branch, date),
      db.getBranchesWithExpiryCheck(date),
    ]);

    const sum = (r: typeof salesToday) => r.cash + r.qr + r.edc + r.grab + r.lineman;
    // นับว่า "เช็คสต็อกแล้ว" เมื่อมีแถวที่พนักงานยืนยันคงเหลือเองจริง ๆ
    // (hasEntry = remain_confirmed — แถวที่เกิดจาก auto-fill รับของล้วน ๆ ไม่นับ)
    const stockDone = stockRows.some((r) => r.hasEntry);
    const expiryDue = isExpiryCheckDue(weekdayFromDate(date));

    const tasks: HomeTask[] = [
      {
        key: "receipt", label: "ยืนยันรับของ", href: "/confirm-receipt",
        status: pendingReceipt > 0 ? "due" : "done",
        hint: pendingReceipt > 0 ? `ค้าง ${pendingReceipt} รายการ` : "ไม่มีรายการค้าง",
      },
      {
        key: "stock", label: "เช็คสต็อก", href: "/stock",
        status: stockDone ? "done" : "todo",
      },
      {
        key: "sales", label: "รายงานยอดขาย", href: "/sales",
        status: sum(salesToday) > 0 ? "done" : "todo",
      },
    ];
    if (expiryDue) {
      tasks.push({
        key: "expiry", label: "ตรวจสอบวันหมดอายุ", href: "/expiry",
        status: expiryDone.includes(branch) ? "done" : "due",
        hint: "วันนี้ถึงรอบตรวจ · ของส่งคืนขึ้นรถพรุ่งนี้",
      });
    }

    return NextResponse.json({
      branch, date,
      tasks,
      remaining: tasks.filter((t) => t.status !== "done").length,
    });
  } catch (e) {
    const a = authErrorResponse(e);
    return NextResponse.json(a ? a.body : { error: (e as any)?.message ?? "home failed" }, { status: a ? a.status : 500 });
  }
}
