// Supabase-backed store (production path, USE_SUPABASE=1). เข้าถึงจาก BFF เท่านั้น
import { createClient, SupabaseClient } from "@supabase/supabase-js";
import type { Branch, StockRow, SalesRow, CupRow, RestockRow, Meta, CupSize, Item, ParMap, User, Role, BranchScope, AuditEntry, Weekday, Requisition, RestockSelectionEntry, RestockSelectionLatestRow } from "./types";
import { BRANCHES } from "./types";
import { variance, restockNeed, isSpecialActive } from "./calc";
import { verifyPasscode, hashPasscode } from "./auth";

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
      .select("id,name,category,unit,is_special,is_cup,cup_size,has_remainder,grams_per_uom,remainder_group,sort,check_frequency,show_remainder");
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
      checkFrequency: r.check_frequency ?? "daily", showRemainderOnRestock: r.show_remainder ?? false,
    }));
    const par: ParMap = {};
    for (const it of mapped) par[it.id] = Object.fromEntries(BRANCHES.map((b) => [b, null]));
    for (const p of pars ?? []) {
      if (!par[p.item_id]) par[p.item_id] = Object.fromEntries(BRANCHES.map((b) => [b, null]));
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
        remainPack: carryPack, remainG: carryG, returned: 0, note: "", variance: 0, hasEntry: false };
    });
  },

  async saveStock(branch: Branch, date: string, rows: StockRow[]) {
    const payload = rows.map((r) => ({
      date, branch_id: branch, item_id: r.itemId,
      carry_pack: r.carryPack, carry_g: r.carryG, in_pack: r.inPack, in_g: r.inG,
      used: r.used, remain_pack: r.remainPack, remain_g: r.remainG, returned: r.returned,
      returned_g: r.returnedG ?? 0,
      note: r.note, variance: variance(r.carryPack, r.inPack, r.used, r.returned, r.remainPack),
    }));
    const { error } = await sb().from("stock_daily").upsert(payload, { onConflict: "date,branch_id,item_id" });
    if (error) throw error;
    return { ok: true, updated: 0, inserted: payload.length };
  },

  async getRestock(branch: Branch, weekday: Weekday) {
    const { items, par } = await this.getMeta();
    const active = isSpecialActive(branch, weekday);
    // ดึงคงเหลือปัจจุบันจาก getStock (carry-forward ให้แล้ว) — ใช้ตรรกะเดียวกับหน้ากรอกสต็อก
    const today = new Date().toISOString().slice(0, 10);
    const stock = await this.getStock(branch, today);
    const remainMap = new Map<string, number>(stock.map((s) => [s.itemId, s.remainPack]));
    const remainGMap = new Map<string, number>(stock.map((s) => [s.itemId, s.remainG]));
    const rows: RestockRow[] = [];
    for (const it of items) {
      const p = par[it.id]?.[branch] ?? null;
      if (p == null) continue;
      if (it.isSpecial && !active) continue;
      const remain = remainMap.get(it.id) ?? 0;
      rows.push({ itemId: it.id, name: it.name, category: it.category, unit: it.unit,
        par: p, remain, need: restockNeed(p, remain), isSpecial: it.isSpecial,
        remainG: it.showRemainderOnRestock ? (remainGMap.get(it.id) ?? 0) : undefined,
        isCup: it.isCup || undefined });
    }
    return { rows, specialActive: active };
  },

  // สรุปรายการที่ "รับเข้า" (in_pack/in_g > 0) ของวันนั้น — ใช้หน้าประวัติสินค้าเข้า
  async getStockIn(branch: Branch, date: string) {
    const { items } = await this.getMeta();
    const itemById = new Map(items.map((it) => [it.id, it]));
    const { data, error } = await sb().from("stock_daily")
      .select("item_id,in_pack,in_g")
      .eq("branch_id", branch).eq("date", date)
      .or("in_pack.gt.0,in_g.gt.0");
    if (error) throw error;
    const rows = (data ?? [])
      .map((r: any) => {
        const it = itemById.get(r.item_id);
        if (!it) return null;
        return { itemId: it.id, name: it.name, category: it.category, unit: it.unit, inPack: r.in_pack, inG: r.in_g, sort: it.sort };
      })
      .filter((r): r is { itemId: string; name: string; category: string; unit: string; inPack: number; inG: number; sort: number } => r !== null)
      .sort((a, b) => a.sort - b.sort)
      .map(({ sort, ...rest }) => rest);
    return rows;
  },

  // N วันล่าสุด (รวมวันนี้) + จำนวนรายการที่มีของเข้าวันนั้น — ใช้เป็น quick-list ในหน้าประวัติสินค้าเข้า
  async getRecentStockInDays(branch: Branch, days: number) {
    const since = new Date();
    since.setDate(since.getDate() - (days - 1));
    const sinceIso = since.toISOString().slice(0, 10);
    const { data, error } = await sb().from("stock_daily")
      .select("date,in_pack,in_g")
      .eq("branch_id", branch).gte("date", sinceIso)
      .or("in_pack.gt.0,in_g.gt.0");
    if (error) throw error;
    const counts = new Map<string, number>();
    for (const r of data ?? []) counts.set(r.date, (counts.get(r.date) ?? 0) + 1);
    const out: { date: string; count: number }[] = [];
    const today = new Date();
    for (let i = 0; i < days; i++) {
      const d = new Date(today);
      d.setDate(d.getDate() - i);
      const iso = d.toISOString().slice(0, 10);
      out.push({ date: iso, count: counts.get(iso) ?? 0 });
    }
    return out;
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
    // ตั้งต้น/รับเข้า/คงเหลือ ดึงจากยอดถ้วยในหน้าสต็อก · sold กรอกเองที่หน้า reconcile
    const meta = await this.getMeta();
    const stockById = new Map((await this.getStock(branch, date)).map((s) => [s.itemId, s]));
    const { data } = await sb().from("cup_reconcile").select("size,sold_qty").eq("branch_id", branch).eq("date", date);
    const soldMap = new Map((data ?? []).map((r: any) => [r.size as CupSize, Number(r.sold_qty)]));
    return sizes.map((size) => {
      const it = meta.items.find((i) => i.isCup && i.cupSize === size);
      const s = it ? stockById.get(it.id) : undefined;
      const conv = it?.gramsPerUOM || 50;
      const start = s ? s.carryPack * conv + s.carryG : 0;
      const inQ = s ? s.inPack * conv + s.inG : 0;
      const remain = s ? s.remainPack * conv + s.remainG : 0;
      return { size, start, in: inQ, remain, sold: soldMap.get(size) ?? 0 };
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

  // ── auth / users ──
  async getUserByPasscode(pin: string): Promise<User | null> {
    const { data } = await sb().from("users").select("*").eq("active", true);
    for (const r of data ?? []) {
      if (verifyPasscode(pin, r.passcode_hash)) {
        return { id: r.id, name: r.name, role: r.role, branchScope: r.branch_scope, active: r.active };
      }
    }
    return null;
  },
  async listUsers(): Promise<User[]> {
    const { data } = await sb().from("users").select("id,name,role,branch_scope,active").order("created_at");
    return (data ?? []).map((r: any) => ({ id: r.id, name: r.name, role: r.role, branchScope: r.branch_scope, active: r.active }));
  },
  async createUser(input: { name: string; role: Role; branchScope: BranchScope; passcode: string; createdBy: string }): Promise<User> {
    const id = "u-" + Math.abs(Date.now() % 1_000_000).toString(36);
    const { error } = await sb().from("users").insert({
      id, name: input.name, role: input.role, branch_scope: input.branchScope,
      passcode_hash: hashPasscode(input.passcode), active: true, created_by: input.createdBy,
    });
    if (error) throw error;
    return { id, name: input.name, role: input.role, branchScope: input.branchScope, active: true };
  },
  async updateUser(id: string, patch: { name?: string; role?: Role; branchScope?: BranchScope; active?: boolean; passcode?: string }): Promise<User | null> {
    const upd: any = {};
    if (patch.name !== undefined) upd.name = patch.name;
    if (patch.role !== undefined) upd.role = patch.role;
    if (patch.branchScope !== undefined) upd.branch_scope = patch.branchScope;
    if (patch.active !== undefined) upd.active = patch.active;
    if (patch.passcode) upd.passcode_hash = hashPasscode(patch.passcode);
    const { data, error } = await sb().from("users").update(upd).eq("id", id).select("id,name,role,branch_scope,active").maybeSingle();
    if (error) throw error;
    if (!data) return null;
    return { id: data.id, name: data.name, role: data.role, branchScope: data.branch_scope, active: data.active };
  },

  // ── ขอเบิกสินค้า (ไม่มีสถานะ แค่ log ให้ restock/admin กวาดดู) ──
  async createRequisition(input: Omit<Requisition, "id" | "createdAt">): Promise<Requisition> {
    const { data, error } = await sb().from("requisitions").insert({
      branch_id: input.branch, item_id: input.itemId ?? null, item_name: input.itemName,
      qty: input.qty, unit: input.unit ?? null, note: input.note,
      requested_by: input.requestedBy, requested_by_user_id: input.requestedByUserId,
    }).select().single();
    if (error) throw error;
    return rowFromReqDb(data);
  },
  async listRequisitions(filter: { userId?: string; branch?: string; limit?: number }): Promise<Requisition[]> {
    let q = sb().from("requisitions").select("*").order("created_at", { ascending: false }).limit(filter.limit ?? 100);
    if (filter.userId) q = q.eq("requested_by_user_id", filter.userId);
    if (filter.branch) q = q.eq("branch_id", filter.branch);
    const { data, error } = await q;
    if (error) throw error;
    return (data ?? []).map(rowFromReqDb);
  },
  async countUnseenRequisitions(): Promise<number> {
    const { count, error } = await sb().from("requisitions").select("id", { count: "exact", head: true }).is("seen_at", null);
    if (error) throw error;
    return count ?? 0;
  },
  async markAllRequisitionsSeen(): Promise<void> {
    const { error } = await sb().from("requisitions").update({ seen_at: new Date().toISOString() }).is("seen_at", null);
    if (error) throw error;
  },

  // ── ตัวเลือกเติมของ (v1.4) ──
  async getRestockSelections(branch: Branch, date: string): Promise<Record<string, { selected: boolean; qty: number }>> {
    const { data, error } = await sb().from("restock_selections")
      .select("item_id,selected,qty").eq("branch_id", branch).eq("date", date);
    if (error) throw error;
    const out: Record<string, { selected: boolean; qty: number }> = {};
    for (const r of data ?? []) out[r.item_id] = { selected: r.selected, qty: Number(r.qty) };
    return out;
  },

  async saveRestockSelections(branch: Branch, date: string, entries: RestockSelectionEntry[], userId: string, userName: string) {
    const now = new Date().toISOString();
    const payload = entries.map((e) => ({
      date, branch_id: branch, item_id: e.itemId,
      selected: e.selected, qty: e.qty,
      updated_by_user_id: userId, updated_by_name: userName, updated_at: now,
    }));
    const { error } = await sb().from("restock_selections").upsert(payload, { onConflict: "date,branch_id,item_id" });
    if (error) throw error;
    return { ok: true, savedCount: payload.length };
  },

  // โหมดสั่งผลิต: ค่าล่าสุดต่อ (สาขา,ไอเทม) ไม่ผูกวันที่เดียว (แต่ละสาขา restock คนละวันได้)
  // reduce แบบเดียวกับ getStock's prevMap — query ที่ selected=true เรียง date,updated_at asc แล้วให้ตัวหลังทับตัวก่อน (last wins = ค่าล่าสุดจริง)
  // ตัดช่วงย้อนหลัง 90 วันกันตารางโตไม่จำกัด — ต้องกรองด้วย date ไม่ใช่ .limit() เฉยๆ เพราะ order เป็น ascending
  // (limit หลัง ascending จะตัดแถวเก่าสุดออกจากผลลัพธ์ ไม่ใช่แถวใหม่สุด — ถ้าข้อมูลเกิน limit จะได้ค่าเก่าแทนค่าล่าสุดซึ่งผิดจุดประสงค์)
  async getLatestRestockSelections(): Promise<RestockSelectionLatestRow[]> {
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - 90);
    const cutoffIso = cutoff.toISOString().slice(0, 10);
    const { data, error } = await sb().from("restock_selections")
      .select("item_id,branch_id,qty,date,updated_at")
      .eq("selected", true)
      .gte("date", cutoffIso)
      .order("date", { ascending: true })
      .order("updated_at", { ascending: true });
    if (error) throw error;
    const map = new Map<string, RestockSelectionLatestRow>();
    for (const r of data ?? []) {
      map.set(r.item_id + "|" + r.branch_id, {
        itemId: r.item_id, branch: r.branch_id as Branch, qty: Number(r.qty), date: r.date, updatedAt: r.updated_at,
      });
    }
    return [...map.values()];
  },

  // ── audit ──
  async writeAudit(e: Omit<AuditEntry, "id" | "ts">): Promise<void> {
    await sb().from("audit_log").insert({
      user_id: e.userId, user_name: e.userName, action: e.action,
      branch: e.branch, date: e.date, entity: e.entity, detail: e.detail,
    });
  },
  async listAudit(filter: { userId?: string; branch?: string; action?: string; limit?: number }): Promise<AuditEntry[]> {
    let q = sb().from("audit_log").select("*").order("ts", { ascending: false }).limit(filter.limit ?? 200);
    if (filter.userId) q = q.eq("user_id", filter.userId);
    if (filter.branch) q = q.eq("branch", filter.branch);
    if (filter.action) q = q.eq("action", filter.action);
    const { data } = await q;
    return (data ?? []).map((r: any) => ({
      id: String(r.id), ts: r.ts, userId: r.user_id, userName: r.user_name,
      action: r.action, branch: r.branch, date: r.date, entity: r.entity, detail: r.detail ?? "",
    }));
  },
};

function rowFromReqDb(r: any): Requisition {
  return {
    id: String(r.id), branch: r.branch_id, itemId: r.item_id ?? undefined, itemName: r.item_name,
    qty: Number(r.qty), unit: r.unit ?? undefined, note: r.note ?? "",
    requestedBy: r.requested_by, requestedByUserId: r.requested_by_user_id, createdAt: r.created_at,
    seenAt: r.seen_at ?? undefined,
  };
}

function rowFromDb(s: any): StockRow {
  return {
    itemId: s.item_id, carryPack: s.carry_pack, carryG: s.carry_g, inPack: s.in_pack, inG: s.in_g,
    used: s.used, remainPack: s.remain_pack, remainG: s.remain_g, returned: s.returned,
    returnedG: s.returned_g ?? 0,
    note: s.note ?? "", variance: s.variance, hasEntry: true,
  };
}
