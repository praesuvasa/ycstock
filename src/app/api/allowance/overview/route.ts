import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireAdmin, authErrorResponse } from "@/lib/authz";
import { monthKeyOf } from "@/lib/calc";
import { todayISO } from "@/lib/fmt";

export const dynamic = "force-dynamic";

const isMonth = (v: unknown): v is string => typeof v === "string" && /^\d{4}-\d{2}$/.test(v);

// GET /api/allowance/overview?month=YYYY-MM → { summaries, needsReview } (admin เท่านั้น)
export async function GET(req: Request) {
  try {
    await requireAdmin();
    const { searchParams } = new URL(req.url);
    const month = searchParams.get("month") ?? monthKeyOf(todayISO());
    if (!isMonth(month)) return NextResponse.json({ error: "month ไม่ถูกต้อง (YYYY-MM)" }, { status: 400 });

    const { summaries, needsReview } = await db.getAllowanceOverview(month);
    // แนบ signed url ให้เฉพาะบิลที่ต้องตรวจ — ไม่ต้องเสียเวลา sign ทุกบิลในเดือน
    const withUrls = await Promise.all(
      needsReview.map(async (r) => ({
        ...r,
        imageUrl: r.imagePath ? ((await db.getEvidenceSignedUrl(r.imagePath)) ?? undefined) : undefined,
      }))
    );
    return NextResponse.json({ month, summaries, needsReview: withUrls });
  } catch (e) {
    const a = authErrorResponse(e);
    return NextResponse.json(a ? a.body : { error: (e as any)?.message ?? "getAllowanceOverview failed" }, { status: a ? a.status : 500 });
  }
}
