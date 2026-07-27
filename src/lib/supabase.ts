// Supabase-backed store (production path, USE_SUPABASE=1). เข้าถึงจาก BFF เท่านั้น
import { createClient, SupabaseClient } from "@supabase/supabase-js";
import type { Branch, StockRow, SalesRow, CupRow, RestockRow, Meta, CupSize, Item, ParMap, User, Role, BranchScope, AuditEntry, Weekday, Requisition, RestockSelectionEntry, RestockExtraItem, ReturnHistoryRow, PaymentIncident, ExpiryCheckRow, ProductionOrder, ProductionOrderSummary, ProductionOrderItem, ProductionOrderItemInput, BranchNotice, SalesEvidence, EvidenceType, MatchStatus, CashRemittance, RestockReceiptStatus, RestockSheetSummary, AdminFlag, StaffAllowanceUse, AllowanceSummary } from "./types";
import { BRANCHES } from "./types";
import { variance, restockNeed, isSpecialActive, monthRange, ALLOWANCE_DEFAULT_MONTHLY } from "./calc";
import { verifyPasscode, hashPasscode } from "./auth";

// สร้าง client สดทุกครั้ง (แบบเดียวกับ /api/debug ที่พิสูจน์แล้วว่าอ่านได้ครบ) — เลี่ยง singleton ที่อาจถูก init ตอน env ยังไม่พร้อม
function sb(): SupabaseClient {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("Supabase env missing (SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY)");
  return createClient(url, key, { auth: { persistSession: false } });
}

const sizes: CupSize[] = ["P", "S", "BOWL", "14OZ"];

// ดึง "แถวสต็อกล่าสุดก่อน/ถึงวันที่กำหนด" ต่อ item เป็น Map
//
// ⚠️ ต้องเรียง date DESC + เอาตัวแรกที่เจอ (first wins) เท่านั้น ห้ามเรียง ASC แล้ว last-wins
// เพราะ PostgREST จำกัดผลลัพธ์ไว้ ~1000 แถวโดย default (ไม่ error ไม่เตือน ตัดทิ้งเงียบ ๆ)
// ถ้าเรียง ASC แล้วโดนตัด = ตัดแถว "ใหม่สุด" ทิ้ง ซึ่งคือแถวที่ต้องใช้จริง → ยกมาเพี้ยนไปเป็นค่าของวันเก่า
// (เคสจริง: NVP มี 1,056 แถว ทำให้ยกมา 25/07 ไปหยิบค่าของ 23/07 มาแทน 24/07 ทั้ง 55 รายการ)
// เรียง DESC แล้วถ้าโดนตัดจะตัดแถว "เก่าสุด" ทิ้งแทน ซึ่งไม่กระทบผลลัพธ์
async function latestStockMapBefore(
  branch: Branch, date: string, opts?: { inclusive?: boolean; select?: string }
): Promise<Map<string, any>> {
  const select = opts?.select ?? "item_id,remain_pack,remain_g,date";
  let q = sb().from("stock_daily").select(select).eq("branch_id", branch);
  q = opts?.inclusive ? q.lte("date", date) : q.lt("date", date);
  const { data } = await q.order("date", { ascending: false }).limit(50000);
  const map = new Map<string, any>();
  for (const r of (data ?? []) as any[]) {
    if (!map.has(r.item_id)) map.set(r.item_id, r); // first wins (เรียง DESC = ใหม่สุดมาก่อน)
  }
  return map;
}

// คำนวณ auto-fill ของ "รับเข้า" ใหม่จากศูนย์ทุกครั้ง โดยรวมยอดจากทุก receipt (ทุกใบ) ที่ยืนยันในวันจริงเดียวกัน (todayStr)
// กันเคสมีหลายใบของ item เดียวกันมายืนยันวันเดียวกัน (ต้องบวกรวม ไม่ใช่ทับ)
async function recomputeAutoFillForToday(branch: Branch, itemId: string, todayStr: string): Promise<void> {
  const startIso = `${todayStr}T00:00:00.000Z`;
  const dayAfter = new Date(startIso);
  dayAfter.setUTCDate(dayAfter.getUTCDate() + 1);
  const endIso = dayAfter.toISOString();

  const { data: receipts } = await sb().from("restock_receipts")
    .select("received_qty,received_qty_g,not_received")
    .eq("branch_id", branch).eq("item_id", itemId)
    .gte("confirmed_at", startIso).lt("confirmed_at", endIso);

  let sumPack = 0;
  let sumG = 0;
  for (const r of receipts ?? []) {
    if (r.not_received) continue;
    sumPack += Number(r.received_qty);
    sumG += Number(r.received_qty_g);
  }

  const { data: existing } = await sb().from("stock_daily")
    .select("carry_pack,carry_g,in_auto_pack,expiry_in_g")
    .eq("branch_id", branch).eq("date", todayStr).eq("item_id", itemId).maybeSingle();

  if (existing) {
    if (existing.in_auto_pack === null || existing.in_auto_pack === undefined) return; // พนักงานแก้ทับไปแล้ว ไม่แตะต่อ
    // "รับเข้า" ของวันนี้อาจมี 2 แหล่ง: รถส่งของ (receipts) + ของที่แกะจากรายการอื่นมารวม (expiry convert)
    // ถ้าเขียนทับด้วย sumPack เฉย ๆ ส่วนที่มาจากการแกะจะหายเงียบ ๆ ตอนสาขายืนยันรับของทีหลัง
    let inPack = sumPack;
    let inG = sumG;
    const expG = Number(existing.expiry_in_g ?? 0);
    if (expG > 0) {
      const { data: itRow } = await sb().from("items").select("grams_per_uom").eq("id", itemId).maybeSingle();
      const gpu = Number(itRow?.grams_per_uom ?? 0);
      if (gpu > 0) {
        const totalG = sumPack * gpu + sumG + expG;
        inPack = Math.floor(totalG / gpu);
        inG = totalG % gpu;
      } else {
        inG = sumG + expG;
      }
    }
    // อัปเดตเฉพาะ "รับเข้า" — ห้ามแตะ remain_pack/remain_g เพราะอาจเป็นยอดที่พนักงานนับ+ยืนยันเองไปแล้ว
    // in_auto_* เก็บเฉพาะส่วนที่มาจากรถส่งของ ไว้เทียบว่าพนักงานแก้ทับหรือยัง
    const { error: updErr } = await sb().from("stock_daily").update({
      in_pack: inPack, in_g: inG, in_auto_pack: sumPack, in_auto_g: sumG,
    }).eq("branch_id", branch).eq("date", todayStr).eq("item_id", itemId);
    if (updErr) throw updErr;
  } else {
    const { data: prev } = await sb().from("stock_daily")
      .select("remain_pack,remain_g").eq("branch_id", branch).eq("item_id", itemId).lt("date", todayStr)
      .order("date", { ascending: false }).limit(1).maybeSingle();
    const carryPack = prev?.remain_pack ?? 0;
    const carryG = prev?.remain_g ?? 0;
    // แถวใหม่จาก auto-fill ล้วน ๆ ยังไม่มีใครนับ/ยืนยันคงเหลือจริง — remain_confirmed: false
    // ให้หน้าสต็อกโชว์ช่องคงเหลือเป็นค่าว่างรอพนักงานกรอกเอง ไม่ใช่โชว์เลขที่คำนวณไว้ล่วงหน้า
    const { error: insErr } = await sb().from("stock_daily").insert({
      date: todayStr, branch_id: branch, item_id: itemId,
      carry_pack: carryPack, carry_g: carryG, in_pack: sumPack, in_g: sumG, used: 0,
      remain_pack: carryPack + sumPack, remain_g: carryG + sumG, returned: 0, returned_g: 0,
      note: "", variance: 0, in_auto_pack: sumPack, in_auto_g: sumG, remain_confirmed: false,
    });
    if (insErr) throw insErr;
  }
}

