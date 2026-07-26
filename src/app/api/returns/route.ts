import { NextResponse } from "next/server";
import { db, parseBranch } from "@/lib/db";
import { requireSession, authErrorResponse } from "@/lib/authz";
import type { Branch } from "@/lib/types";

export const dynamic = "force-dynamic";

// GET /api/returns?branch=NVP&from=2026-07-01&to=2026-07-26 → { rows, canPickBranch }
//
// ประวัติส่งคืน/ของเสีย — อ่านอย่างเดียว ไม่มี POST เพราะข้อมูลมาจากช่อง "ส่งคืน/เสีย"
// ที่พนักงานกรอกในหน้าสต็อกอยู่แล้ว (ไม่ใช่การกรอกซ้ำที่หน้านี้)
//
// สิทธิ์: พนักงานเห็นเฉพาะสาขาตัวเอง (บังคับด้วย branchScope ไม่เชื่อค่าที่ส่งมาจาก client)
//        admin (branchScope=all) เลือกสาขาได้ หรือไม่ระบุ = ดูทุกสาขารวมกัน
export async function GET(req: Request) {
  try {
    const s = await requireSession();
    const { searchParams } = new URL(req.url);
    const from = searchParams.get("from");
    const to = searchParams.get("to");
    if (!from || !to) return NextResponse.json({ error: "from และ to จำเป็น" }, { status: 400 });

    const canPickBranch = s.branchScope === "all";
    let branch: Branch | null;
    if (canPickBranch) {
      branch = parseBranch(searchParams.get("branch")); // null = ทุกสาขา
    } else {
      branch = s.branchScope as Branch; // ล็อกสาขาตัวเอง ไม่สนใจ query string
    }

    const rows = await db.getReturnHistory(branch, from, to);
    return NextResponse.json({ rows, branch, canPickBranch });
  } catch (e: any) {
    const a = authErrorResponse(e);
    return NextResponse.json(a ? a.body : { error: e?.message ?? "getReturnHistory failed" }, { status: a ? a.status : 500 });
  }
}
