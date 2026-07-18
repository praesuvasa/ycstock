import { NextResponse, type NextRequest } from "next/server";
import { SESSION_COOKIE, verifySession } from "@/lib/session";

// หน้าที่ user (พนักงาน) เข้าได้ · restock (จนท. Restock) เข้าได้แค่ /restock · ที่เหลือ admin-only
const USER_PAGES = ["/stock", "/stock-in", "/sales", "/requisitions"];
const RESTOCK_PAGES = ["/restock", "/requisitions"];
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
    url.searchParams.set("from", pathname);
    return NextResponse.redirect(url);
  }

  // coarse gate: user/restock เข้าได้แค่หน้าที่กำหนด (ด่านละเอียดอยู่ที่ BFF)
  if (session.role === "user" && !isApi) {
    const allowed = USER_PAGES.some((p) => pathname === p || pathname.startsWith(p + "/"));
    if (!allowed) {
      const url = req.nextUrl.clone();
      url.pathname = "/stock";
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
