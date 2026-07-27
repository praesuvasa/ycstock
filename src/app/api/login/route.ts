import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { signSession, SESSION_COOKIE } from "@/lib/session";
import { writeAudit } from "@/lib/audit";

export const dynamic = "force-dynamic";

// หน่วงเวลาเมื่อกรอกรหัสผิดซ้ำ ๆ (v1.15)
// จำเป็นเพราะแอปนี้ใช้ PIN อย่างเดียวเป็นตัวระบุตัวตน — กรอกถูกคือเข้าได้เลย ไม่มีชื่อผู้ใช้มากั้น
// ถ้าไม่จำกัด ใครเปิดเว็บเจอก็ไล่เดาเลข 6 หลักได้ไม่จำกัดครั้ง
const MAX_FAILS = 8;
const WINDOW_MINUTES = 15;

// ใช้ IP จาก header ของ Vercel — กันได้ไม่ 100% (ออกเน็ตร่วมกันจะนับรวมกัน) แต่พอกันการยิงรัวจากเครื่องเดียว
function clientIp(req: Request): string {
  const fwd = req.headers.get("x-forwarded-for");
  return (fwd ? fwd.split(",")[0] : req.headers.get("x-real-ip"))?.trim() || "unknown";
}

export async function POST(req: Request) {
  const ip = clientIp(req);
  try {
    const { passcode } = (await req.json()) as { passcode?: string };
    if (!passcode) return NextResponse.json({ error: "กรอกรหัส" }, { status: 400 });

    const fails = await db.countRecentFailedLogins(ip, WINDOW_MINUTES);
    if (fails >= MAX_FAILS) {
      return NextResponse.json(
        { error: `กรอกรหัสผิดหลายครั้งเกินไป — รออีก ${WINDOW_MINUTES} นาทีแล้วลองใหม่` },
        { status: 429 }
      );
    }

    const found = await db.getUserByPasscode(passcode);
    if (!found) {
      await db.recordLoginAttempt(ip, false);
      const left = MAX_FAILS - fails - 1;
      return NextResponse.json({
        error: left > 0 && left <= 3 ? `รหัสไม่ถูกต้อง (เหลืออีก ${left} ครั้งก่อนถูกล็อกชั่วคราว)` : "รหัสไม่ถูกต้อง",
      }, { status: 401 });
    }

    const { user, mustSetPasscode } = found;
    await db.recordLoginAttempt(ip, true);

    const token = await signSession({
      userId: user.id, name: user.name, role: user.role, branchScope: user.branchScope,
      ...(mustSetPasscode ? { mustSetPasscode: true } : {}),
    });
    const res = NextResponse.json({ ok: true, user, mustSetPasscode });
    res.cookies.set(SESSION_COOKIE, token, {
      httpOnly: true, sameSite: "lax", path: "/", secure: process.env.NODE_ENV === "production",
      maxAge: 12 * 3600,
    });
    await writeAudit(
      { userId: user.id, name: user.name, role: user.role, branchScope: user.branchScope, exp: 0 },
      "login",
      { detail: mustSetPasscode ? "เข้าสู่ระบบด้วยรหัสตั้งค่าครั้งแรก" : "เข้าสู่ระบบ" }
    );
    return res;
  } catch (e: any) {
    return NextResponse.json({ error: e?.message ?? "login failed" }, { status: 500 });
  }
}
