import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireAdmin, authErrorResponse } from "@/lib/authz";
import { writeAudit } from "@/lib/audit";
import { deleteFace } from "@/lib/face";
import type { Role, BranchScope } from "@/lib/types";
import { BRANCHES } from "@/lib/types";
import { t } from "@/lib/i18n";

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
    const lang = s.lang ?? "th";
    const body = await req.json();
    const name = typeof body?.name === "string" ? body.name.trim() : "";
    const role = body?.role as Role;
    const branchScope = body?.branchScope as BranchScope;

    if (!name) return NextResponse.json({ error: t(lang, "users.errNameRequiredApi") }, { status: 400 });
    if (!ROLES.includes(role)) return NextResponse.json({ error: t(lang, "users.errInvalidRole", { roles: ROLES.join("|") }) }, { status: 400 });
    if (!SCOPES.includes(branchScope)) return NextResponse.json({ error: t(lang, "users.errInvalidBranchScope", { scopes: SCOPES.join("|") }) }, { status: 400 });
    const preferredLang = body?.preferredLang === "en" ? "en" : body?.preferredLang === "th" ? "th" : undefined;

    // แอดมินไม่ตั้ง PIN ให้อีกต่อไป (v1.15) — คืน "รหัสตั้งค่า" ให้ส่งต่อ แล้วเจ้าตัวไปตั้ง PIN เอง
    const user = await db.createUser({ name, role, branchScope, createdBy: s.userId, preferredLang });
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
    const lang = s.lang ?? "th";
    const body = await req.json();
    const id = typeof body?.id === "string" ? body.id : "";
    if (!id) return NextResponse.json({ error: t(lang, "users.errIdRequired") }, { status: 400 });

    const patch: { name?: string; role?: Role; branchScope?: BranchScope; active?: boolean; allowanceEnabled?: boolean; allowanceMonthly?: number; workUnit?: "store" | "production"; isSenior?: boolean; preferredLang?: "th" | "en" } = {};
    // หน่วยงาน (v1.24) — ฝ่ายผลิตไม่เห็นเมนูหน้าร้าน และลงเวลาได้โดยไม่ต้องผูกสาขา
    if (body.workUnit === "store" || body.workUnit === "production") patch.workUnit = body.workUnit;
    if (typeof body.name === "string") patch.name = body.name.trim();
    if (typeof body.isSenior === "boolean") patch.isSenior = body.isSenior;
    // ภาษา UI (v1.31) — เตรียมรองรับพนักงานต่างชาติที่ NCD
    if (body.preferredLang === "th" || body.preferredLang === "en") patch.preferredLang = body.preferredLang;
    if (body.role !== undefined) {
      if (!ROLES.includes(body.role)) return NextResponse.json({ error: t(lang, "users.errInvalidRole", { roles: ROLES.join("|") }) }, { status: 400 });
      patch.role = body.role;
    }
    if (body.branchScope !== undefined) {
      if (!SCOPES.includes(body.branchScope)) return NextResponse.json({ error: t(lang, "users.errInvalidBranchScope", { scopes: SCOPES.join("|") }) }, { status: 400 });
      patch.branchScope = body.branchScope;
    }
    if (typeof body.active === "boolean") patch.active = body.active;
    if (typeof body.allowanceEnabled === "boolean") patch.allowanceEnabled = body.allowanceEnabled;
    if (body.allowanceMonthly !== undefined) {
      const m = Number(body.allowanceMonthly);
      if (!Number.isFinite(m) || m < 0) return NextResponse.json({ error: t(lang, "users.errInvalidAllowanceAmount") }, { status: 400 });
      patch.allowanceMonthly = m;
    }
    // แอดมินตั้ง PIN ให้ไม่ได้แล้ว — ทำได้แค่ออก "รหัสตั้งค่าใหม่" ให้เจ้าตัวไปตั้งเอง (v1.15)
    if (body.issueSetupCode === true) {
      const code = await db.issueSetupCode(id);
      if (!code) return NextResponse.json({ error: t(lang, "users.errUserNotFound") }, { status: 404 });
      await writeAudit(s, "issue_setup_code", { entity: id, detail: "ออกรหัสตั้งค่าใหม่ (รหัสเดิมใช้ไม่ได้ทันที)" });
      return NextResponse.json({ ok: true, setupCode: code });
    }

    // รีเซ็ตใบหน้า — พนักงานลงทะเบียนได้ครั้งเดียวและแก้เองไม่ได้
    // ทางออกเดียวเมื่อสแกนไม่ผ่าน (ตัดผม ใส่แว่น น้ำหนักเปลี่ยน) คือให้แอดมินล้างของเดิมให้
    // ลบออกจากคลังใบหน้าฝั่ง AWS ด้วย ไม่งั้นหน้าเก่าค้างอยู่แล้วบล็อกตอนลงทะเบียนใหม่
    if (body.resetFace === true) {
      const oldFaceId = await db.clearFaceEnrollment(id);
      if (oldFaceId) {
        try { await deleteFace(oldFaceId); } catch { /* ลบไม่ได้/ไม่มีอยู่แล้ว ก็ไม่ต้องขวางการรีเซ็ต */ }
      }
      await writeAudit(s, "reset_face", { entity: id, detail: "รีเซ็ตใบหน้า ให้ลงทะเบียนใหม่ได้" });
      return NextResponse.json({ ok: true });
    }

    const user = await db.updateUser(id, patch);
    if (!user) return NextResponse.json({ error: t(lang, "users.errUserNotFound") }, { status: 404 });

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

