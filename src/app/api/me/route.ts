import { NextResponse } from "next/server";
import { getSession } from "@/lib/authz";

export const dynamic = "force-dynamic";

export async function GET() {
  const s = await getSession();
  if (!s) return NextResponse.json({ user: null }, { status: 401 });
  return NextResponse.json({ user: { id: s.userId, name: s.name, role: s.role, branchScope: s.branchScope } });
}
