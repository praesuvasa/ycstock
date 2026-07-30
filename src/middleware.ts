import { NextResponse, type NextRequest } from "next/server";
import { SESSION_COOKIE, verifySession } from "@/lib/session";

// หน้าที่ user (พนักงาน) เข้าได้ · restock (จนท. Restock) เข้าได้แค่ /restock · ที่เหลือ admin-only
const USER_PAGES = ["/", "/store", "/yogi", "/stock", "/stock-in", "/sales", "/cash-remittance", "/requisitions", "/confirm-receipt", "/returns", "/expiry", "/allowance", "/set-pin", "/feedback", "/time-clock", "/schedule"];
// /set-pin ต้องเข้าได้ทุก role — ทุกคนต้องเปลี่ยนรหัสตัวเองได้ ไม่งั้นเมนูมีแต่กดแล้วเด้งกลับ
const RESTOCK_PAGES = ["/restock", "/store", "/yogi", "/schedule", "/requisitions", "/set-pin", "/feedback", "/time-clock"];
const PUBLIC = ["/login", "/api/login"];

export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;
  if (PUBLIC.some((p) => pathname === p || pathname.startsWith(p + "/"))) return NextResponse.next();

  const session = await verifySession(req.cookies.get(SESSION_COOKIE)?.value);
  const isApi = pathname.startsWith("/api/");

  if (!session) {
    if (isApi) return NextResponse.json({ error: "ยังไม่ได้ล็อกอิน" }, { status: 401 });
    const url = req.nextUrl.clone();
    url.pathname = "/login";
    url.search = ""; // ไม่ต้องส่ง ?from= แล้ว — ล็อกอินเสร็จไปหน้าหลักเสมอ
    return NextResponse.redirect(url);
  }

  // เข้าด้วย "รหัสตั้งค่าครั้งแรก" — ต้องตั้ง PIN ของตัวเองก่อน ใช้หน้าอื่นไม่ได้เลย (v1.15)
  // ยกเว้น /api/set-pin (ต้องเรียกได้) กับ /api/me (nav โหลดชื่อคนมาโชว์)
  if (session.mustSetPasscode) {
    const allowedWhilePending = pathname === "/set-pin" || pathname === "/api/set-pin" || pathname === "/api/me" || pathname === "/api/logout";
    if (!allowedWhilePending) {
      if (isApi) return NextResponse.json({ error: "ต้องตั้งรหัสของคุณก่อน" }, { status: 403 });
      const url = req.nextUrl.clone();
      url.pathname = "/set-pin";
      url.search = "";
      return NextResponse.redirect(url);
    }
    return NextResponse.next();
  }

  // coarse gate: user/restock เข้าได้แค่หน้าที่กำหนด (ด่านละเอียดอยู่ที่ BFF)
  if (session.role === "user" && !isApi) {
    const allowed = USER_PAGES.some((p) => pathname === p || pathname.startsWith(p + "/"));
    if (!allowed) {
      const url = req.nextUrl.clone();
      url.pathname = "/"; // พนักงานเข้าหน้าที่ไม่มีสิทธิ์ → กลับหน้าหลัก ไม่ใช่หน้าสต็อก
      return NextResponse.redirect(url);
    }
  }
  if (session.role === "restock" && !isApi) {
    const allowed = RESTOCK_PAGES.some((p) => pathname === p || pathname.startsWith(p + "/"));
    if (!allowed) {
      const url = req.nextUrl.clone();
      url.pathname = "/restock";
      return NextResponse.redirect(url);
    }
  }
  return NextResponse.next();
}

export const config = {
  // ทุก route ยกเว้น static / _next / ไฟล์ที่มีนามสกุล
  matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\\.).*)"],
};
