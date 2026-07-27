import { NextResponse } from "next/server";
import { getSession } from "@/lib/authz";
import { db } from "@/lib/db";

export const dynamic = "force-dynamic";

export async function GET() {
  const s = await getSession();
  if (!s) return NextResponse.json({ user: null }, { status: 401 });
  // allowanceEnabled อ่านสดจาก DB ทุกครั้ง ไม่เก็บใน session — แอดมินเปิด/ปิดสิทธิ์แล้วมีผลทันที
  // ไม่ต้องรอพนักงาน logout เข้าใหม่ (session cookie อายุยาว กว่าจะหมดอาจเป็นสัปดาห์)
  let allowanceEnabled = false;
  try {
    allowanceEnabled = !!(await db.listUsers()).find((u) => u.id === s.userId)?.allowanceEnabled;
  } catch {
    // อ่านไม่ได้ = ถือว่ายังไม่ได้รับสิทธิ์ (ซ่อนเมนู) ดีกว่าโชว์เมนูที่กดแล้วพัง
  }
  return NextResponse.json({
    user: { id: s.userId, name: s.name, role: s.role, branchScope: s.branchScope, allowanceEnabled },
  });
}
