// Authorization helpers — เรียกใน BFF route handlers (Node) เพื่อบังคับสิทธิ์จริง
import { cookies } from "next/headers";
import type { Branch, Session } from "./types";
import { SESSION_COOKIE, verifySession } from "./session";

export class AuthError extends Error {
  status: number;
  constructor(message: string, status: number) { super(message); this.status = status; }
}

/** อ่าน session จาก cookie (route handler / server component) */
export async function getSession(): Promise<Session | null> {
  const token = cookies().get(SESSION_COOKIE)?.value;
  return verifySession(token);
}

export async function requireSession(): Promise<Session> {
  const s = await getSession();
  if (!s) throw new AuthError("ยังไม่ได้ล็อกอิน", 401);
  return s;
}

export async function requireAdmin(): Promise<Session> {
  const s = await requireSession();
  if (s.role !== "admin") throw new AuthError("เฉพาะ Admin เท่านั้น", 403);
  return s;
}

/** ใช้กับหน้า/API ที่ role "restock" เข้าได้ด้วย (นอกเหนือจาก admin) — เช่น /api/restock, /api/meta ที่หน้า restock ต้องใช้ */
export async function requireAdminOrRestock(): Promise<Session> {
  const s = await requireSession();
  if (s.role !== "admin" && s.role !== "restock") throw new AuthError("ไม่มีสิทธิ์เข้าถึงส่วนนี้", 403);
  return s;
}

/** คืน branch ที่ใช้ได้จริงตาม scope; ถ้า user ขอสาขาอื่น → 403 */
export function resolveBranch(session: Session, requested: Branch | null): Branch {
  if (session.branchScope === "all") {
    if (!requested) throw new AuthError("ต้องระบุสาขา", 400);
    return requested;
  }
  // ผูกสาขาเดียว: บังคับเป็นของตัวเอง; ขอสาขาอื่น = ปฏิเสธ
  if (requested && requested !== session.branchScope) throw new AuthError("ไม่มีสิทธิ์เข้าถึงสาขานี้", 403);
  return session.branchScope as Branch;
}

/** user แก้ย้อนหลังได้ ≤ 3 วัน (สต็อกและยอดขาย); admin ไม่จำกัด */
export function assertCanEditDate(session: Session, date: string): void {
  if (session.role === "admin") return;
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const d = new Date(date + "T00:00:00");
  const diffDays = Math.round((today.getTime() - d.getTime()) / 86400_000);
  if (diffDays < 0) throw new AuthError("แก้ข้อมูลวันในอนาคตไม่ได้", 422);
  if (diffDays > 3) throw new AuthError("พนักงานแก้ย้อนหลังได้ไม่เกิน 3 วัน", 422);
}

/** map AuthError → NextResponse-friendly */
export function authErrorResponse(e: unknown): { body: { error: string }; status: number } | null {
  if (e instanceof AuthError) return { body: { error: e.message }, status: e.status };
  return null;
}
