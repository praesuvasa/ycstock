import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireSession, AuthError, authErrorResponse } from "@/lib/authz";
import { t } from "@/lib/i18n";

export const dynamic = "force-dynamic";

// GET /api/audit?userId=&branch=&action=&limit= → { rows }
// admin เห็นทุกสาขา · senior staff เห็นได้ด้วย (แพรสั่ง 2026-08-06) แต่ล็อกแค่สาขาตัวเอง
export async function GET(req: Request) {
  try {
    const s = await requireSession();
    const lang = s.lang ?? "th";
    const isAdmin = s.role === "admin";
    let isSenior = false;
    if (!isAdmin) {
      const me = await db.getUserById(s.userId);
      isSenior = !!me?.isSenior;
      if (!isSenior) throw new AuthError(t(lang, "audit.errForbidden"), 403);
    }
    const { searchParams } = new URL(req.url);
    const filter: { userId?: string; branch?: string; action?: string; limit?: number } = {};
    const userId = searchParams.get("userId");
    const action = searchParams.get("action");
    const limit = searchParams.get("limit");
    if (userId) filter.userId = userId;
    if (action) filter.action = action;
    if (limit && Number.isFinite(Number(limit))) filter.limit = Number(limit);
    if (isAdmin) {
      const branch = searchParams.get("branch");
      if (branch) filter.branch = branch;
      return NextResponse.json({ rows: await db.listAudit(filter), isSenior });
    }

    // senior ผูกสาขาเดียวเสมอ ไม่รับ branch จาก client — กันเห็นสาขาอื่น
    // ผลพลอยได้: action ระดับบัญชี/ระบบ (create_user, login, ฯลฯ) เขียน branch=null เสมอ
    // → ไม่ผ่านตัวกรองนี้อยู่แล้ว ไม่ต้องมี blocklist แยกสำหรับ action พวกนั้น
    if (s.branchScope !== "all") filter.branch = s.branchScope;
    const rows = await db.listAudit(filter);
    // แพรขอ 2026-08-06 — ให้เห็นแค่งานของพนักงาน ไม่รวมที่แอดมินแก้เอง
    const users = await db.listUsers();
    const adminIds = new Set(users.filter((u) => u.role === "admin").map((u) => u.id));
    return NextResponse.json({ rows: rows.filter((r) => !adminIds.has(r.userId)), isSenior });
  } catch (e: any) {
    const a = authErrorResponse(e);
    if (a) return NextResponse.json(a.body, { status: a.status });
    return NextResponse.json({ error: e?.message ?? "audit failed" }, { status: 500 });
  }
}