// DELETE /api/users?id=u-xxxx → ลบบัญชีถาวร (admin เท่านั้น)
//
// ลบจริง ไม่ใช่ซ่อน — ใช้กับบัญชีที่สร้างผิด/ไม่ได้ใช้แล้ว
// กันไว้ 3 ชั้น: ลบตัวเองไม่ได้ · ลบแอดมินคนสุดท้ายไม่ได้ · มีรายการใช้สิทธิ์ผูกอยู่ลบไม่ได้
// (staff_allowance_uses มี FK จริง ลบแล้วยอดเงินจะหาไม่เจอว่าเป็นของใคร)
export async function DELETE(req: Request) {
  try {
    const s = await requireAdmin();
    const lang = s.lang ?? "th";
    const { searchParams } = new URL(req.url);
    const id = searchParams.get("id") ?? "";
    if (!id) return NextResponse.json({ error: t(lang, "users.errIdRequired") }, { status: 400 });
    if (id === s.userId) return NextResponse.json({ error: t(lang, "users.errCannotDeleteSelf") }, { status: 400 });

    const users = await db.listUsers();
    const target = users.find((u) => u.id === id);
    if (!target) return NextResponse.json({ error: t(lang, "users.errUserNotFound") }, { status: 404 });

    // ลบบัญชีแอดมินไม่ได้เลย ไม่ว่ากรณีไหน (แพรสั่ง 2026-07-27)
    // แอดมินคือบัญชีที่เข้าถึงข้อมูลทุกสาขา แก้ Par แก้ผู้ใช้ ดู audit ได้ทั้งหมด
    // การลบทิ้งจึงมีผลกระทบคนละระดับกับลบบัญชีพนักงาน — ปิดประตูไปเลยดีกว่าเปิดแล้วมาไล่กันทีหลัง
    // ถ้าจำเป็นต้องลบจริง: เปลี่ยนสิทธิ์เป็น "พนักงาน" ก่อน แล้วค่อยลบ (ต้องตั้งใจ 2 จังหวะ)
    if (target.role === "admin") {
      return NextResponse.json({
        error: t(lang, "users.errCannotDeleteAdmin"),
      }, { status: 400 });
    }

    const act = await db.getUserActivity(id);
    if (act.allowanceUses > 0) {
      return NextResponse.json({
        error: t(lang, "users.errHasAllowanceHistory", { count: act.allowanceUses }),
      }, { status: 409 });
    }

    const res = await db.deleteUser(id);
    if (!res.ok) return NextResponse.json({ error: res.reason ?? t(lang, "users.errDeleteFailedApi") }, { status: 409 });

    await writeAudit(s, "delete_user", {
      entity: id,
      detail: `ลบบัญชี ${target.name} (${target.role}${target.branchScope !== "all" ? " · " + target.branchScope : ""})` +
        ` · ร่องรอยที่เหลือในระบบ: audit ${act.auditRows} · งาน ${act.workRows}`,
    });
    return NextResponse.json({ ok: true });
  } catch (e: any) {
    const a = authErrorResponse(e);
    if (a) return NextResponse.json(a.body, { status: a.status });
    return NextResponse.json({ error: e?.message ?? "delete user failed" }, { status: 500 });
  }
}
