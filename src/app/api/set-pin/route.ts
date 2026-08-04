import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireSession, authErrorResponse } from "@/lib/authz";
import { signSession, SESSION_COOKIE } from "@/lib/session";
import { validatePin } from "@/lib/auth";
import { writeAudit } from "@/lib/audit";

export const dynamic = "force-dynamic";

// POST /api/set-pin { newPin, confirmPin } → ตั้งรหัสของ "ตัวเอง" เท่านั้น
//
// ไม่รับ userId จาก client เด็ดขาด — ใช้ session ของคนที่ล็อกอินอยู่
// (ถ้ารับ userId เท่ากับเปิดให้ใครก็ได้เปลี่ยนรหัสคนอื่น)
export async function POST(req: Request) {
  try {
    const s = await requireSession();
    const body = await req.json();
    const newPin = String(body?.newPin ?? "");
    const confirmPin = String(body?.confirmPin ?? "");

    if (newPin !== confirmPin) return NextResponse.json({ error: "รหัสสองช่องไม่ตรงกัน" }, { status: 400 });
    const invalid = validatePin(newPin);
    if (invalid) return NextResponse.json({ error: invalid }, { status: 400 });

    const result = await db.setOwnPasscode(s.userId, newPin);
    if (!result.ok) {
      // ไม่บอกว่าซ้ำกับใคร — ไม่งั้นกลายเป็นบอกใบ้รหัสของเพื่อนร่วมงาน
      return NextResponse.json({ error: "รหัสนี้ใช้ไม่ได้ ลองเลขอื่น" }, { status: 409 });
    }

    // ออก session ใหม่ที่ไม่มี mustSetPasscode แล้ว — ไม่งั้นจะโดน middleware เด้งกลับมาหน้านี้ตลอด
    const token = await signSession({
      userId: s.userId, name: s.name, role: s.role, branchScope: s.branchScope,
    });
    const res = NextResponse.json({ ok: true });
    res.cookies.set(SESSION_COOKIE, token, {
      httpOnly: true, sameSite: "lax", path: "/", secure: process.env.NODE_ENV === "production",
      maxAge: 12 * 3600,
    });
    // บันทึกแค่ว่า "เปลี่ยนแล้ว" ไม่เก็บตัวรหัสลงที่ไหนทั้งสิ้น
    await writeAudit(s, "set_passcode", { detail: "ตั้งรหัสเข้าระบบด้วยตัวเอง" });
    return res;
  } catch (e) {
    const a = authErrorResponse(e);
    // เหมือน /api/login — error ที่ไม่ใช่ AuthError (เช่น DB ล่ม) ไม่ส่ง e.message ดิบออกไปหน้าจอ
    if (!a) console.error("[set-pin] unexpected error:", e);
    return NextResponse.json(a ? a.body : { error: "ตั้งรหัสไม่สำเร็จ ลองใหม่อีกครั้ง" }, { status: a ? a.status : 500 });
  }
}