const userRow = (r: any): User => ({
  id: r.id, name: r.name, role: r.role, branchScope: r.branch_scope, active: r.active,
  allowanceEnabled: r.allowance_enabled ?? false,
  allowanceMonthly: Number(r.allowance_monthly ?? ALLOWANCE_DEFAULT_MONTHLY),
});

const allowanceRow = (r: any): StaffAllowanceUse => ({
  id: r.id, userId: r.user_id, branch: r.branch_id ?? null, useDate: r.use_date,
  billTotal: Number(r.bill_total), discountAmount: Number(r.discount_amount), paidAmount: Number(r.paid_amount),
  imagePath: r.image_path ?? null, ocrDiscount: r.ocr_discount == null ? null : Number(r.ocr_discount),
  needsReview: !!r.needs_review, reviewNote: r.review_note ?? "",
  note: r.note ?? "", userName: r.created_by_name ?? undefined, createdAt: r.created_at,
});

export const supabaseStore = {
  async getMeta(): Promise<Meta> {
    const itemsRes = await sb()
      .from("items")
      .select("id,name,category,unit,is_special,is_cup,cup_size,has_remainder,grams_per_uom,remainder_group,sort,check_frequency,show_remainder,variable_yield,expiry_check,expiry_warn_days,expiry_allow_sell_front,expiry_allow_return,expiry_convert_to_item_id,expiry_convert_g");
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
      expiryCheck: r.expiry_check ?? false,
      expiryWarnDays: Number(r.expiry_warn_days ?? 5),
      expiryAllowSellFront: r.expiry_allow_sell_front ?? true,
      expiryAllowReturn: r.expiry_allow_return ?? true,
      expiryConvertToItemId: r.expiry_convert_to_item_id ?? null,
      expiryConvertG: r.expiry_convert_g == null ? null : Number(r.expiry_convert_g),
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
    const prevMap = await latestStockMapBefore(branch, date);
    return items.map((it) => {
      // ยกมา = คงเหลือของวันก่อนหน้าล่าสุดเสมอ คำนวณสดทุกครั้ง (ไม่ใช่ carry_pack ที่ freeze ไว้ตอนบันทึกแถวนี้ครั้งแรก)
      // กันเคสแก้ไขคงเหลือของวันก่อนหน้าย้อนหลัง แล้วยกมาของวันถัดไปไม่อัปเดตตาม
      const p = prevMap.get(it.id);
      const carryPack = p?.remain_pack ?? 0, carryG = p?.remain_g ?? 0;
      const s = savedMap.get(it.id) as any;
      if (s) return { ...rowFromDb(s), carryPack, carryG };
      return { itemId: it.id, carryPack, carryG, inPack: 0, inG: 0, used: 0,
        remainPack: carryPack, remainG: carryG, returned: 0, note: "", variance: 0, hasEntry: false };
    });
  },

  // "ใครบันทึกล่าสุด เมื่อไหร่" ของสาขา+วันนั้น — ใช้เทียบกันบันทึกทับกัน (v1.14)
  async getStockSavedAt(branch: Branch, date: string): Promise<{ savedAt: string | null; savedBy: string | null }> {
    const { data, error } = await sb().from("stock_daily")
      .select("updated_at,updated_by_name")
      .eq("branch_id", branch).eq("date", date)
      .order("updated_at", { ascending: false }).limit(1).maybeSingle();
    if (error) throw error;
    return { savedAt: data?.updated_at ?? null, savedBy: data?.updated_by_name ?? null };
  },

  async saveStock(branch: Branch, date: string, rows: StockRow[], userName?: string) {
    // เช็คว่ามีค่าที่เคย auto-fill จากการยืนยันรับของไหม — ถ้าพนักงานแก้ทับ ให้เตือนแอดมินครั้งเดียวแล้วเลิกติดตาม
    const { data: existingRows } = await sb().from("stock_daily")
      .select("item_id,in_auto_pack,in_auto_g,in_pack,in_g,remain_pack,remain_g,remain_confirmed")
      .eq("branch_id", branch).eq("date", date);
    const autoMap = new Map((existingRows ?? []).map((r: any) => [r.item_id, { pack: r.in_auto_pack, g: r.in_auto_g }]));
    // แถวเดิมของวันนี้ ไว้เทียบว่า "แก้ย้อนหลัง" เปลี่ยนค่าอะไรไปบ้าง
    const prevRowMap = new Map((existingRows ?? []).map((r: any) => [r.item_id, r]));
    // แก้ของวันก่อนหน้า = ไม่ใช่วันนี้ (เทียบวันที่ฝั่งเซิร์ฟเวอร์ ไม่เชื่อเครื่อง client)
    const isBackdated = date !== new Date().toISOString().slice(0, 10);
    // ยกมาคำนวณสดจาก DB ตอนบันทึกเสมอ — ห้ามเชื่อ carryPack ที่ client ส่งมา เพราะอาจเป็นค่าเก่าที่ค้างอยู่ในหน้าเว็บ
    // ตั้งแต่ก่อนมีการแก้ไขคงเหลือของวันก่อนหน้าไปแล้ว (กันเซฟทับค่าที่แก้ไปแล้วกลับเป็นค่าผิดเดิม)
    const prevMap = await latestStockMapBefore(branch, date);
    const flags: any[] = [];
    let itemNameMap: Map<string, string> | null = null;
    const payload = [];
    for (const r of rows) {
      const p = prevMap.get(r.itemId);
      const carryPack = p?.remain_pack ?? 0, carryG = p?.remain_g ?? 0;
      const auto = autoMap.get(r.itemId);
      let inAutoPack: number | null = auto?.pack != null ? Number(auto.pack) : null;
      let inAutoG: number | null = auto?.g != null ? Number(auto.g) : null;
      if (inAutoPack != null && (r.inPack !== inAutoPack || r.inG !== (inAutoG ?? 0))) {
        if (!itemNameMap) {
          const { data: items } = await sb().from("items").select("id,name");
          itemNameMap = new Map((items ?? []).map((it: any) => [it.id, it.name]));
        }
        flags.push({
          branch_id: branch, date, item_id: r.itemId, item_name: itemNameMap.get(r.itemId) ?? r.itemId,
          reason: "stock_override", detail: `ระบบเติมให้ ${inAutoPack} → พนักงานแก้เป็น ${r.inPack}`,
        });
        inAutoPack = null; inAutoG = null;
      }

      // ── แจ้งเตือนแอดมินเพิ่ม 2 เคส (แพรขอ 2026-07-26) ──
      const nameOf = async () => {
        if (!itemNameMap) {
          const { data: items } = await sb().from("items").select("id,name");
          itemNameMap = new Map((items ?? []).map((it: any) => [it.id, it.name]));
        }
        return itemNameMap.get(r.itemId) ?? r.itemId;
      };

      // 1) คงเหลือ > ของที่มี (ยกมา+รับเข้า) — เป็นไปไม่ได้ เพราะขาย/ส่งคืนมีแต่ทำให้ลดลง
      //    เช็คเฉพาะ "แพ็ค" ไม่เช็คกรัม เพราะเศษกรัมเกินยกมาได้ตามปกติ (แกะกล่องใหม่มาใช้)
      if (r.remainPack > carryPack + r.inPack) {
        flags.push({
          branch_id: branch, date, item_id: r.itemId, item_name: await nameOf(),
          reason: "stock_impossible",
          detail: `คงเหลือ ${r.remainPack} เกินของที่มี ${carryPack + r.inPack} (ยกมา ${carryPack} + รับเข้า ${r.inPack})`,
        });
      }

      // 2) ย้อนไปแก้ยอดของวันก่อนหน้า — เฉพาะตอนค่าเปลี่ยนจริง (กดบันทึกซ้ำเฉย ๆ ไม่ต้องเตือน)
      const before: any = prevRowMap.get(r.itemId);
      if (isBackdated && before && before.remain_confirmed) {
        const changes: string[] = [];
        if (Number(before.remain_pack) !== r.remainPack) changes.push(`คงเหลือ ${before.remain_pack}→${r.remainPack}`);
        if (Number(before.remain_g) !== r.remainG) changes.push(`คงเหลือเศษ ${before.remain_g}→${r.remainG}g`);
        if (Number(before.in_pack) !== r.inPack) changes.push(`รับเข้า ${before.in_pack}→${r.inPack}`);
        if (Number(before.in_g) !== r.inG) changes.push(`รับเข้าเศษ ${before.in_g}→${r.inG}g`);
        if (changes.length) {
          flags.push({
            branch_id: branch, date, item_id: r.itemId, item_name: await nameOf(),
            reason: "stock_backdated_edit", detail: `แก้ย้อนหลัง · ${changes.join(" · ")}`,
          });
        }
      }

      payload.push({
        date, branch_id: branch, item_id: r.itemId,
        carry_pack: carryPack, carry_g: carryG, in_pack: r.inPack, in_g: r.inG,
        used: r.used, remain_pack: r.remainPack, remain_g: r.remainG, returned: r.returned,
        returned_g: r.returnedG ?? 0,
        note: r.note, variance: variance(carryPack, r.inPack, r.used, r.returned, r.remainPack),
        in_auto_pack: inAutoPack, in_auto_g: inAutoG, remain_confirmed: true,
      });
    }
    const stamped = payload.map((r: any) => ({ ...r, updated_at: new Date().toISOString(), updated_by_name: userName ?? null }));
    const { error } = await sb().from("stock_daily").upsert(stamped, { onConflict: "date,branch_id,item_id" });
    if (error) throw error;
    if (flags.length) {
      const { error: flagErr } = await sb().from("stock_admin_flags").insert(flags);
      if (flagErr) throw flagErr;
    }
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

  // ประวัติส่งคืน/ของเสีย (v1.10) — อ่านจากช่อง returned/returned_g ที่พนักงานกรอกอยู่แล้วในหน้าสต็อก
  // branch = null → ทุกสาขา (admin เท่านั้น) · เรียงวันใหม่สุดก่อน
  // ⚠️ order DESC + limit ชัดเจน (บทเรียนจากบั๊ก PostgREST ตัด 1000 แถวเงียบ ๆ) — ถ้าโดนตัดจะตัดของเก่าทิ้ง ไม่ใช่ของใหม่
  async getReturnHistory(
    branch: Branch | null, from: string, to: string, limit = 500
  ): Promise<ReturnHistoryRow[]> {
    const { items } = await this.getMeta();
    const itemById = new Map(items.map((it) => [it.id, it]));
    let q = sb().from("stock_daily")
      .select("date,branch_id,item_id,returned,returned_g,note")
      .gte("date", from).lte("date", to)
      .or("returned.gt.0,returned_g.gt.0");
    if (branch) q = q.eq("branch_id", branch);
    const { data, error } = await q.order("date", { ascending: false }).limit(limit);
    if (error) throw error;
    return (data ?? [])
      .map((r: any) => {
        const it = itemById.get(r.item_id);
        if (!it) return null;
        return {
          date: r.date, branch: r.branch_id as Branch, itemId: it.id, itemName: it.name, unit: it.unit,
          returned: Number(r.returned) || 0, returnedG: Number(r.returned_g) || 0, note: r.note ?? "",
        };
      })
      .filter((r): r is ReturnHistoryRow => r !== null);
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
      const latestMap = await latestStockMapBefore(b, date, {
        inclusive: true, select: "item_id,remain_pack,variance,date",
      });
      const remainMap = new Map<string, number>();
      for (const [itemId, r] of latestMap) remainMap.set(itemId, r.remain_pack);
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
    const { data } = await sb().from("users").select("id,name,role,branch_scope,active,allowance_enabled,allowance_monthly").order("created_at");
    return (data ?? []).map(userRow);
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
  async updateUser(id: string, patch: { name?: string; role?: Role; branchScope?: BranchScope; active?: boolean; passcode?: string; allowanceEnabled?: boolean; allowanceMonthly?: number }): Promise<User | null> {
    const upd: any = {};
    if (patch.name !== undefined) upd.name = patch.name;
    if (patch.role !== undefined) upd.role = patch.role;
    if (patch.branchScope !== undefined) upd.branch_scope = patch.branchScope;
    if (patch.active !== undefined) upd.active = patch.active;
    if (patch.allowanceEnabled !== undefined) upd.allowance_enabled = patch.allowanceEnabled;
    if (patch.allowanceMonthly !== undefined) upd.allowance_monthly = patch.allowanceMonthly;
    if (patch.passcode) upd.passcode_hash = hashPasscode(patch.passcode);
    const { data, error } = await sb().from("users").update(upd).eq("id", id).select("id,name,role,branch_scope,active,allowance_enabled,allowance_monthly").maybeSingle();
    if (error) throw error;
    return data ? userRow(data) : null;
  },

  // ── สิทธิ์ซื้อของในร้าน (v1.13) ──
  // ยอดที่ตัดสิทธิ์คือ discount_amount เท่านั้น (ส่วนลดบนบิล) ไม่ใช่ยอดที่จ่ายจริง
  async listAllowanceUses(userId: string, month: string): Promise<StaffAllowanceUse[]> {
    const { from, to } = monthRange(month);
    const { data, error } = await sb().from("staff_allowance_uses")
      .select("id,user_id,branch_id,use_date,bill_total,discount_amount,paid_amount,image_path,ocr_discount,needs_review,review_note,note,created_by_name,created_at")
      .eq("user_id", userId).gte("use_date", from).lt("use_date", to)
      .order("use_date", { ascending: false }).order("id", { ascending: false }).limit(500);
    if (error) throw error;
    return (data ?? []).map(allowanceRow);
  },

  // ภาพรวมทุกคนที่เปิดสิทธิ์ + บิลที่ต้องตรวจของเดือนนั้น (แอดมิน)
  async getAllowanceOverview(month: string): Promise<{ summaries: AllowanceSummary[]; needsReview: StaffAllowanceUse[] }> {
    const { from, to } = monthRange(month);
    const { data: users, error: uErr } = await sb().from("users")
      .select("id,name,role,branch_scope,active,allowance_enabled,allowance_monthly").eq("allowance_enabled", true).eq("active", true).order("created_at");
    if (uErr) throw uErr;
    const { data: uses, error: rErr } = await sb().from("staff_allowance_uses")
      .select("id,user_id,branch_id,use_date,bill_total,discount_amount,paid_amount,image_path,ocr_discount,needs_review,review_note,note,created_by_name,created_at")
      .gte("use_date", from).lt("use_date", to)
      .order("use_date", { ascending: false }).limit(2000);
    if (rErr) throw rErr;

    const usedBy = new Map<string, number>();
    for (const r of uses ?? []) usedBy.set(r.user_id, (usedBy.get(r.user_id) ?? 0) + Number(r.discount_amount));
    const nameBy = new Map((users ?? []).map((u: any) => [u.id, u.name as string]));

    const summaries: AllowanceSummary[] = (users ?? []).map((u: any) => {
      const monthly = Number(u.allowance_monthly ?? ALLOWANCE_DEFAULT_MONTHLY);
      const used = usedBy.get(u.id) ?? 0;
      return { userId: u.id, userName: u.name, branchScope: u.branch_scope, monthly, used, remaining: Math.max(monthly - used, 0) };
    });
    const needsReview = (uses ?? []).filter((r: any) => r.needs_review)
      .map((r: any) => ({ ...allowanceRow(r), userName: nameBy.get(r.user_id) ?? r.user_id }));
    return { summaries, needsReview };
  },

  async addAllowanceUse(row: StaffAllowanceUse): Promise<void> {
    const { error } = await sb().from("staff_allowance_uses").insert({
      user_id: row.userId, branch_id: row.branch ?? null, use_date: row.useDate,
      bill_total: row.billTotal, discount_amount: row.discountAmount, paid_amount: row.paidAmount,
      image_path: row.imagePath ?? null, ocr_discount: row.ocrDiscount ?? null,
      needs_review: row.needsReview, review_note: row.reviewNote,
      note: row.note, created_by_name: row.userName ?? null,
    });
    if (error) throw error;
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

  // ── ตรวจวันหมดอายุ (v1.12) ──
  async getExpiryChecks(branch: Branch, checkDate: string): Promise<ExpiryCheckRow[]> {
    const { data, error } = await sb().from("expiry_checks")
      .select("id,item_id,expiry_date,qty,disposition,note")
      .eq("branch_id", branch).eq("check_date", checkDate)
      .order("id");
    if (error) throw error;
    return (data ?? []).map((r: any) => ({
      id: r.id, itemId: r.item_id, expiryDate: r.expiry_date, qty: Number(r.qty),
      disposition: r.disposition ?? null, note: r.note ?? "",
    }));
  },

  // สาขาไหน "บันทึกผลตรวจของวันนั้นแล้ว" — ใช้ทำ badge เตือนวันอังคาร/ศุกร์
  async getBranchesWithExpiryCheck(checkDate: string): Promise<Branch[]> {
    const { data, error } = await sb().from("expiry_checks")
      .select("branch_id").eq("check_date", checkDate);
    if (error) throw error;
    return [...new Set((data ?? []).map((r: any) => r.branch_id as Branch))];
  },

  // บันทึกทับทั้งชุดต่อ (สาขา,วันตรวจ) แล้วเขียนผลลง stock_daily ให้เอง
  //
  // ⚠️ ต้อง idempotent — บันทึกซ้ำต้องไม่บวกทบ ใช้คอลัมน์ expiry_returned/expiry_used เป็นตัวจำว่า
  // "ครั้งก่อนระบบใส่ไปเท่าไหร่" แล้วถอนของเก่าออกก่อนใส่ของใหม่ (แพทเทิร์นเดียวกับ in_auto_pack)
  // ยอดที่พนักงานกรอกเองในหน้าสต็อกจึงไม่ถูกทับหาย
  async saveExpiryChecks(
    branch: Branch, checkDate: string, rows: ExpiryCheckRow[], userId: string, userName: string
  ): Promise<void> {
    const { error: delErr } = await sb().from("expiry_checks")
      .delete().eq("branch_id", branch).eq("check_date", checkDate);
    if (delErr) throw delErr;

    if (rows.length > 0) {
      const { error: insErr } = await sb().from("expiry_checks").insert(
        rows.map((r) => ({
          branch_id: branch, check_date: checkDate, item_id: r.itemId,
          expiry_date: r.expiryDate, qty: r.qty, disposition: r.disposition ?? null, note: r.note,
          created_by_user_id: userId, created_by_name: userName,
        }))
      );
      if (insErr) throw insErr;
    }

    // กฎการแปลง — "แกะไปรวมกับรายการอื่น" ต้องรู้ว่าปลายทางคือตัวไหน และ 1 หน่วยได้กี่กรัม
    // อ่านจาก items เสมอ ไม่เชื่อค่าที่ client ส่งมา (client ส่งมาแค่ itemId/qty/disposition)
    const convertSrcIds = [...new Set(rows.filter((r) => r.disposition === "convert").map((r) => r.itemId))];
    const convRule = new Map<string, { to: string; g: number }>();
    const gramsPerPack = new Map<string, number>();
    if (convertSrcIds.length > 0) {
      const { data: srcItems } = await sb().from("items")
        .select("id,expiry_convert_to_item_id,expiry_convert_g").in("id", convertSrcIds);
      const targetIds: string[] = [];
      for (const s of srcItems ?? []) {
        const g = Number(s.expiry_convert_g);
        if (s.expiry_convert_to_item_id && g > 0) {
          convRule.set(s.id, { to: s.expiry_convert_to_item_id, g });
          targetIds.push(s.expiry_convert_to_item_id);
        }
      }
      if (targetIds.length > 0) {
        const { data: tItems } = await sb().from("items").select("id,grams_per_uom").in("id", targetIds);
        for (const t of tItems ?? []) gramsPerPack.set(t.id, Number(t.grams_per_uom) || 0);
      }
    }

    // รวมยอดต่อ item ที่ต้องไปลงสต็อก
    const wantReturn = new Map<string, number>();
    const wantUsed = new Map<string, number>();
    const wantInG = new Map<string, number>(); // ปลายทางของการแปลง — สะสมเป็นกรัม แล้วค่อยทดเป็นแพ็ค
    for (const r of rows) {
      if (r.disposition === "return") {
        wantReturn.set(r.itemId, (wantReturn.get(r.itemId) ?? 0) + r.qty);
      } else if (r.disposition === "sell_front") {
        wantUsed.set(r.itemId, (wantUsed.get(r.itemId) ?? 0) + r.qty);
      } else if (r.disposition === "convert") {
        // ต้นทางหายไปจากชั้นเหมือนแกะขาย · ปลายทางได้ของเพิ่มเข้ากอง
        wantUsed.set(r.itemId, (wantUsed.get(r.itemId) ?? 0) + r.qty);
        const rule = convRule.get(r.itemId);
        if (rule) wantInG.set(rule.to, (wantInG.get(rule.to) ?? 0) + r.qty * rule.g);
      }
    }

    // ทุก item ที่เคยมีผลตรวจลงสต็อกไว้ ต้องถูกพิจารณาด้วย (เผื่อรอบนี้ถูกยกเลิก → ต้องถอนของเก่าออก)
    const { data: existing } = await sb().from("stock_daily")
      .select("item_id,used,returned,in_pack,in_g,expiry_used,expiry_returned,expiry_in_g")
      .eq("branch_id", branch).eq("date", checkDate);
    const touched = new Set<string>([...wantReturn.keys(), ...wantUsed.keys(), ...wantInG.keys()]);
    for (const r of existing ?? []) {
      if (Number(r.expiry_returned) !== 0 || Number(r.expiry_used) !== 0 || Number(r.expiry_in_g) !== 0) {
        touched.add(r.item_id);
      }
    }
    if (touched.size === 0) return;

    const byItem = new Map((existing ?? []).map((r: any) => [r.item_id, r]));
    for (const itemId of touched) {
      const cur: any = byItem.get(itemId);
      const newRet = wantReturn.get(itemId) ?? 0;
      const newUse = wantUsed.get(itemId) ?? 0;
      const newInG = wantInG.get(itemId) ?? 0;
      // ทดกรัมเป็นแพ็ค+เศษด้วยขนาดแพ็คของปลายทาง (500g × 2 = 1000g = 1 แพ็ค Greek Yogurt 1kg)
      const gpu = gramsPerPack.get(itemId) ?? 0;
      if (cur) {
        const baseRet = Number(cur.returned) - Number(cur.expiry_returned); // ส่วนที่พนักงานกรอกเอง
        const baseUse = Number(cur.used) - Number(cur.expiry_used);
        const patch: Record<string, unknown> = {
          returned: Math.max(baseRet, 0) + newRet, expiry_returned: newRet,
          used: Math.max(baseUse, 0) + newUse, expiry_used: newUse,
        };
        if (newInG > 0 || Number(cur.expiry_in_g) !== 0) {
          // ถอนของเก่าออกจาก "กรัมรวม" ก่อน แล้วบวกของใหม่ ค่อยทดเป็นแพ็ค+เศษใหม่ทั้งก้อน
          const baseTotalG = Math.max(
            Number(cur.in_pack) * (gpu || 1) + Number(cur.in_g) - Number(cur.expiry_in_g), 0
          );
          const totalG = baseTotalG + newInG;
          patch.in_pack = gpu > 0 ? Math.floor(totalG / gpu) : Number(cur.in_pack);
          patch.in_g = gpu > 0 ? totalG % gpu : totalG;
          patch.expiry_in_g = newInG;
        }
        const { error: updErr } = await sb().from("stock_daily").update(patch)
          .eq("branch_id", branch).eq("date", checkDate).eq("item_id", itemId);
        if (updErr) throw updErr;
      } else if (newRet > 0 || newUse > 0 || newInG > 0) {
        // ยังไม่มีแถวสต็อกของวันนี้ — สร้างจากยกมา แล้วใส่ผลตรวจลงไป (ยังไม่นับว่าพนักงานยืนยันคงเหลือ)
        const { data: prev } = await sb().from("stock_daily")
          .select("remain_pack,remain_g").eq("branch_id", branch).eq("item_id", itemId).lt("date", checkDate)
          .order("date", { ascending: false }).limit(1).maybeSingle();
        const carryPack = prev?.remain_pack ?? 0;
        const carryG = prev?.remain_g ?? 0;
        const inPack = gpu > 0 ? Math.floor(newInG / gpu) : 0;
        const inG = gpu > 0 ? newInG % gpu : newInG;
        const { error: insErr2 } = await sb().from("stock_daily").insert({
          date: checkDate, branch_id: branch, item_id: itemId,
          carry_pack: carryPack, carry_g: carryG, in_pack: inPack, in_g: inG,
          used: newUse, remain_pack: Math.max(carryPack + inPack - newUse - newRet, 0), remain_g: carryG,
          returned: newRet, returned_g: 0, note: "", variance: 0,
          expiry_returned: newRet, expiry_used: newUse, expiry_in_g: newInG, remain_confirmed: false,
        });
        if (insErr2) throw insErr2;
      }
    }
  },

  // ── เคส "รับเงินไม่ตรงบิล" (v1.11) — บันทึกทับทั้งชุดต่อ (สาขา,วันที่) ──
  async getPaymentIncidents(branch: Branch, date: string): Promise<PaymentIncident[]> {
    const { data, error } = await sb().from("sales_payment_incidents")
      .select("id,kind,bill_amount,actual_amount,note,created_by_name,created_at")
      .eq("branch_id", branch).eq("date", date)
      .order("id");
    if (error) throw error;
    return (data ?? []).map((r: any) => ({
      id: r.id, kind: r.kind, billAmount: Number(r.bill_amount), actualAmount: Number(r.actual_amount),
      note: r.note ?? "", createdByName: r.created_by_name ?? undefined, createdAt: r.created_at ?? undefined,
    }));
  },
  async savePaymentIncidents(
    branch: Branch, date: string, incidents: PaymentIncident[], userId: string, userName: string
  ): Promise<void> {
    const { error: delErr } = await sb().from("sales_payment_incidents")
      .delete().eq("branch_id", branch).eq("date", date);
    if (delErr) throw delErr;
    if (incidents.length === 0) return;
    const { error: insErr } = await sb().from("sales_payment_incidents").insert(
      incidents.map((it) => ({
        branch_id: branch, date, kind: it.kind,
        bill_amount: it.billAmount, actual_amount: it.actualAmount, note: it.note,
        created_by_user_id: userId, created_by_name: userName,
      }))
    );
    if (insErr) throw insErr;
  },

  // itemId ที่ "ส่งไปแล้วและสาขายืนยันรับแล้ว" ของใบวันนั้น — ใช้กรองตอนพิมพ์ใบรอบที่ 2
  // ไม่นับตัวที่ติ๊ก "ไม่ได้รับ" เพราะของยังไม่ถึงสาขา ถ้าจะส่งใหม่ก็ต้องพิมพ์ซ้ำ
  async getConfirmedReceiptItemIds(branch: Branch, date: string): Promise<string[]> {
    const { data, error } = await sb().from("restock_receipts")
      .select("item_id")
      .eq("branch_id", branch).eq("date", date).eq("not_received", false);
    if (error) throw error;
    return (data ?? []).map((r: any) => r.item_id);
  },

  async getRestockNote(branch: Branch, date: string): Promise<string> {
    const { data, error } = await sb().from("restock_notes").select("note")
      .eq("branch_id", branch).eq("date", date).maybeSingle();
    if (error) throw error;
    return data?.note ?? "";
  },
  async saveRestockNote(branch: Branch, date: string, note: string, userId: string, userName: string): Promise<void> {
    const { error } = await sb().from("restock_notes").upsert({
      branch_id: branch, date, note, updated_by: userName, updated_by_user_id: userId, updated_at: new Date().toISOString(),
    }, { onConflict: "branch_id,date" });
    if (error) throw error;
  },

  // ── รายการที่ไม่มีให้เลือกในระบบ (v1.10) — ไม่ผูก item_id ไม่ auto-fill รับเข้า เก็บเป็นประวัติ ──
  async getRestockExtraItems(branch: Branch, date: string): Promise<RestockExtraItem[]> {
    const { data, error } = await sb().from("restock_extra_items")
      .select("name,qty,note,created_by_name,created_at")
      .eq("branch_id", branch).eq("date", date)
      .order("id");
    if (error) throw error;
    return (data ?? []).map((r: any) => ({
      name: r.name, qty: Number(r.qty), note: r.note ?? "",
      createdByName: r.created_by_name ?? undefined, createdAt: r.created_at ?? undefined,
    }));
  },
  // บันทึกทับทั้งชุดต่อ (สาขา,วันที่) — ลบของเดิมแล้ว insert ชุดใหม่ ให้ตรงกับสิ่งที่เห็นบนหน้าจอเสมอ
  async saveRestockExtraItems(
    branch: Branch, date: string, items: RestockExtraItem[], userId: string, userName: string
  ): Promise<void> {
    const { error: delErr } = await sb().from("restock_extra_items")
      .delete().eq("branch_id", branch).eq("date", date);
    if (delErr) throw delErr;
    if (items.length === 0) return;
    const { error: insErr } = await sb().from("restock_extra_items").insert(
      items.map((it) => ({
        branch_id: branch, date, name: it.name, qty: it.qty, note: it.note,
        created_by_user_id: userId, created_by_name: userName,
      }))
    );
    if (insErr) throw insErr;
  },

  // ── ยืนยันรับของ (v1.9) — ไม่ผูกวันนี้อย่างเดียว โชว์ "ทุกใบที่ยังยืนยันไม่ครบ" ของสาขานั้น ──
  async listOutstandingRestockSheets(branch: Branch): Promise<RestockSheetSummary[]> {
    const { data: sel, error } = await sb().from("restock_selections")
      .select("date,item_id").eq("branch_id", branch).eq("selected", true);
    if (error) throw error;
    const byDate = new Map<string, Set<string>>();
    for (const r of sel ?? []) {
      if (!byDate.has(r.date)) byDate.set(r.date, new Set());
      byDate.get(r.date)!.add(r.item_id);
    }
    if (byDate.size === 0) return [];
    const { data: receipts, error: rErr } = await sb().from("restock_receipts")
      .select("date,item_id").eq("branch_id", branch).in("date", Array.from(byDate.keys()));
    if (rErr) throw rErr;
    const confirmedByDate = new Map<string, Set<string>>();
    for (const r of receipts ?? []) {
      if (!confirmedByDate.has(r.date)) confirmedByDate.set(r.date, new Set());
      confirmedByDate.get(r.date)!.add(r.item_id);
    }
    const out: RestockSheetSummary[] = [];
    for (const [date, items] of byDate) {
      const confirmed = confirmedByDate.get(date) ?? new Set();
      const pending = Array.from(items).filter((id) => !confirmed.has(id)).length;
      if (pending === 0) continue;
      out.push({ date, pendingCount: pending, totalCount: items.size });
    }
    return out.sort((a, b) => (a.date < b.date ? -1 : 1));
  },

  async getRestockReceiptStatus(branch: Branch, date: string): Promise<RestockReceiptStatus[]> {
    const [selRes, receiptRes, meta] = await Promise.all([
      sb().from("restock_selections").select("item_id,qty,qty_g").eq("branch_id", branch).eq("date", date).eq("selected", true),
      sb().from("restock_receipts").select("item_id,received_qty,received_qty_g,is_extra,not_received,note,confirmed_by_name,confirmed_at").eq("branch_id", branch).eq("date", date),
      this.getMeta(),
    ]);
    if (selRes.error) throw selRes.error;
    if (receiptRes.error) throw receiptRes.error;
    const itemMap = new Map(meta.items.map((it) => [it.id, it]));
    const receiptMap = new Map((receiptRes.data ?? []).map((r: any) => [r.item_id, r]));
    const out: RestockReceiptStatus[] = (selRes.data ?? []).map((r: any) => {
      const it = itemMap.get(r.item_id);
      const receipt = receiptMap.get(r.item_id);
      return {
        itemId: r.item_id, name: it?.name ?? r.item_id, unit: it?.unit ?? "",
        orderedQty: Number(r.qty), orderedQtyG: Number(r.qty_g),
        receivedQty: receipt ? Number((receipt as any).received_qty) : null,
        receivedQtyG: receipt ? Number((receipt as any).received_qty_g) : null,
        isExtra: false, notReceived: (receipt as any)?.not_received ?? false,
        note: (receipt as any)?.note ?? undefined,
        confirmedByName: (receipt as any)?.confirmed_by_name ?? undefined,
        confirmedAt: (receipt as any)?.confirmed_at ?? undefined,
      };
    });
    for (const receipt of (receiptRes.data ?? []) as any[]) {
      if (!receipt.is_extra) continue;
      const it = itemMap.get(receipt.item_id);
      out.push({
        itemId: receipt.item_id, name: it?.name ?? receipt.item_id, unit: it?.unit ?? "",
        orderedQty: 0, orderedQtyG: 0,
        receivedQty: Number(receipt.received_qty), receivedQtyG: Number(receipt.received_qty_g),
        isExtra: true, notReceived: receipt.not_received ?? false,
        note: receipt.note ?? undefined,
        confirmedByName: receipt.confirmed_by_name ?? undefined, confirmedAt: receipt.confirmed_at ?? undefined,
      });
    }
    return out;
  },

  async confirmRestockReceipt(
    branch: Branch, date: string, itemId: string, receivedQty: number, receivedQtyG: number,
    isExtra: boolean, userId: string, userName: string, note = "", notReceived = false
  ): Promise<void> {
    const now = new Date().toISOString();
    const { data: existingReceipt } = await sb().from("restock_receipts")
      .select("confirmed_at,not_received,received_qty,received_qty_g")
      .eq("branch_id", branch).eq("date", date).eq("item_id", itemId).maybeSingle();
    const wasCounted = !!existingReceipt && !existingReceipt.not_received;
    // แก้ไขจำนวนของรายการที่เคยนับเข้าสต็อกแล้ว → ใช้วันที่ยืนยันเดิม ไม่เลื่อน auto-fill มาวันนี้
    // (กันเผลอแก้ใบเก่าแล้วยอดไปโผล่วันนี้แทน) ใช้ "วันนี้" เฉพาะตอนนับเข้าสต็อกครั้งแรกจริง ๆ
    const confirmedAt: string = wasCounted ? existingReceipt!.confirmed_at : now;

    let orderedQty = 0;
    let orderedQtyG = 0;
    if (!isExtra) {
      const { data: sel } = await sb().from("restock_selections")
        .select("qty,qty_g").eq("branch_id", branch).eq("date", date).eq("item_id", itemId).maybeSingle();
      orderedQty = sel ? Number(sel.qty) : 0;
      orderedQtyG = sel ? Number(sel.qty_g) : 0;
    }
    const { error } = await sb().from("restock_receipts").upsert({
      date, branch_id: branch, item_id: itemId, ordered_qty: orderedQty,
      received_qty: receivedQty, received_qty_g: receivedQtyG, is_extra: isExtra, not_received: notReceived, note,
      confirmed_by_user_id: userId, confirmed_by_name: userName, confirmed_at: confirmedAt,
    }, { onConflict: "date,branch_id,item_id" });
    if (error) throw error;

    const { data: itemRow } = await sb().from("items").select("name").eq("id", itemId).maybeSingle();
    const itemName = itemRow?.name ?? itemId;
    const fmtQty = (pack: number, g: number) => `${pack}${g ? ` +${g}g` : ""}`;
    // พนักงานแก้ไขจำนวน/สถานะรับเข้าของรายการที่เคยยืนยันไปแล้ว → แจ้งเตือนแอดมินให้ตรวจสอบทุกครั้ง
    if (existingReceipt && (
      Number(existingReceipt.received_qty) !== receivedQty || Number(existingReceipt.received_qty_g) !== receivedQtyG || existingReceipt.not_received !== notReceived
    )) {
      const fromLabel = existingReceipt.not_received ? "ไม่ได้รับ" : fmtQty(Number(existingReceipt.received_qty), Number(existingReceipt.received_qty_g));
      const toLabel = notReceived ? "ไม่ได้รับ" : fmtQty(receivedQty, receivedQtyG);
      await sb().from("stock_admin_flags").insert({
        branch_id: branch, date, item_id: itemId, item_name: itemName,
        reason: "receipt_edited", detail: `${userName} แก้ไขยอดรับเข้าจาก ${fromLabel} เป็น ${toLabel}`,
      });
    }
    if (isExtra) {
      await sb().from("stock_admin_flags").insert({
        branch_id: branch, date, item_id: itemId, item_name: itemName,
        reason: "receipt_extra", detail: `เพิ่มนอกใบเดิม จำนวน ${fmtQty(receivedQty, receivedQtyG)}`,
      });
    } else if (notReceived) {
      await sb().from("stock_admin_flags").insert({
        branch_id: branch, date, item_id: itemId, item_name: itemName,
        reason: "receipt_not_received", detail: `ไม่ได้รับสินค้า (สั่งไว้ ${fmtQty(orderedQty, orderedQtyG)})`,
      });
    } else if (receivedQty !== orderedQty || receivedQtyG !== orderedQtyG) {
      await sb().from("stock_admin_flags").insert({
        branch_id: branch, date, item_id: itemId, item_name: itemName,
        reason: "receipt_mismatch", detail: `สั่งไว้ ${fmtQty(orderedQty, orderedQtyG)} ได้รับจริง ${fmtQty(receivedQty, receivedQtyG)}`,
      });
    }

    if (!wasCounted && notReceived) return; // ไม่เคยนับเข้าสต็อกและตอนนี้ก็ยังไม่ได้รับ ไม่ต้องแตะ
    // รวมยอด auto-fill ของ "วันที่นับเข้าสต็อกจริง" ใหม่เสมอ — ครอบคลุมทั้งนับใหม่ / แก้จำนวน / เปลี่ยนเป็น-จาก "ไม่ได้รับ"
    await recomputeAutoFillForToday(branch, itemId, confirmedAt.slice(0, 10));
  },

  // ยืนยันรับทีเดียวหลายรายการ (กด "ยืนยันทั้งหมด") — วน confirmRestockReceipt ต่อรายการ
  async batchConfirmRestockReceipt(
    branch: Branch, date: string,
    entries: { itemId: string; receivedQty: number; receivedQtyG: number; isExtra: boolean; notReceived: boolean; note?: string }[],
    userId: string, userName: string
  ): Promise<void> {
    for (const e of entries) {
      await this.confirmRestockReceipt(branch, date, e.itemId, e.receivedQty, e.receivedQtyG, e.isExtra, userId, userName, e.note ?? "", e.notReceived);
    }
  },

  // ยกเลิกยืนยันรับ (พลาดติ๊ก) — ลบ receipt แล้วคำนวณ auto-fill ของวันนั้นใหม่จากรายการที่เหลือ (กันเคสมีหลายใบวันเดียวกัน)
  async unconfirmRestockReceipt(branch: Branch, date: string, itemId: string): Promise<void> {
    const { data: receipt } = await sb().from("restock_receipts")
      .select("received_qty,received_qty_g,confirmed_at,not_received")
      .eq("branch_id", branch).eq("date", date).eq("item_id", itemId).maybeSingle();
    if (!receipt) return;
    const { error: delErr } = await sb().from("restock_receipts")
      .delete().eq("branch_id", branch).eq("date", date).eq("item_id", itemId);
    if (delErr) throw delErr;
    if (receipt.not_received) return; // "ไม่ได้รับ" ไม่เคยแตะสต็อก ไม่ต้องคืนค่าอะไร

    const todayStr = String(receipt.confirmed_at).slice(0, 10);
    await recomputeAutoFillForToday(branch, itemId, todayStr);
  },

  async getPendingReceiptCount(branch: Branch): Promise<number> {
    const sheets = await this.listOutstandingRestockSheets(branch);
    return sheets.reduce((sum, s) => sum + s.pendingCount, 0);
  },

  async listAdminFlags(includeResolved = false): Promise<AdminFlag[]> {
    let q = sb().from("stock_admin_flags").select("*").order("created_at", { ascending: false });
    if (!includeResolved) q = q.is("resolved_at", null);
    const { data, error } = await q;
    if (error) throw error;
    return (data ?? []).map((f: any) => ({
      id: f.id, branch: f.branch_id, date: f.date, itemId: f.item_id, itemName: f.item_name,
      reason: f.reason, detail: f.detail, createdAt: f.created_at,
      resolvedAt: f.resolved_at ?? undefined, resolvedBy: f.resolved_by ?? undefined,
    }));
  },

  async resolveAdminFlag(id: number, resolvedBy: string): Promise<void> {
    const { error } = await sb().from("stock_admin_flags")
      .update({ resolved_at: new Date().toISOString(), resolved_by: resolvedBy }).eq("id", id);
    if (error) throw error;
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
        in_stock_no_produce: i.inStockNoProduce ?? false,
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
            in_stock_no_produce: row.inStockNoProduce ?? false,
            updated_at: now,
          }).eq("id", row.id).eq("order_id", id);
          if (e3) throw e3;
        } else if (row.extraName) {
          const { error: e4 } = await sb().from("production_order_items").insert({
            order_id: id, item_id: null, branch_key: null, qty: row.qty, qty_g: row.qtyG,
            extra_name: row.extraName, extra_unit: row.extraUnit ?? null, extra_note: row.extraNote ?? null,
            in_stock_no_produce: row.inStockNoProduce ?? false,
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
    note: s.note ?? "", variance: s.variance, hasEntry: !!s.remain_confirmed,
  };
}

function rowFromProdOrderItemDb(r: any): ProductionOrderItem {
  return {
    id: r.id, itemId: r.item_id ?? undefined, branch: r.branch_key ?? undefined,
    qty: Number(r.qty), qtyG: Number(r.qty_g),
    extraName: r.extra_name ?? undefined, extraUnit: r.extra_unit ?? undefined, extraNote: r.extra_note ?? undefined,
    inStockNoProduce: r.in_stock_no_produce ?? false,
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
