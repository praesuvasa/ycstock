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

// POST /api/users { name, role, branchScope, passcode } → { ok, user }
export async function POST(req: Request) {
  try {
    const s = await requireAdmin();
    const body = await req.json();
    const name = typeof body?.name === "string" ? body.name.trim() : "";
    const passcode = typeof body?.passcode === "string" ? body.passcode.trim() : "";
    const role = body?.role as Role;
    const branchScope = body?.branchScope as BranchScope;

    if (!name) return NextResponse.json({ error: "ต้องระบุชื่อ" }, { status: 400 });
    if (!passcode) return NextResponse.json({ error: "ต้องระบุรหัส (PIN)" }, { status: 400 });
    if (!ROLES.includes(role)) return NextResponse.json({ error: `role ไม่ถูกต้อง (${ROLES.join("|")})` }, { status: 400 });
    if (!SCOPES.includes(branchScope)) return NextResponse.json({ error: `สาขาไม่ถูกต้อง (${SCOPES.join("|")})` }, { status: 400 });

    const user = await db.createUser({ name, role, branchScope, passcode, createdBy: s.userId });
    await writeAudit(s, "create_user", { entity: user.id, detail: "สร้าง " + name + " (" + role + ")" });
    return NextResponse.json({ ok: true, user });
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

    const patch: { name?: string; role?: Role; branchScope?: BranchScope; active?: boolean; passcode?: string } = {};
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
    if (typeof body.passcode === "string" && body.passcode.trim()) patch.passcode = body.passcode.trim();

    const user = await db.updateUser(id, patch);
    if (!user) return NextResponse.json({ error: "ไม่พบผู้ใช้" }, { status: 404 });

    const changed = Object.keys(patch).filter((k) => k !== "passcode");
    const detail = "แก้ " + user.name + (patch.passcode ? " · รีเซ็ตรหัส" : "") +
      (changed.length ? " (" + changed.join(", ") + ")" : "");
    await writeAudit(s, "update_user", { entity: id, detail });
    return NextResponse.json({ ok: true, user });
  } catch (e: any) {
    const a = authErrorResponse(e);
    if (a) return NextResponse.json(a.body, { status: a.status });
    return NextResponse.json({ error: e?.message ?? "update user failed" }, { status: 500 });
  }
}
