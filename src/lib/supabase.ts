// Supabase-backed store (production path, USE_SUPABASE=1). เข้าถึงจาก BFF เท่านั้น
import { createClient, SupabaseClient } from "@supabase/supabase-js";
import type { Branch, StockRow, SalesRow, CupRow, RestockRow, Meta, CupSize, Item, ParMap } from "./types";
import { BRANCHES } from "./types";
import { variance, restockNeed, isSpecialActive } from "./calc";

// สร้าง client สดทุกครั้ง (แบบเดียวกับ /api/debug ที่พิสูจน์แล้วว่าอ่านได้ครบ) — เลี่ยง singleton ที่อาจถูก init ตอน env ยังไม่พร้อม
function sb(): SupabaseClient {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("Supabase env missing (SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY)");
  return createClient(url, key, { auth: { persistSession: false } });
}

const sizes: CupSize[] = ["P", "S", "BOWL", "14OZ"];

export const supabaseStore = {
  async getMeta(): Promise<Meta> {
    const itemsRes = await sb()
      .from("items")
      .select("id,name,category,unit,is_special,is_cup,cup_size,has_remainder,grams_per_uom,remainder_group,sort");
    if (itemsRes.error) throw new Error("query items: " + itemsRes.error.message);
    const parsRes = await sb().from("par_levels").select("item_id,branch_id,level");
    if (parsRes.error) throw new Error("query par_levels: " + parsRes.error.message);
    const items = (itemsRes.data ?? []).slice().sort((a: any, b: any) => (a.sort ?? 0) - (b.sort ?? 0));
    const pars = parsRes.data;
    const mapped: Item[] = items.map((r: any) => ({
      id: r.id, name: r.name, category: r.category, unit: r.unit,
      isSpecial: r.is_special, isCup: r.is_cup, cupSize: r.cup_size ?? undefined,
      hasRemainder: r.has_remainder, gramsPerUOM: Number(r.grams_per_uom ?? 0),
      remainderGroup: r.remainder_group ?? undefined, sort: r.sort,
    }));
    const par: ParMap = {};
    for (const it of mapped) par[it.id] = { SND: null, NVP: null };
    for (const p of pars ?? []) {
      if (!par[p.item_id]) par[p.item_id] = { SND: null, NVP: null };
      (par[p.item_id] as any)[p.branch_id] = p.level;
    }
    return { branches: BRANCHES, items: mapped, par };
  },

  async setItemConfig(itemId: string, cfg: { hasRemainder: boolean; gramsPerUOM: number; remainderGroup?: string }) {
    const { error } = await sb()
      .from("items")
      .update({
        has_remainder: cfg.hasRemainder,
        grams_per_uom: cfg.gramsPerUOM,
        remainder_group: cfg.remainderGroup && cfg.remainderGroup.trim() ? cfg.remainderGroup.trim() : null,
      })
      .eq("id", itemId);
    if (error) throw error;
    return { ok: true };
  },

  async getStock(branch: Branch, date: string): Promise<StockRow[]> {
    const { items, par } = await this.getMeta();
    const { data: saved } = await sb().from("stock_daily")
      .select("*").eq("branch_id", branch).eq("date", date);
    const savedMap = new Map((saved ?? []).map((r: any) => [r.item_id, r]));
    // previous day remains (latest before date) per item
    const { data: prev } = await sb().from("stock_daily")
      .select("item_id,remain_pack,remain_g,date").eq("branch_id", branch).lt("date", date).order("date");
    const prevMap = new Map<string, any>();
    for (const r of prev ?? []) prevMap.set(r.item_id, r); // last wins (ordered asc)
    return items.map((it) => {
      const s = savedMap.get(it.id) as any;
      if (s) return rowFromDb(s);
      const p = prevMap.get(it.id);
      const carryPack = p?.remain_pack ?? 0, carryG = p?.remain_g ?? 0;
      return { itemId: it.id, carryPack, carryG, inPack: 0, inG: 0, used: 0,
        remainPack: carryPack, remainG: carryG, returned: 0, note: "", variance: 0 };
    });
  },

  async saveStock(branch: Branch, date: string, rows: StockRow[]) {
    const payload = rows.map((r) => ({
      date, branch_id: branch, item_id: r.itemId,
      carry_pack: r.carryPack, carry_g: r.carryG, in_pack: r.inPack, in_g: r.inG,
      used: r.used, remain_pack: r.remainPack, remain_g: r.remainG, returned: r.returned,
      note: r.note, variance: variance(r.carryPack, r.inPack, r.used, r.returned, r.remainPack),
    }));
    const { error } = await sb().from("stock_daily").upsert(payload, { onConflict: "date,branch_id,item_id" });
    if (error) throw error;
    return { ok: true, updated: 0, inserted: payload.length };
  },

  async getRestock(branch: Branch, weekday: "wed" | "sat") {
    const { items, par } = await this.getMeta();
    const active = isSpecialActive(branch, weekday);
    const { data: latest } = await sb().from("stock_daily")
      .select("item_id,remain_pack,date").eq("branch_id", branch).order("date");
    const remainMap = new Map<string, number>();
    for (const r of latest ?? []) remainMap.set(r.item_id, r.remain_pack);
    const rows: RestockRow[] = [];
    for (const it of items) {
      const p = par[it.id]?.[branch] ?? null;
      if (p == null) continue;
      if (it.isSpecial && !active) continue;
      const remain = remainMap.get(it.id) ?? 0;
      rows.push({ itemId: it.id, name: it.name, category: it.category, unit: it.unit,
        par: p, remain, need: restockNeed(p, remain), isSpecial: it.isSpecial });
    }
    return { rows, specialActive: active };
  },

  async getSales(branch: Branch, date: string): Promise<SalesRow> {
    const { data } = await sb().from("sales_daily").select("*").eq("branch_id", branch).eq("date", date).maybeSingle();
    if (!data) return { cash: 0, qr: 0, edc: 0, grab: 0, lineman: 0 };
    return { cash: data.cash, qr: data.qr, edc: data.edc, grab: data.grab, lineman: data.lineman };
  },

  async saveSales(branch: Branch, date: string, row: SalesRow) {
    const { error } = await sb().from("sales_daily")
      .upsert({ date, branch_id: branch, ...row }, { onConflict: "date,branch_id" });
    if (error) throw error;
    return { ok: true };
  },

  async getCups(branch: Branch, date: string): Promise<CupRow[]> {
    const { data } = await sb().from("cup_reconcile").select("*").eq("branch_id", branch).eq("date", date);
    const map = new Map((data ?? []).map((r: any) => [r.size, r]));
    return sizes.map((size) => {
      const r = map.get(size) as any;
      return r ? { size, start: r.start_qty, in: r.in_qty, remain: r.remain_qty, sold: r.sold_qty }
               : { size, start: 0, in: 0, remain: 0, sold: 0 };
    });
  },

  async saveCups(branch: Branch, date: string, rows: CupRow[]) {
    const payload = rows.map((r) => ({
      date, branch_id: branch, size: r.size,
      start_qty: r.start, in_qty: r.in, remain_qty: r.remain, sold_qty: r.sold,
    }));
    const { error } = await sb().from("cup_reconcile").upsert(payload, { onConflict: "date,branch_id,size" });
    if (error) throw error;
    return { ok: true };
  },

  async getDashboard(date: string) {
    const { items, par } = await this.getMeta();
    const lowStock: { branch: Branch; item: string; remain: number; par: number }[] = [];
    const salesToday: { branch: Branch; total: number }[] = [];
    const varianceAlerts: { branch: Branch; count: number }[] = [];
    for (const b of BRANCHES) {
      const { data: latest } = await sb().from("stock_daily")
        .select("item_id,remain_pack,variance,date").eq("branch_id", b).lte("date", date).order("date");
      const remainMap = new Map<string, number>();
      for (const r of latest ?? []) remainMap.set(r.item_id, r.remain_pack);
      for (const it of items) {
        const p = par[it.id]?.[b] ?? null;
        if (p == null) continue;
        const remain = remainMap.get(it.id) ?? 0;
        if (remain < p) lowStock.push({ branch: b, item: it.name, remain, par: p });
      }
      const { data: s } = await sb().from("sales_daily").select("*").eq("branch_id", b).eq("date", date).maybeSingle();
      const total = s ? s.cash + s.qr + s.edc + s.grab + s.lineman : 0;
      salesToday.push({ branch: b, total });
      const { data: vrows } = await sb().from("stock_daily")
        .select("variance").eq("branch_id", b).eq("date", date).neq("variance", 0);
      varianceAlerts.push({ branch: b, count: (vrows ?? []).length });
    }
    return { lowStock, salesToday, varianceAlerts };
  },
};

function rowFromDb(s: any): StockRow {
  return {
    itemId: s.item_id, carryPack: s.carry_pack, carryG: s.carry_g, inPack: s.in_pack, inG: s.in_g,
    used: s.used, remainPack: s.remain_pack, remainG: s.remain_g, returned: s.returned,
    note: s.note ?? "", variance: s.variance,
  };
}
