import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireAdmin, authErrorResponse } from "@/lib/authz";
import { writeAudit } from "@/lib/audit";
import type { Role, BranchScope } from "@/lib/types";
import { BRANCHES } from "@/lib/types";

export const dynamic = "force-dynamic";

const ROLES: Role[] = ["user", "admin", "restock"];
const SCOPES: BranchScope[] = ["all", ...BRANCHES];

// GET /api/users → { users } (admin เท่านั้น)
export async function GET() {
  try {
    await requireAdmin();
    return NextResponse.json({ users: await db.listUsers() });
  } catch (e: any) {
    const a = authErrorResponse(e);
    if (a) return NextResponse.json(a.body, { status: a.status });
    return NextResponse.json({ error: e?.message ?? "users failed" }, { status: 500 });
  }
}

// POST /api/users { name, role, branchScope } → { ok, user, setupCode }  (ไม่รับ PIN แล้ว — v1.15)
export async function POST(req: Request) {
  try {
    const s = await requireAdmin();
    const body = await req.json();
    const name = typeof body?.name === "string" ? body.name.trim() : "";
    const role = body?.role as Role;
    const branchScope = body?.branchScope as BranchScope;

    if (!name) return NextResponse.json({ error: "ต้องระบุชื่อ" }, { status: 400 });
    if (!ROLES.includes(role)) return NextResponse.json({ error: `role ไม่ถูกต้อง (${ROLES.join("|")})` }, { status: 400 });
    if (!SCOPES.includes(branchScope)) return NextResponse.json({ error: `สาขาไม่ถูกต้อง (${SCOPES.join("|")})` }, { status: 400 });

    // แอดมินไม่ตั้ง PIN ให้อีกต่อไป (v1.15) — คืน "รหัสตั้งค่า" ให้ส่งต่อ แล้วเจ้าตัวไปตั้ง PIN เอง
    const user = await db.createUser({ name, role, branchScope, createdBy: s.userId });
    await writeAudit(s, "create_user", { entity: user.id, detail: "สร้าง " + name + " (" + role + ") + ออกรหัสตั้งค่า" });
    return NextResponse.json({ ok: true, user, setupCode: user.setupCode });
  } catch (e: any) {
    const a = authErrorResponse(e);
    if (a) return NextResponse.json(a.body, { status: a.status });
    return NextResponse.json({ error: e?.message ?? "create user failed" }, { status: 500 });
  }
}

// PATCH /api/users { id, ...patch } → { ok, user }
export async function PATCH(req: Request) {
  try {
    const s = await requireAdmin();
    const body = await req.json();
    const id = typeof body?.id === "string" ? body.id : "";
    if (!id) return NextResponse.json({ error: "ต้องระบุ id" }, { status: 400 });

    const patch: { name?: string; role?: Role; branchScope?: BranchScope; active?: boolean; allowanceEnabled?: boolean; allowanceMonthly?: number } = {};
    if (typeof body.name === "string") patch.name = body.name.trim();
    if (body.role !== undefined) {
      if (!ROLES.includes(body.role)) return NextResponse.json({ error: `role ไม่ถูกต้อง (${ROLES.join("|")})` }, { status: 400 });
      patch.role = body.role;
    }
    if (body.branchScope !== undefined) {
      if (!SCOPES.includes(body.branchScope)) return NextResponse.json({ error: `สาขาไม่ถูกต้อง (${SCOPES.join("|")})` }, { status: 400 });
      patch.branchScope = body.branchScope;
    }
    if (typeof body.active === "boolean") patch.active = body.active;
    if (typeof body.allowanceEnabled === "boolean") patch.allowanceEnabled = body.allowanceEnabled;
    if (body.allowanceMonthly !== undefined) {
      const m = Number(body.allowanceMonthly);
      if (!Number.isFinite(m) || m < 0) return NextResponse.json({ error: "วงเงินไม่ถูกต้อง" }, { status: 400 });
      patch.allowanceMonthly = m;
    }
    // แอดมินตั้ง PIN ให้ไม่ได้แล้ว — ทำได้แค่ออก "รหัสตั้งค่าใหม่" ให้เจ้าตัวไปตั้งเอง (v1.15)
    if (body.issueSetupCode === true) {
      const code = await db.issueSetupCode(id);
      if (!code) return NextResponse.json({ error: "ไม่พบผู้ใช้" }, { status: 404 });
      await writeAudit(s, "issue_setup_code", { entity: id, detail: "ออกรหัสตั้งค่าใหม่ (รหัสเดิมใช้ไม่ได้ทันที)" });
      return NextResponse.json({ ok: true, setupCode: code });
    }

    const user = await db.updateUser(id, patch);
    if (!user) return NextResponse.json({ error: "ไม่พบผู้ใช้" }, { status: 404 });

    const changed = Object.keys(patch);
    const detail = "แก้ " + user.name + (changed.length ? " (" + changed.join(", ") + ")" : "");
    await writeAudit(s, "update_user", { entity: id, detail });
    return NextResponse.json({ ok: true, user });
  } catch (e: any) {
    const a = authErrorResponse(e);
    if (a) return NextResponse.json(a.body, { status: a.status });
    return NextResponse.json({ error: e?.message ?? "update user failed" }, { status: 500 });
  }
}
