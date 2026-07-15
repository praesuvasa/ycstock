import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

// วินิจฉัยการเชื่อมต่อ Supabase — ไม่เผย secret (mask url, ไม่โชว์ key)
export async function GET() {
  const url = process.env.SUPABASE_URL || "";
  const host = url.replace(/^https?:\/\//, "").split(".")[0]; // project ref เท่านั้น
  const out: Record<string, unknown> = {
    useSupabase: process.env.USE_SUPABASE ?? "(unset)",
    projectRef: host || "(no SUPABASE_URL)",
    hasServiceKey: !!process.env.SUPABASE_SERVICE_ROLE_KEY,
    serviceKeyLen: (process.env.SUPABASE_SERVICE_ROLE_KEY || "").length,
  };
  try {
    const { createClient } = await import("@supabase/supabase-js");
    const sb = createClient(url, process.env.SUPABASE_SERVICE_ROLE_KEY || "", { auth: { persistSession: false } });
    const items = await sb.from("items").select("*", { count: "exact", head: true });
    out.itemsCount = items.count;
    out.itemsError = items.error?.message ?? null;
    const par = await sb.from("par_levels").select("*", { count: "exact", head: true });
    out.parCount = par.count;
    out.parError = par.error?.message ?? null;
    const stock = await sb.from("stock_daily").select("*", { count: "exact", head: true });
    out.stockCount = stock.count;
    out.stockError = stock.error?.message ?? null;
    const sample = await sb.from("items").select("id,name").limit(3);
    out.itemsSample = sample.data;
    out.itemsSampleError = sample.error?.message ?? null;
  } catch (e: any) {
    out.exception = e?.message ?? String(e);
  }
  return NextResponse.json(out);
}
