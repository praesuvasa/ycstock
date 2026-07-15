import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { signSession, SESSION_COOKIE } from "@/lib/session";
import { writeAudit } from "@/lib/audit";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  try {
    const { passcode } = (await req.json()) as { passcode?: string };
    if (!passcode) return NextResponse.json({ error: "กรอกรหัส" }, { status: 400 });

    const user = await db.getUserByPasscode(passcode);
    if (!user) return NextResponse.json({ error: "รหัสไม่ถูกต้อง" }, { status: 401 });

    const token = await signSession({
      userId: user.id, name: user.name, role: user.role, branchScope: user.branchScope,
    });
    const res = NextResponse.json({ ok: true, user });
    res.cookies.set(SESSION_COOKIE, token, {
      httpOnly: true, sameSite: "lax", path: "/", secure: process.env.NODE_ENV === "production",
      maxAge: 12 * 3600,
    });
    await writeAudit({ userId: user.id, name: user.name, role: user.role, branchScope: user.branchScope, exp: 0 }, "login", { detail: "เข้าสู่ระบบ" });
    return res;
  } catch (e: any) {
    return NextResponse.json({ error: e?.message ?? "login failed" }, { status: 500 });
  }
}
