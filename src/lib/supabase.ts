// Supabase-backed store (production path, USE_SUPABASE=1). เข้าถึงจาก BFF เท่านั้น
import { createClient, SupabaseClient } from "@supabase/supabase-js";
import type { Branch, StockRow, SalesRow, CupRow, RestockRow, Meta, CupSize, Item, ParMap, User, Role, BranchScope, AuditEntry, Weekday, Requisition, RestockSelectionEntry, ProductionOrder, ProductionOrderSummary, ProductionOrderItem, ProductionOrderItemInput, BranchNotice, SalesEvidence, EvidenceType, MatchStatus, CashRemittance } from "./types";
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
      .select("id,name,category,unit,is_special,is_cup,cup_size,has_remainder,grams_per_uom,remainder_group,sort,check_frequency,show_remainder,variable_yield");
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
      variableYield: r.variable_yield ?? false,
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
      // ไม่ตัด special ที่ไม่ถึงรอบออกอีกต่อไป — ส่งกลับมาให้หน้า UI แยกไปโชว์ในส่วน "สั่งฉุกเฉินนอกรอบ" แทน
      // (ใช้ active/specialActive ตัดสินใจแยกส่วนที่ฝั่ง frontend, ดู restock/page.tsx RestockByBranch)
      const remain = remainMap.get(it.id) ?? 0;
      rows.push({ itemId: it.id, name: it.name, category: it.category, unit: it.unit,
        par: p, remain, need: restockNeed(p, remain), isSpecial: it.isSpecial,
        remainG: it.showRemainderOnRestock ? (remainGMap.get(it.id) ?? 0) : undefined,
        isCup: it.isCup || undefined, hasVariableYield: it.variableYield || undefined });
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

  // ── ประกาศพิเศษ (v1.6) ──
  async listActiveNotices(branch: Branch): Promise<BranchNotice[]> {
    const { data, error } = await sb().from("branch_notices").select("*")
      .or(`branch_id.is.null,branch_id.eq.${branch}`).order("created_at", { ascending: false });
    if (error) throw error;
    return (data ?? []).map(rowFromNoticeDb);
  },
  async listAllNotices(): Promise<BranchNotice[]> {
    const { data, error } = await sb().from("branch_notices").select("*").order("created_at", { ascending: false });
    if (error) throw error;
    return (data ?? []).map(rowFromNoticeDb);
  },
  async createNotice(input: { branch: Branch | null; message: string }, userName: string): Promise<BranchNotice> {
    const { data, error } = await sb().from("branch_notices").insert({
      branch_id: input.branch, message: input.message, created_by: userName,
    }).select().single();
    if (error) throw error;
    return rowFromNoticeDb(data);
  },
  async deleteNotice(id: string): Promise<void> {
    const { error } = await sb().from("branch_notices").delete().eq("id", id);
    if (error) throw error;
  },

  // ── หลักฐานยอดขาย (v1.7) ──
  async uploadEvidenceImage(path: string, bytes: Buffer, contentType: string): Promise<void> {
    const { error } = await sb().storage.from("sales-evidence").upload(path, bytes, { contentType, upsert: true });
    if (error) throw error;
  },
  async getEvidenceSignedUrl(path: string): Promise<string | null> {
    const { data, error } = await sb().storage.from("sales-evidence").createSignedUrl(path, 900);
    if (error) return null;
    return data?.signedUrl ?? null;
  },
  async upsertSalesEvidence(input: {
    branch: Branch; date: string; type: EvidenceType; imagePath: string; enteredAmount: number;
    ocrAmount: number | null; ocrNameMatch: boolean | null; matchStatus: MatchStatus;
    ocrTxnRef: string | null; ocrTxnTime: string | null; duplicateNote: string | null; mismatchNote: string | null;
    userId: string; userName: string;
  }): Promise<SalesEvidence> {
    const { data, error } = await sb().from("sales_evidence").upsert({
      branch_id: input.branch, date: input.date, evidence_type: input.type, image_path: input.imagePath,
      entered_amount: input.enteredAmount, ocr_amount: input.ocrAmount, ocr_name_match: input.ocrNameMatch,
      match_status: input.matchStatus, ocr_txn_ref: input.ocrTxnRef, ocr_txn_time: input.ocrTxnTime,
      duplicate_note: input.duplicateNote, mismatch_note: input.mismatchNote,
      uploaded_by: input.userName, uploaded_by_user_id: input.userId,
      created_at: new Date().toISOString(),
    }, { onConflict: "branch_id,date,evidence_type" }).select().single();
    if (error) throw error;
    return rowFromEvidenceDb(data);
  },
  async listSalesEvidence(branch: Branch, date: string): Promise<SalesEvidence[]> {
    const { data, error } = await sb().from("sales_evidence").select("*").eq("branch_id", branch).eq("date", date);
    if (error) throw error;
    return (data ?? []).map(rowFromEvidenceDb);
  },
  // หาว่าเลขอ้างอิงนี้เคยถูกใช้ในหลักฐานอื่น (ต่างวัน/ต่างสาขา/ต่างช่องทาง) มาก่อนหรือไม่ — กันอัปโหลดเอกสารเดิมซ้ำ
  async findDuplicateEvidence(
    txnRef: string, excludeBranch: Branch, excludeDate: string, excludeType: EvidenceType
  ): Promise<{ branch: Branch; date: string; type: EvidenceType } | null> {
    const { data, error } = await sb().from("sales_evidence").select("branch_id,date,evidence_type")
      .eq("ocr_txn_ref", txnRef).limit(5);
    if (error) throw error;
    const hit = (data ?? []).find((r: any) => !(r.branch_id === excludeBranch && r.date === excludeDate && r.evidence_type === excludeType));
    return hit ? { branch: hit.branch_id, date: hit.date, type: hit.evidence_type } : null;
  },

  // ── การโอนเงินสด (v1.7) ──
  async listUnremittedCashDays(branch: Branch): Promise<{ date: string; cash: number }[]> {
    const { data: sales, error: e2 } = await sb().from("sales_daily").select("date,cash").eq("branch_id", branch).gt("cash", 0);
    if (e2) throw e2;
    const { data: covered, error: e3 } = await sb().from("cash_remittance_days").select("date").eq("branch_id", branch);
    if (e3) throw e3;
    const coveredSet = new Set((covered ?? []).map((r: any) => r.date));
    return (sales ?? [])
      .filter((r: any) => !coveredSet.has(r.date))
      .map((r: any) => ({ date: r.date, cash: Number(r.cash) }))
      .sort((a, b) => a.date.localeCompare(b.date));
  },
  async createCashRemittance(input: {
    branch: Branch; transferredAt: string; dates: string[]; declaredAmount: number; imagePath: string;
    ocrAmount: number | null; ocrNameMatch: boolean | null; matchStatus: MatchStatus;
    ocrTxnRef: string | null; ocrTxnTime: string | null; duplicateNote: string | null; mismatchNote: string | null;
    userId: string; userName: string;
  }): Promise<CashRemittance> {
    const { data, error } = await sb().from("cash_remittances").insert({
      branch_id: input.branch, transferred_at: input.transferredAt, declared_amount: input.declaredAmount,
      image_path: input.imagePath, ocr_amount: input.ocrAmount, ocr_name_match: input.ocrNameMatch,
      match_status: input.matchStatus, ocr_txn_ref: input.ocrTxnRef, ocr_txn_time: input.ocrTxnTime,
      duplicate_note: input.duplicateNote, mismatch_note: input.mismatchNote,
      uploaded_by: input.userName, uploaded_by_user_id: input.userId,
    }).select().single();
    if (error) throw error;
    const days = input.dates.map((d) => ({ remittance_id: data.id, branch_id: input.branch, date: d }));
    const { error: e2 } = await sb().from("cash_remittance_days").insert(days);
    if (e2) throw e2;
    return rowFromRemittanceDb(data, input.dates);
  },
  // หาว่าเลขอ้างอิงนี้เคยถูกใช้ในใบโอนอื่นมาก่อนหรือไม่
  async findDuplicateRemittance(txnRef: string): Promise<{ branch: Branch; transferredAt: string } | null> {
    const { data, error } = await sb().from("cash_remittances").select("branch_id,transferred_at")
      .eq("ocr_txn_ref", txnRef).limit(1);
    if (error) throw error;
    const hit = (data ?? [])[0];
    return hit ? { branch: hit.branch_id, transferredAt: hit.transferred_at } : null;
  },
  async listCashRemittances(branch: Branch, limit = 50): Promise<CashRemittance[]> {
    const { data, error } = await sb().from("cash_remittances").select("*").eq("branch_id", branch)
      .order("created_at", { ascending: false }).limit(limit);
    if (error) throw error;
    const rows = data ?? [];
    if (rows.length === 0) return [];
    const ids = rows.map((r: any) => r.id);
    const { data: days, error: e2 } = await sb().from("cash_remittance_days").select("remittance_id,date").in("remittance_id", ids);
    if (e2) throw e2;
    const byId = new Map<number, string[]>();
    for (const d of days ?? []) {
      const arr = byId.get(d.remittance_id) ?? [];
      arr.push(d.date);
      byId.set(d.remittance_id, arr);
    }
    return rows.map((r: any) => rowFromRemittanceDb(r, (byId.get(r.id) ?? []).sort()));
  },
  async deleteCashRemittance(id: string): Promise<void> {
    const { error } = await sb().from("cash_remittances").delete().eq("id", id);
    if (error) throw error;
  },

  // ── ตัวเลือกเติมของ (v1.4) ──
  async getRestockSelections(branch: Branch, date: string): Promise<Record<string, { selected: boolean; qty: number; qtyG: number }>> {
    const { data, error } = await sb().from("restock_selections")
      .select("item_id,selected,qty,qty_g").eq("branch_id", branch).eq("date", date);
    if (error) throw error;
    const out: Record<string, { selected: boolean; qty: number; qtyG: number }> = {};
    for (const r of data ?? []) out[r.item_id] = { selected: r.selected, qty: Number(r.qty), qtyG: Number(r.qty_g) };
    return out;
  },

  async saveRestockSelections(branch: Branch, date: string, entries: RestockSelectionEntry[], userId: string, userName: string) {
    const now = new Date().toISOString();
    const payload = entries.map((e) => ({
      date, branch_id: branch, item_id: e.itemId,
      selected: e.selected, qty: e.qty, qty_g: e.qtyG,
      updated_by_user_id: userId, updated_by_name: userName, updated_at: now,
    }));
    const { error } = await sb().from("restock_selections").upsert(payload, { onConflict: "date,branch_id,item_id" });
    if (error) throw error;
    return { ok: true, savedCount: payload.length };
  },

  // ── ใบสั่งผลิต (v1.5) ──
  async listProductionOrders(limit = 50): Promise<ProductionOrderSummary[]> {
    const { data, error } = await sb().from("production_orders")
      .select("id,order_date,delivery_date,note,created_by_name,created_at,updated_at")
      .order("order_date", { ascending: false }).order("created_at", { ascending: false }).limit(limit);
    if (error) throw error;
    const orders = data ?? [];
    if (orders.length === 0) return [];
    const ids = orders.map((o: any) => o.id);
    const { data: itemRows, error: e2 } = await sb().from("production_order_items")
      .select("order_id,confirmed").in("order_id", ids);
    if (e2) throw e2;
    const counts = new Map<number, { total: number; confirmed: number }>();
    for (const r of itemRows ?? []) {
      const c = counts.get(r.order_id) ?? { total: 0, confirmed: 0 };
      c.total++; if (r.confirmed) c.confirmed++;
      counts.set(r.order_id, c);
    }
    return orders.map((o: any) => ({
      id: o.id, orderDate: o.order_date, deliveryDate: o.delivery_date, note: o.note ?? "",
      itemCount: counts.get(o.id)?.total ?? 0, confirmedCount: counts.get(o.id)?.confirmed ?? 0,
      createdByName: o.created_by_name, createdAt: o.created_at, updatedAt: o.updated_at,
    }));
  },

  async getProductionOrder(id: number): Promise<ProductionOrder | null> {
    const { data: header, error } = await sb().from("production_orders").select("*").eq("id", id).maybeSingle();
    if (error) throw error;
    if (!header) return null;
    const { data: items, error: e2 } = await sb().from("production_order_items")
      .select("*").eq("order_id", id).order("id");
    if (e2) throw e2;
    return rowFromProdOrderDb(header, items ?? []);
  },

  async createProductionOrder(
    input: { orderDate: string; deliveryDate: string; note: string; items: ProductionOrderItemInput[] },
    userId: string, userName: string
  ): Promise<ProductionOrder> {
    const { data: header, error } = await sb().from("production_orders").insert({
      order_date: input.orderDate, delivery_date: input.deliveryDate, note: input.note ?? "",
      created_by_user_id: userId, created_by_name: userName,
    }).select().single();
    if (error) throw error;
    const rows = input.items
      .filter((i) => (i.itemId && i.branch) ? (i.qty > 0 || i.qtyG > 0) : !!i.extraName)
      .map((i) => ({
        order_id: header.id, item_id: i.itemId ?? null, branch_key: i.itemId ? i.branch : null,
        qty: i.qty, qty_g: i.qtyG,
        extra_name: i.extraName ?? null, extra_unit: i.extraUnit ?? null, extra_note: i.extraNote ?? null,
      }));
    let items: any[] = [];
    if (rows.length > 0) {
      const { data, error: e2 } = await sb().from("production_order_items").insert(rows).select();
      if (e2) throw e2;
      items = data ?? [];
    }
    return rowFromProdOrderDb(header, items);
  },

  async updateProductionOrder(
    id: number,
    patch: { orderDate?: string; deliveryDate?: string; note?: string; items?: ProductionOrderItemInput[]; removedItemIds?: number[] }
  ): Promise<ProductionOrder | null> {
    const headerPatch: any = { updated_at: new Date().toISOString() };
    if (patch.orderDate !== undefined) headerPatch.order_date = patch.orderDate;
    if (patch.deliveryDate !== undefined) headerPatch.delivery_date = patch.deliveryDate;
    if (patch.note !== undefined) headerPatch.note = patch.note;
    const { error } = await sb().from("production_orders").update(headerPatch).eq("id", id);
    if (error) throw error;

    if (patch.items) {
      const { data: existing } = await sb().from("production_order_items")
        .select("item_id,branch_key").eq("order_id", id).not("item_id", "is", null);
      const existingKeys = new Set((existing ?? []).map((r: any) => r.item_id + "|" + r.branch_key));
      const now = new Date().toISOString();

      const gridRows = patch.items
        .filter((i) => i.itemId && i.branch)
        .filter((i) => i.qty > 0 || i.qtyG > 0 || existingKeys.has(i.itemId + "|" + i.branch))
        .map((i) => ({ order_id: id, item_id: i.itemId, branch_key: i.branch, qty: i.qty, qty_g: i.qtyG, updated_at: now }));
      if (gridRows.length > 0) {
        const { error: e2 } = await sb().from("production_order_items")
          .upsert(gridRows, { onConflict: "order_id,item_id,branch_key" });
        if (e2) throw e2;
      }

      for (const row of patch.items.filter((i) => !i.itemId)) {
        if (row.id) {
          const { error: e3 } = await sb().from("production_order_items").update({
            qty: row.qty, qty_g: row.qtyG,
            extra_name: row.extraName ?? null, extra_unit: row.extraUnit ?? null, extra_note: row.extraNote ?? null,
            updated_at: now,
          }).eq("id", row.id).eq("order_id", id);
          if (e3) throw e3;
        } else if (row.extraName) {
          const { error: e4 } = await sb().from("production_order_items").insert({
            order_id: id, item_id: null, branch_key: null, qty: row.qty, qty_g: row.qtyG,
            extra_name: row.extraName, extra_unit: row.extraUnit ?? null, extra_note: row.extraNote ?? null,
          });
          if (e4) throw e4;
        }
      }
    }
    if (patch.removedItemIds?.length) {
      const { error: e5 } = await sb().from("production_order_items").delete()
        .in("id", patch.removedItemIds).eq("order_id", id).is("item_id", null);
      if (e5) throw e5;
    }
    return this.getProductionOrder(id);
  },
  async deleteProductionOrder(id: number): Promise<void> {
    const { error } = await sb().from("production_orders").delete().eq("id", id);
    if (error) throw error;
  },

  async updateProductionOrderItem(
    id: number,
    patch: { qty?: number; qtyG?: number; confirmed?: boolean; confirmedQty?: number; confirmedQtyG?: number },
    userId: string, userName: string
  ): Promise<ProductionOrderItem | null> {
    const { data: cur } = await sb().from("production_order_items").select("*").eq("id", id).maybeSingle();
    if (!cur) return null;
    const upd: any = { updated_at: new Date().toISOString() };
    if (patch.qty !== undefined) upd.qty = patch.qty;
    if (patch.qtyG !== undefined) upd.qty_g = patch.qtyG;
    if (patch.confirmed !== undefined) {
      upd.confirmed = patch.confirmed;
      if (patch.confirmed && !cur.confirmed) {
        upd.confirmed_at = new Date().toISOString();
        upd.confirmed_by_user_id = userId;
        upd.confirmed_by_name = userName;
        // default confirmed_qty = qty ปัจจุบัน ถ้า client ไม่ได้ส่งมาเอง และยังไม่เคยมีค่านี้ (ดูข้อ 0.4)
        if (patch.confirmedQty === undefined && cur.confirmed_qty == null) upd.confirmed_qty = patch.qty ?? cur.qty;
        if (patch.confirmedQtyG === undefined && cur.confirmed_qty_g == null) upd.confirmed_qty_g = patch.qtyG ?? cur.qty_g;
      }
    }
    if (patch.confirmedQty !== undefined) upd.confirmed_qty = patch.confirmedQty;
    if (patch.confirmedQtyG !== undefined) upd.confirmed_qty_g = patch.confirmedQtyG;
    const { data, error } = await sb().from("production_order_items").update(upd).eq("id", id).select().maybeSingle();
    if (error) throw error;
    return data ? rowFromProdOrderItemDb(data) : null;
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

function rowFromNoticeDb(r: any): BranchNotice {
  return {
    id: String(r.id), branch: r.branch_id ?? null, message: r.message,
    createdBy: r.created_by, createdAt: r.created_at,
  };
}

function rowFromEvidenceDb(r: any): SalesEvidence {
  return {
    id: String(r.id), branch: r.branch_id, date: r.date, type: r.evidence_type, imagePath: r.image_path,
    enteredAmount: Number(r.entered_amount), ocrAmount: r.ocr_amount != null ? Number(r.ocr_amount) : undefined,
    ocrNameMatch: r.ocr_name_match ?? undefined, matchStatus: r.match_status,
    duplicateNote: r.duplicate_note ?? undefined, mismatchNote: r.mismatch_note ?? undefined,
    uploadedBy: r.uploaded_by, createdAt: r.created_at,
  };
}

function rowFromRemittanceDb(r: any, coveredDates: string[]): CashRemittance {
  return {
    id: String(r.id), branch: r.branch_id, transferredAt: r.transferred_at, declaredAmount: Number(r.declared_amount),
    imagePath: r.image_path, ocrAmount: r.ocr_amount != null ? Number(r.ocr_amount) : undefined,
    ocrNameMatch: r.ocr_name_match ?? undefined, matchStatus: r.match_status,
    duplicateNote: r.duplicate_note ?? undefined, mismatchNote: r.mismatch_note ?? undefined, coveredDates,
    uploadedBy: r.uploaded_by, createdAt: r.created_at,
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

function rowFromProdOrderItemDb(r: any): ProductionOrderItem {
  return {
    id: r.id, itemId: r.item_id ?? undefined, branch: r.branch_key ?? undefined,
    qty: Number(r.qty), qtyG: Number(r.qty_g),
    extraName: r.extra_name ?? undefined, extraUnit: r.extra_unit ?? undefined, extraNote: r.extra_note ?? undefined,
    confirmed: r.confirmed, confirmedQty: r.confirmed_qty ?? undefined, confirmedQtyG: r.confirmed_qty_g ?? undefined,
    confirmedAt: r.confirmed_at ?? undefined, confirmedByName: r.confirmed_by_name ?? undefined,
  };
}
function rowFromProdOrderDb(h: any, items: any[]): ProductionOrder {
  return {
    id: h.id, orderDate: h.order_date, deliveryDate: h.delivery_date, note: h.note ?? "",
    items: items.map(rowFromProdOrderItemDb),
    createdByName: h.created_by_name, createdAt: h.created_at, updatedAt: h.updated_at,
  };
}
