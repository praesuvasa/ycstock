// In-memory seeded store — default (ไม่ต้องต่อ DB). ใช้ dev/test/preview
// process เดียว (next dev / vercel lambda warm) → ข้อมูลคงอยู่ระหว่าง request
import type { Branch, StockRow, SalesRow, CupRow, RestockRow, Meta, CupSize, User, Role, BranchScope, AuditEntry, Weekday, Requisition, RestockSelectionEntry, ProdBranchKey, ProductionOrder, ProductionOrderSummary, ProductionOrderItem, ProductionOrderItemInput, BranchNotice, SalesEvidence, EvidenceType, MatchStatus, CashRemittance, RestockReceiptStatus, RestockSheetSummary, AdminFlag, AdminFlagReason } from "./types";
import { BRANCHES } from "./types";
import { ITEMS, PAR } from "./seed-data";
import { variance, restockNeed, isSpecialActive } from "./calc";
import { verifyPasscode, hashPasscode } from "./auth";

// ── users + audit (memory) ──
interface UserRec extends User { passcodeHash: string; }
const users: UserRec[] = [
  { id: "u-admin", name: "แพร (Admin)", role: "admin", branchScope: "all", active: true,
    passcodeHash: "e5a917c2ddfbda72c4473e37bb1fc5b9:69412f814f7f4838e05f09fa2ba1e4cd02a51be249c2efc25f50f0289afb37f8" }, // PIN 2538
];
const auditRows: AuditEntry[] = [];
const requisitions: Requisition[] = [];
let noticeSeq = 1;
const branchNotices: BranchNotice[] = [];

// ── หลักฐานยอดขาย / การโอนเงินสด (v1.7) — เก็บ bytes ใน memory, ไม่มี real storage ในโหมด dev ──
const evidenceImages = new Map<string, { base64: string; contentType: string }>();
let evidenceSeq = 1;
type SalesEvidenceRec = SalesEvidence & { ocrTxnRef?: string | null };
type CashRemittanceRec = CashRemittance & { ocrTxnRef?: string | null };
const salesEvidenceRows: SalesEvidenceRec[] = [];
let remittanceSeq = 1;
const cashRemittanceRows: CashRemittanceRec[] = [];

interface StockRec extends StockRow {
  date: string; branch: Branch;
  // ค่าที่ auto-fill ให้ล่าสุดจากการยืนยันรับของ (v1.9) — ใช้ตรวจจับว่าพนักงานแก้ทับทีหลังไหม
  inAutoPack?: number;
  inAutoG?: number;
}
interface SalesRec extends SalesRow { date: string; branch: Branch; }
interface CupRec extends CupRow { date: string; branch: Branch; }

const stock = new Map<string, StockRec>();   // `${date}|${branch}|${itemId}`
const sales = new Map<string, SalesRec>();    // `${date}|${branch}`
const cups = new Map<string, CupRec>();       // `${date}|${branch}|${size}`

interface RestockSelectionRec { date: string; branch: Branch; itemId: string; selected: boolean; qty: number; qtyG: number; updatedByUserId: string; updatedByName: string; updatedAt: string; }
const restockSelections = new Map<string, RestockSelectionRec>(); // key = `${date}|${branch}|${itemId}` — ใช้ sk() เดิมได้เลย
const restockNotes = new Map<string, string>(); // key = `${branch}|${date}`

// ── ยืนยันรับของ (v1.9) ──
interface RestockReceiptRec {
  date: string; branch: Branch; itemId: string;
  orderedQty: number; receivedQty: number; receivedQtyG: number; isExtra: boolean; notReceived: boolean; note: string;
  confirmedByUserId: string; confirmedByName: string; confirmedAt: string;
}
const restockReceipts = new Map<string, RestockReceiptRec>(); // key = sk(date,branch,itemId)

interface AdminFlagRec {
  id: number; branch: Branch; date: string; itemId: string | null; itemName: string;
  reason: AdminFlagReason; detail: string; createdAt: string; resolvedAt?: string; resolvedBy?: string;
}
const adminFlags: AdminFlagRec[] = [];
let adminFlagSeq = 1;
function pushAdminFlag(branch: Branch, date: string, itemId: string | null, itemName: string, reason: AdminFlagReason, detail: string) {
  adminFlags.push({ id: adminFlagSeq++, branch, date, itemId, itemName, reason, detail, createdAt: new Date().toISOString() });
}

// ── ใบสั่งผลิต (v1.5) ──
interface ProductionOrderRec {
  id: number; orderDate: string; deliveryDate: string; note: string;
  createdByUserId: string; createdByName: string; createdAt: string; updatedAt: string;
}
interface ProductionOrderItemRec {
  id: number; orderId: number; itemId?: string; branch?: ProdBranchKey;
  qty: number; qtyG: number; extraName?: string; extraUnit?: string; extraNote?: string;
  confirmed: boolean; confirmedQty?: number; confirmedQtyG?: number;
  confirmedAt?: string; confirmedByUserId?: string; confirmedByName?: string;
  createdAt: string; updatedAt: string;
}
const productionOrders = new Map<number, ProductionOrderRec>();
const productionOrderItems = new Map<number, ProductionOrderItemRec>();
let prodOrderSeq = 1, prodItemSeq = 1;

function prodOrderItemToDto(r: ProductionOrderItemRec): ProductionOrderItem {
  return {
    id: r.id, itemId: r.itemId, branch: r.branch, qty: r.qty, qtyG: r.qtyG,
    extraName: r.extraName, extraUnit: r.extraUnit, extraNote: r.extraNote,
    confirmed: r.confirmed, confirmedQty: r.confirmedQty, confirmedQtyG: r.confirmedQtyG,
    confirmedAt: r.confirmedAt, confirmedByName: r.confirmedByName,
  };
}
function prodOrderToDto(h: ProductionOrderRec, items: ProductionOrderItemRec[]): ProductionOrder {
  return {
    id: h.id, orderDate: h.orderDate, deliveryDate: h.deliveryDate, note: h.note,
    items: items.map(prodOrderItemToDto),
    createdByName: h.createdByName, createdAt: h.createdAt, updatedAt: h.updatedAt,
  };
}

const sk = (d: string, b: Branch, i: string) => `${d}|${b}|${i}`;
const vk = (d: string, b: Branch) => `${d}|${b}`;
const ck = (d: string, b: Branch, s: CupSize) => `${d}|${b}|${s}`;

// ── seed prior day (2026-07-14) เพื่อให้ carry-forward มีค่า ──
let seeded = false;
function seed() {
  if (seeded) return;
  seeded = true;
  const PREV = "2026-07-14";
  for (const b of BRANCHES) {
    for (const it of ITEMS) {
      const par = PAR[it.id]?.[b];
      if (par == null) continue;
      const remainPack = Math.max(par - (it.sort % 3), 0); // ให้ต่างกันเล็กน้อย
      stock.set(sk(PREV, b, it.id), {
        date: PREV, branch: b, itemId: it.id,
        carryPack: par, carryG: 0, inPack: 0, inG: 0, used: it.sort % 3,
        remainPack, remainG: 0, returned: 0, note: "", variance: 0,
      });
    }
    // seed cups start
    const cupItems = ITEMS.filter((i) => i.isCup);
    for (const ci of cupItems) {
      cups.set(ck(PREV, b, ci.cupSize!), {
        date: PREV, branch: b, size: ci.cupSize!, start: 100, in: 0, remain: 60, sold: 40,
      });
    }
    // seed one sales row
    sales.set(vk(PREV, b), {
      date: PREV, branch: b, cash: 165, qr: 9213, edc: 0, grab: 1535, lineman: 0,
    });
  }
}

// most-recent stock rec for item+branch strictly before `date`
function latestBefore(branch: Branch, itemId: string, date: string): StockRec | undefined {
  let best: StockRec | undefined;
  for (const rec of stock.values()) {
    if (rec.branch !== branch || rec.itemId !== itemId) continue;
    if (rec.date >= date) continue;
    if (!best || rec.date > best.date) best = rec;
  }
  return best;
}
// most-recent stock rec up to & including `date`
function latestUpto(branch: Branch, itemId: string, date: string): StockRec | undefined {
  let best: StockRec | undefined;
  for (const rec of stock.values()) {
    if (rec.branch !== branch || rec.itemId !== itemId) continue;
    if (rec.date > date) continue;
    if (!best || rec.date > best.date) best = rec;
  }
  return best;
}

// รวมยอด "รับเข้า" ของวันนี้ใหม่จากทุก receipt ที่ยืนยันจริงวันนี้ (ไม่รวม not_received) — SET เป็นค่าที่คำนวณใหม่เสมอ
// กันบั๊ก: ถ้ามีมากกว่า 1 ใบของ item เดียวกันถูกยืนยันวันเดียวกัน (ใบเก่าค้างมาส่งช้า + ใบใหม่) ต้องบวกรวมกัน ไม่ใช่ทับกัน
function recomputeAutoFillForToday(branch: Branch, itemId: string, todayStr: string): void {
  let sumPack = 0, sumG = 0;
  for (const r of restockReceipts.values()) {
    if (r.branch !== branch || r.itemId !== itemId || r.notReceived) continue;
    if (r.confirmedAt.slice(0, 10) !== todayStr) continue;
    sumPack += r.receivedQty;
    sumG += r.receivedQtyG;
  }
  const key = sk(todayStr, branch, itemId);
  const existing = stock.get(key);
  if (existing) {
    if (existing.inAutoPack === undefined) return; // พนักงานแก้ทับไปแล้ว ไม่แตะต่อ
    stock.set(key, { ...existing, inPack: sumPack, inG: sumG, inAutoPack: sumPack, inAutoG: sumG });
  } else {
    const prev = latestBefore(branch, itemId, todayStr);
    const carryPack = prev?.remainPack ?? 0;
    const carryG = prev?.remainG ?? 0;
    stock.set(key, {
      date: todayStr, branch, itemId, carryPack, carryG, inPack: sumPack, inG: sumG, used: 0,
      remainPack: carryPack + sumPack, remainG: carryG + sumG, returned: 0, note: "", variance: 0,
      inAutoPack: sumPack, inAutoG: sumG,
    });
  }
}

export const memoryStore = {
  getMeta(): Meta {
    seed();
    return { branches: BRANCHES, items: ITEMS, par: PAR };
  },

  setItemConfig(itemId: string, cfg: { hasRemainder: boolean; gramsPerUOM: number; remainderGroup?: string }) {
    const it = ITEMS.find((x) => x.id === itemId);
    if (it) {
      it.hasRemainder = cfg.hasRemainder;
      it.gramsPerUOM = cfg.gramsPerUOM;
      it.remainderGroup = cfg.remainderGroup && cfg.remainderGroup.trim() ? cfg.remainderGroup.trim() : undefined;
    }
    return { ok: true };
  },

  getStock(branch: Branch, date: string): StockRow[] {
    seed();
    return ITEMS.map((it) => {
      const saved = stock.get(sk(date, branch, it.id));
      if (saved) {
        const { date: _d, branch: _b, ...row } = saved;
        return { ...row, hasEntry: true };
      }
      const prev = latestBefore(branch, it.id, date);
      const carryPack = prev?.remainPack ?? 0;
      const carryG = prev?.remainG ?? 0;
      return {
        itemId: it.id, carryPack, carryG, inPack: 0, inG: 0, used: 0,
        remainPack: carryPack, remainG: carryG, returned: 0, note: "", variance: 0, hasEntry: false,
      };
    });
  },

  saveStock(branch: Branch, date: string, rows: StockRow[]) {
    seed();
    let updated = 0, inserted = 0;
    for (const r of rows) {
      const key = sk(date, branch, r.itemId);
      const v = variance(r.carryPack, r.inPack, r.used, r.returned, r.remainPack);
      const existing = stock.get(key);
      if (existing) updated++; else inserted++;
      let inAutoPack = existing?.inAutoPack;
      let inAutoG = existing?.inAutoG;
      // พนักงานแก้ทับค่าที่ระบบ auto-fill ให้ (จากการยืนยันรับของ) — เตือนแอดมินครั้งเดียวแล้วเลิกติดตาม กันแจ้งซ้ำทุกครั้งที่กด save
      if (inAutoPack != null && (r.inPack !== inAutoPack || r.inG !== (inAutoG ?? 0))) {
        const it = ITEMS.find((x) => x.id === r.itemId);
        pushAdminFlag(branch, date, r.itemId, it?.name ?? r.itemId, "stock_override",
          `ระบบเติมให้ ${inAutoPack} → พนักงานแก้เป็น ${r.inPack}`);
        inAutoPack = undefined; inAutoG = undefined;
      }
      stock.set(key, { ...r, date, branch, variance: v, inAutoPack, inAutoG });
    }
    return { ok: true, updated, inserted };
  },

  getRestock(branch: Branch, weekday: Weekday): { rows: RestockRow[]; specialActive: boolean } {
    seed();
    const active = isSpecialActive(branch, weekday);
    const today = new Date().toISOString().slice(0, 10);
    const todayStock = this.getStock(branch, today);
    const remainMap = new Map(todayStock.map((s) => [s.itemId, s.remainPack]));
    const remainGMap = new Map(todayStock.map((s) => [s.itemId, s.remainG]));
    const rows: RestockRow[] = [];
    for (const it of ITEMS) {
      const par = PAR[it.id]?.[branch] ?? null;
      if (par == null) continue;                    // "-" ไม่ stock
      // ไม่ตัด special ที่ไม่ถึงรอบออกอีกต่อไป — ส่งกลับมาให้หน้า UI แยกไปโชว์ในส่วน "สั่งฉุกเฉินนอกรอบ" แทน
      const remain = remainMap.get(it.id) ?? 0;
      rows.push({
        itemId: it.id, name: it.name, category: it.category, unit: it.unit,
        par, remain, need: restockNeed(par, remain), isSpecial: it.isSpecial,
        remainG: it.showRemainderOnRestock ? (remainGMap.get(it.id) ?? 0) : undefined,
        isCup: it.isCup || undefined, hasVariableYield: it.variableYield || undefined,
      });
    }
    return { rows, specialActive: active };
  },

  // สรุปรายการที่ "รับเข้า" (inPack/inG > 0) ของวันนั้น — ใช้หน้าประวัติสินค้าเข้า
  getStockIn(branch: Branch, date: string): { itemId: string; name: string; category: string; unit: string; inPack: number; inG: number }[] {
    seed();
    const rows: { itemId: string; name: string; category: string; unit: string; inPack: number; inG: number }[] = [];
    for (const it of ITEMS) {
      const rec = stock.get(sk(date, branch, it.id));
      if (!rec) continue;
      if (rec.inPack <= 0 && rec.inG <= 0) continue;
      rows.push({ itemId: it.id, name: it.name, category: it.category, unit: it.unit, inPack: rec.inPack, inG: rec.inG });
    }
    return rows;
  },

  // N วันล่าสุด (รวมวันนี้) + จำนวนรายการที่มีของเข้าวันนั้น — ใช้เป็น quick-list ในหน้าประวัติสินค้าเข้า
  getRecentStockInDays(branch: Branch, days: number): { date: string; count: number }[] {
    seed();
    const counts = new Map<string, number>();
    for (const rec of stock.values()) {
      if (rec.branch !== branch) continue;
      if (rec.inPack <= 0 && rec.inG <= 0) continue;
      counts.set(rec.date, (counts.get(rec.date) ?? 0) + 1);
    }
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

  getSales(branch: Branch, date: string): SalesRow {
    seed();
    const rec = sales.get(vk(date, branch));
    if (rec) { const { date: _d, branch: _b, ...row } = rec; return row; }
    return { cash: 0, qr: 0, edc: 0, grab: 0, lineman: 0 };
  },

  saveSales(branch: Branch, date: string, row: SalesRow) {
    seed();
    sales.set(vk(date, branch), { ...row, date, branch });
    return { ok: true };
  },

  getCups(branch: Branch, date: string): CupRow[] {
    seed();
    const sizes: CupSize[] = ["P", "S", "BOWL", "14OZ"];
    // ตั้งต้น/รับเข้า/คงเหลือ ดึงจากยอดถ้วยในหน้าสต็อก (แพ็ค×จำนวน/แพ็ค + เศษ) · sold กรอกเอง
    const stockById = new Map(this.getStock(branch, date).map((s) => [s.itemId, s]));
    return sizes.map((size) => {
      const it = ITEMS.find((i) => i.isCup && i.cupSize === size);
      const s = it ? stockById.get(it.id) : undefined;
      const conv = it?.gramsPerUOM || 50;
      const start = s ? s.carryPack * conv + s.carryG : 0;
      const inQ = s ? s.inPack * conv + s.inG : 0;
      const remain = s ? s.remainPack * conv + s.remainG : 0;
      const rec = cups.get(ck(date, branch, size));
      return { size, start, in: inQ, remain, sold: rec?.sold ?? 0 };
    });
  },

  saveCups(branch: Branch, date: string, rows: CupRow[]) {
    seed();
    for (const r of rows) cups.set(ck(date, branch, r.size), { ...r, date, branch });
    return { ok: true };
  },

  getDashboard(date: string) {
    seed();
    const lowStock: { branch: Branch; item: string; remain: number; par: number }[] = [];
    const salesToday: { branch: Branch; total: number }[] = [];
    const varianceAlerts: { branch: Branch; count: number }[] = [];
    for (const b of BRANCHES) {
      for (const it of ITEMS) {
        const par = PAR[it.id]?.[b];
        if (par == null) continue;
        const rec = latestUpto(b, it.id, date);
        const remain = rec?.remainPack ?? 0;
        if (remain < par) lowStock.push({ branch: b, item: it.name, remain, par });
      }
      const s = sales.get(vk(date, b));
      const total = s ? s.cash + s.qr + s.edc + s.grab + s.lineman : 0;
      salesToday.push({ branch: b, total });
      let count = 0;
      for (const rec of stock.values()) {
        if (rec.branch === b && rec.date === date && rec.variance !== 0) count++;
      }
      varianceAlerts.push({ branch: b, count });
    }
    return { lowStock, salesToday, varianceAlerts };
  },

  // ── auth / users ──
  getUserByPasscode(pin: string): User | null {
    const u = users.find((x) => x.active && verifyPasscode(pin, x.passcodeHash));
    if (!u) return null;
    const { passcodeHash, ...pub } = u;
    return pub;
  },
  listUsers(): User[] {
    return users.map(({ passcodeHash, ...pub }) => pub);
  },
  createUser(input: { name: string; role: Role; branchScope: BranchScope; passcode: string; createdBy: string }): User {
    const u: UserRec = {
      id: "u-" + Math.abs(Date.now() % 1_000_000).toString(36) + users.length,
      name: input.name, role: input.role, branchScope: input.branchScope, active: true,
      passcodeHash: hashPasscode(input.passcode),
    };
    users.push(u);
    const { passcodeHash, ...pub } = u;
    return pub;
  },
  updateUser(id: string, patch: { name?: string; role?: Role; branchScope?: BranchScope; active?: boolean; passcode?: string }): User | null {
    const u = users.find((x) => x.id === id);
    if (!u) return null;
    if (patch.name !== undefined) u.name = patch.name;
    if (patch.role !== undefined) u.role = patch.role;
    if (patch.branchScope !== undefined) u.branchScope = patch.branchScope;
    if (patch.active !== undefined) u.active = patch.active;
    if (patch.passcode) u.passcodeHash = hashPasscode(patch.passcode);
    const { passcodeHash, ...pub } = u;
    return pub;
  },

  // ── ขอเบิกสินค้า (ไม่มีสถานะ แค่ log ให้ restock/admin กวาดดู) ──
  createRequisition(input: Omit<Requisition, "id" | "createdAt">): Requisition {
    const rec: Requisition = {
      ...input,
      id: "req-" + Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
      createdAt: new Date().toISOString(),
    };
    requisitions.unshift(rec);
    return rec;
  },
  listRequisitions(filter: { userId?: string; branch?: string; limit?: number }): Requisition[] {
    let rows = requisitions;
    if (filter.userId) rows = rows.filter((r) => r.requestedByUserId === filter.userId);
    if (filter.branch) rows = rows.filter((r) => r.branch === filter.branch);
    return rows.slice(0, filter.limit ?? 100);
  },
  countUnseenRequisitions(): number {
    return requisitions.filter((r) => !r.seenAt).length;
  },
  markAllRequisitionsSeen(): void {
    const now = new Date().toISOString();
    for (const r of requisitions) if (!r.seenAt) r.seenAt = now;
  },

  // ── ประกาศพิเศษ (v1.6) ──
  listActiveNotices(branch: Branch): BranchNotice[] {
    return branchNotices
      .filter((n) => n.branch === null || n.branch === branch)
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  },
  listAllNotices(): BranchNotice[] {
    return [...branchNotices].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  },
  createNotice(input: { branch: Branch | null; message: string }, userName: string): BranchNotice {
    const rec: BranchNotice = {
      id: String(noticeSeq++), branch: input.branch, message: input.message,
      createdBy: userName, createdAt: new Date().toISOString(),
    };
    branchNotices.unshift(rec);
    return rec;
  },
  deleteNotice(id: string): void {
    const idx = branchNotices.findIndex((n) => n.id === id);
    if (idx >= 0) branchNotices.splice(idx, 1);
  },

  // ── หลักฐานยอดขาย (v1.7) ──
  uploadEvidenceImage(path: string, bytes: Buffer, contentType: string): void {
    evidenceImages.set(path, { base64: bytes.toString("base64"), contentType });
  },
  getEvidenceSignedUrl(path: string): string | null {
    const rec = evidenceImages.get(path);
    return rec ? `data:${rec.contentType};base64,${rec.base64}` : null;
  },
  upsertSalesEvidence(input: {
    branch: Branch; date: string; type: EvidenceType; imagePath: string; enteredAmount: number;
    ocrAmount: number | null; ocrNameMatch: boolean | null; matchStatus: MatchStatus;
    ocrTxnRef: string | null; ocrTxnTime: string | null; duplicateNote: string | null; mismatchNote: string | null;
    userId: string; userName: string;
  }): SalesEvidence {
    const idx = salesEvidenceRows.findIndex((r) => r.branch === input.branch && r.date === input.date && r.type === input.type);
    const rec: SalesEvidenceRec = {
      id: idx >= 0 ? salesEvidenceRows[idx].id : String(evidenceSeq++),
      branch: input.branch, date: input.date, type: input.type, imagePath: input.imagePath,
      enteredAmount: input.enteredAmount, ocrAmount: input.ocrAmount ?? undefined, ocrNameMatch: input.ocrNameMatch ?? undefined,
      matchStatus: input.matchStatus, duplicateNote: input.duplicateNote ?? undefined, mismatchNote: input.mismatchNote ?? undefined,
      ocrTxnRef: input.ocrTxnRef,
      uploadedBy: input.userName, createdAt: new Date().toISOString(),
    };
    if (idx >= 0) salesEvidenceRows[idx] = rec; else salesEvidenceRows.push(rec);
    return rec;
  },
  listSalesEvidence(branch: Branch, date: string): SalesEvidence[] {
    return salesEvidenceRows.filter((r) => r.branch === branch && r.date === date);
  },
  findDuplicateEvidence(
    txnRef: string, excludeBranch: Branch, excludeDate: string, excludeType: EvidenceType
  ): { branch: Branch; date: string; type: EvidenceType } | null {
    const hit = salesEvidenceRows.find((r) =>
      r.ocrTxnRef === txnRef && !(r.branch === excludeBranch && r.date === excludeDate && r.type === excludeType));
    return hit ? { branch: hit.branch, date: hit.date, type: hit.type } : null;
  },

  // ── การโอนเงินสด (v1.7) ──
  listUnremittedCashDays(branch: Branch): { date: string; cash: number }[] {
    const coveredDates = new Set(cashRemittanceRows.filter((r) => r.branch === branch).flatMap((r) => r.coveredDates));
    return [...sales.values()]
      .filter((r) => r.branch === branch && r.cash > 0 && !coveredDates.has(r.date))
      .map((r) => ({ date: r.date, cash: r.cash }))
      .sort((a, b) => a.date.localeCompare(b.date));
  },
  createCashRemittance(input: {
    branch: Branch; transferredAt: string; dates: string[]; declaredAmount: number; imagePath: string;
    ocrAmount: number | null; ocrNameMatch: boolean | null; matchStatus: MatchStatus;
    ocrTxnRef: string | null; ocrTxnTime: string | null; duplicateNote: string | null; mismatchNote: string | null;
    userId: string; userName: string;
  }): CashRemittance {
    const rec: CashRemittanceRec = {
      id: String(remittanceSeq++), branch: input.branch, transferredAt: input.transferredAt,
      declaredAmount: input.declaredAmount, imagePath: input.imagePath,
      ocrAmount: input.ocrAmount ?? undefined, ocrNameMatch: input.ocrNameMatch ?? undefined,
      matchStatus: input.matchStatus, duplicateNote: input.duplicateNote ?? undefined, mismatchNote: input.mismatchNote ?? undefined,
      ocrTxnRef: input.ocrTxnRef,
      coveredDates: [...input.dates].sort(),
      uploadedBy: input.userName, createdAt: new Date().toISOString(),
    };
    cashRemittanceRows.unshift(rec);
    return rec;
  },
  listCashRemittances(branch: Branch, limit = 50): CashRemittance[] {
    return cashRemittanceRows.filter((r) => r.branch === branch).slice(0, limit);
  },
  deleteCashRemittance(id: string): void {
    const idx = cashRemittanceRows.findIndex((r) => r.id === id);
    if (idx >= 0) cashRemittanceRows.splice(idx, 1);
  },
  findDuplicateRemittance(txnRef: string): { branch: Branch; transferredAt: string } | null {
    const hit = cashRemittanceRows.find((r) => r.ocrTxnRef === txnRef);
    return hit ? { branch: hit.branch, transferredAt: hit.transferredAt } : null;
  },

  // ── ตัวเลือกเติมของ (v1.4) ──
  getRestockSelections(branch: Branch, date: string): Record<string, { selected: boolean; qty: number; qtyG: number }> {
    const out: Record<string, { selected: boolean; qty: number; qtyG: number }> = {};
    for (const rec of restockSelections.values()) {
      if (rec.branch !== branch || rec.date !== date) continue;
      out[rec.itemId] = { selected: rec.selected, qty: rec.qty, qtyG: rec.qtyG };
    }
    return out;
  },

  saveRestockSelections(branch: Branch, date: string, entries: RestockSelectionEntry[], userId: string, userName: string) {
    const now = new Date().toISOString();
    for (const e of entries) {
      restockSelections.set(sk(date, branch, e.itemId), {
        date, branch, itemId: e.itemId, selected: e.selected, qty: e.qty, qtyG: e.qtyG,
        updatedByUserId: userId, updatedByName: userName, updatedAt: now,
      });
    }
    return { ok: true, savedCount: entries.length };
  },

  getRestockNote(branch: Branch, date: string): string {
    return restockNotes.get(`${branch}|${date}`) ?? "";
  },
  saveRestockNote(branch: Branch, date: string, note: string): void {
    restockNotes.set(`${branch}|${date}`, note);
  },

  // ── ยืนยันรับของ (v1.9) — ไม่ผูกวันนี้อย่างเดียว โชว์ "ทุกใบที่ยังยืนยันไม่ครบ" ของสาขานั้น ──
  listOutstandingRestockSheets(branch: Branch): RestockSheetSummary[] {
    const dates = new Set<string>();
    for (const rec of restockSelections.values()) {
      if (rec.branch === branch && rec.selected) dates.add(rec.date);
    }
    const out: RestockSheetSummary[] = [];
    for (const date of dates) {
      const selectedItems = Array.from(restockSelections.values()).filter((r) => r.branch === branch && r.date === date && r.selected);
      const total = selectedItems.length;
      const pending = selectedItems.filter((r) => !restockReceipts.has(sk(date, branch, r.itemId))).length;
      if (pending === 0) continue;
      out.push({ date, pendingCount: pending, totalCount: total });
    }
    return out.sort((a, b) => (a.date < b.date ? -1 : 1));
  },

  getRestockReceiptStatus(branch: Branch, date: string): RestockReceiptStatus[] {
    const selected = Array.from(restockSelections.values()).filter((r) => r.branch === branch && r.date === date && r.selected);
    const out: RestockReceiptStatus[] = selected.map((r) => {
      const it = ITEMS.find((x) => x.id === r.itemId);
      const receipt = restockReceipts.get(sk(date, branch, r.itemId));
      return {
        itemId: r.itemId, name: it?.name ?? r.itemId, unit: it?.unit ?? "",
        orderedQty: r.qty, orderedQtyG: r.qtyG,
        receivedQty: receipt?.receivedQty ?? null, receivedQtyG: receipt?.receivedQtyG ?? null,
        isExtra: false, notReceived: receipt?.notReceived ?? false,
        note: receipt?.note, confirmedByName: receipt?.confirmedByName, confirmedAt: receipt?.confirmedAt,
      };
    });
    for (const receipt of restockReceipts.values()) {
      if (receipt.branch !== branch || receipt.date !== date || !receipt.isExtra) continue;
      const it = ITEMS.find((x) => x.id === receipt.itemId);
      out.push({
        itemId: receipt.itemId, name: it?.name ?? receipt.itemId, unit: it?.unit ?? "",
        orderedQty: 0, orderedQtyG: 0, receivedQty: receipt.receivedQty, receivedQtyG: receipt.receivedQtyG,
        isExtra: true, notReceived: receipt.notReceived,
        note: receipt.note, confirmedByName: receipt.confirmedByName, confirmedAt: receipt.confirmedAt,
      });
    }
    return out;
  },

  confirmRestockReceipt(
    branch: Branch, date: string, itemId: string, receivedQty: number, receivedQtyG: number,
    isExtra: boolean, userId: string, userName: string, note = "", notReceived = false
  ): { ok: true } {
    seed();
    const now = new Date().toISOString();
    const key = sk(date, branch, itemId);
    const existingReceipt = restockReceipts.get(key);
    const wasCounted = !!existingReceipt && !existingReceipt.notReceived;
    // แก้ไขจำนวนของรายการที่เคยนับเข้าสต็อกแล้ว → ใช้วันที่ยืนยันเดิม ไม่เลื่อน auto-fill มาวันนี้
    // (กันเผลอแก้ใบเก่าแล้วยอดไปโผล่วันนี้แทน) ใช้ "วันนี้" เฉพาะตอนนับเข้าสต็อกครั้งแรกจริง ๆ
    const confirmedAt = wasCounted ? existingReceipt!.confirmedAt : now;
    const sel = restockSelections.get(sk(date, branch, itemId));
    const orderedQty = isExtra ? 0 : (sel?.qty ?? 0);
    const orderedQtyG = isExtra ? 0 : (sel?.qtyG ?? 0);
    restockReceipts.set(key, {
      date, branch, itemId, orderedQty, receivedQty, receivedQtyG, isExtra, notReceived, note,
      confirmedByUserId: userId, confirmedByName: userName, confirmedAt,
    });
    const it = ITEMS.find((x) => x.id === itemId);
    const itemName = it?.name ?? itemId;
    const fmtQty = (pack: number, g: number) => `${pack}${g ? ` +${g}g` : ""}`;
    // พนักงานแก้ไขจำนวน/สถานะรับเข้าของรายการที่เคยยืนยันไปแล้ว → แจ้งเตือนแอดมินให้ตรวจสอบทุกครั้ง
    if (existingReceipt && (
      existingReceipt.receivedQty !== receivedQty || existingReceipt.receivedQtyG !== receivedQtyG || existingReceipt.notReceived !== notReceived
    )) {
      const fromLabel = existingReceipt.notReceived ? "ไม่ได้รับ" : fmtQty(existingReceipt.receivedQty, existingReceipt.receivedQtyG);
      const toLabel = notReceived ? "ไม่ได้รับ" : fmtQty(receivedQty, receivedQtyG);
      pushAdminFlag(branch, date, itemId, itemName, "receipt_edited", `${userName} แก้ไขยอดรับเข้าจาก ${fromLabel} เป็น ${toLabel}`);
    }
    if (isExtra) {
      pushAdminFlag(branch, date, itemId, itemName, "receipt_extra", `เพิ่มนอกใบเดิม จำนวน ${fmtQty(receivedQty, receivedQtyG)}`);
    } else if (notReceived) {
      pushAdminFlag(branch, date, itemId, itemName, "receipt_not_received", `ไม่ได้รับสินค้า (สั่งไว้ ${fmtQty(orderedQty, orderedQtyG)})`);
    } else if (receivedQty !== orderedQty || receivedQtyG !== orderedQtyG) {
      pushAdminFlag(branch, date, itemId, itemName, "receipt_mismatch", `สั่งไว้ ${fmtQty(orderedQty, orderedQtyG)} ได้รับจริง ${fmtQty(receivedQty, receivedQtyG)}`);
    }
    if (!wasCounted && notReceived) return { ok: true }; // ไม่เคยนับเข้าสต็อกและตอนนี้ก็ยังไม่ได้รับ ไม่ต้องแตะ
    // รวมยอด auto-fill ของ "วันที่นับเข้าสต็อกจริง" ใหม่เสมอ — ครอบคลุมทั้งนับใหม่ / แก้จำนวน / เปลี่ยนเป็น-จาก "ไม่ได้รับ"
    recomputeAutoFillForToday(branch, itemId, confirmedAt.slice(0, 10));
    return { ok: true };
  },

  // ยืนยันรับทีเดียวหลายรายการ (กด "ยืนยันทั้งหมด") — วน confirmRestockReceipt ต่อรายการ
  batchConfirmRestockReceipt(
    branch: Branch, date: string,
    entries: { itemId: string; receivedQty: number; receivedQtyG: number; isExtra: boolean; notReceived: boolean; note?: string }[],
    userId: string, userName: string
  ): { ok: true } {
    for (const e of entries) {
      this.confirmRestockReceipt(branch, date, e.itemId, e.receivedQty, e.receivedQtyG, e.isExtra, userId, userName, e.note ?? "", e.notReceived);
    }
    return { ok: true };
  },

  // ยกเลิกยืนยันรับ (พลาดติ๊ก) — ลบ receipt แล้วคำนวณ auto-fill ของวันนั้นใหม่จากรายการที่เหลือ (กันเคสมีหลายใบวันเดียวกัน)
  unconfirmRestockReceipt(branch: Branch, date: string, itemId: string): void {
    const key = sk(date, branch, itemId);
    const receipt = restockReceipts.get(key);
    if (!receipt) return;
    restockReceipts.delete(key);
    if (receipt.notReceived) return; // "ไม่ได้รับ" ไม่เคยแตะสต็อก ไม่ต้องคืนค่าอะไร
    recomputeAutoFillForToday(branch, itemId, receipt.confirmedAt.slice(0, 10));
  },

  getPendingReceiptCount(branch: Branch): number {
    return this.listOutstandingRestockSheets(branch).reduce((sum, s) => sum + s.pendingCount, 0);
  },

  listAdminFlags(includeResolved = false): AdminFlag[] {
    return adminFlags
      .filter((f) => includeResolved || !f.resolvedAt)
      .sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1))
      .map((f) => ({ ...f }));
  },

  resolveAdminFlag(id: number, resolvedBy: string): void {
    const f = adminFlags.find((x) => x.id === id);
    if (f) { f.resolvedAt = new Date().toISOString(); f.resolvedBy = resolvedBy; }
  },

  // ── ใบสั่งผลิต (v1.5) — ตรรกะเดียวกับฝั่ง supabase แต่ทำงานบน Map ล้วนๆ ──
  listProductionOrders(limit = 50): ProductionOrderSummary[] {
    const orders = Array.from(productionOrders.values())
      .sort((a, b) => (a.orderDate < b.orderDate ? 1 : a.orderDate > b.orderDate ? -1 : (a.createdAt < b.createdAt ? 1 : -1)))
      .slice(0, limit);
    return orders.map((o) => {
      const items = Array.from(productionOrderItems.values()).filter((i) => i.orderId === o.id);
      return {
        id: o.id, orderDate: o.orderDate, deliveryDate: o.deliveryDate, note: o.note,
        itemCount: items.length, confirmedCount: items.filter((i) => i.confirmed).length,
        createdByName: o.createdByName, createdAt: o.createdAt, updatedAt: o.updatedAt,
      };
    });
  },

  getProductionOrder(id: number): ProductionOrder | null {
    const header = productionOrders.get(id);
    if (!header) return null;
    const items = Array.from(productionOrderItems.values()).filter((i) => i.orderId === id).sort((a, b) => a.id - b.id);
    return prodOrderToDto(header, items);
  },

  createProductionOrder(
    input: { orderDate: string; deliveryDate: string; note: string; items: ProductionOrderItemInput[] },
    userId: string, userName: string
  ): ProductionOrder {
    const now = new Date().toISOString();
    const id = prodOrderSeq++;
    const header: ProductionOrderRec = {
      id, orderDate: input.orderDate, deliveryDate: input.deliveryDate, note: input.note ?? "",
      createdByUserId: userId, createdByName: userName, createdAt: now, updatedAt: now,
    };
    productionOrders.set(id, header);
    const rows = input.items.filter((i) => (i.itemId && i.branch) ? (i.qty > 0 || i.qtyG > 0) : !!i.extraName);
    for (const i of rows) {
      const itemId = prodItemSeq++;
      productionOrderItems.set(itemId, {
        id: itemId, orderId: id, itemId: i.itemId, branch: i.itemId ? i.branch : undefined,
        qty: i.qty, qtyG: i.qtyG, extraName: i.extraName, extraUnit: i.extraUnit, extraNote: i.extraNote,
        confirmed: false, createdAt: now, updatedAt: now,
      });
    }
    return this.getProductionOrder(id)!;
  },

  updateProductionOrder(
    id: number,
    patch: { orderDate?: string; deliveryDate?: string; note?: string; items?: ProductionOrderItemInput[]; removedItemIds?: number[] }
  ): ProductionOrder | null {
    const header = productionOrders.get(id);
    if (!header) return null;
    const now = new Date().toISOString();
    if (patch.orderDate !== undefined) header.orderDate = patch.orderDate;
    if (patch.deliveryDate !== undefined) header.deliveryDate = patch.deliveryDate;
    if (patch.note !== undefined) header.note = patch.note;
    header.updatedAt = now;

    if (patch.items) {
      // (ก) แถวกริดหลัก — หา rec เดิมด้วย (orderId,itemId,branch) แก้ทับ/ไม่เจอก็สร้างใหม่ (เฉพาะ qty>0 หรือเคย save แล้ว — ดูข้อ 0.6)
      for (const i of patch.items.filter((r) => r.itemId && r.branch)) {
        const existing = Array.from(productionOrderItems.values())
          .find((r) => r.orderId === id && r.itemId === i.itemId && r.branch === i.branch);
        if (existing) {
          existing.qty = i.qty; existing.qtyG = i.qtyG; existing.updatedAt = now;
        } else if (i.qty > 0 || i.qtyG > 0) {
          const itemId = prodItemSeq++;
          productionOrderItems.set(itemId, {
            id: itemId, orderId: id, itemId: i.itemId, branch: i.branch,
            qty: i.qty, qtyG: i.qtyG, confirmed: false, createdAt: now, updatedAt: now,
          });
        }
      }
      // (ข) รายการพิเศษ — แยก insert/update ด้วย id (ไม่มี natural key)
      for (const row of patch.items.filter((r) => !r.itemId)) {
        if (row.id) {
          const existing = productionOrderItems.get(row.id);
          if (existing && existing.orderId === id) {
            existing.qty = row.qty; existing.qtyG = row.qtyG;
            existing.extraName = row.extraName; existing.extraUnit = row.extraUnit; existing.extraNote = row.extraNote;
            existing.updatedAt = now;
          }
        } else if (row.extraName) {
          const itemId = prodItemSeq++;
          productionOrderItems.set(itemId, {
            id: itemId, orderId: id, qty: row.qty, qtyG: row.qtyG,
            extraName: row.extraName, extraUnit: row.extraUnit, extraNote: row.extraNote,
            confirmed: false, createdAt: now, updatedAt: now,
          });
        }
      }
    }
    if (patch.removedItemIds?.length) {
      for (const rid of patch.removedItemIds) {
        const existing = productionOrderItems.get(rid);
        if (existing && existing.orderId === id && existing.itemId == null) productionOrderItems.delete(rid);
      }
    }
    return this.getProductionOrder(id);
  },
  deleteProductionOrder(id: number): void {
    productionOrders.delete(id);
    for (const [itemId, rec] of productionOrderItems) {
      if (rec.orderId === id) productionOrderItems.delete(itemId);
    }
  },

  updateProductionOrderItem(
    id: number,
    patch: { qty?: number; qtyG?: number; confirmed?: boolean; confirmedQty?: number; confirmedQtyG?: number },
    userId: string, userName: string
  ): ProductionOrderItem | null {
    const rec = productionOrderItems.get(id);
    if (!rec) return null;
    rec.updatedAt = new Date().toISOString();
    if (patch.qty !== undefined) rec.qty = patch.qty;
    if (patch.qtyG !== undefined) rec.qtyG = patch.qtyG;
    if (patch.confirmed !== undefined) {
      const wasConfirmed = rec.confirmed;
      rec.confirmed = patch.confirmed;
      if (patch.confirmed && !wasConfirmed) {
        rec.confirmedAt = new Date().toISOString();
        rec.confirmedByUserId = userId;
        rec.confirmedByName = userName;
        // default confirmed_qty = qty ปัจจุบัน ถ้า client ไม่ได้ส่งมาเอง และยังไม่เคยมีค่านี้ (ดูข้อ 0.4)
        if (patch.confirmedQty === undefined && rec.confirmedQty == null) rec.confirmedQty = patch.qty ?? rec.qty;
        if (patch.confirmedQtyG === undefined && rec.confirmedQtyG == null) rec.confirmedQtyG = patch.qtyG ?? rec.qtyG;
      }
    }
    if (patch.confirmedQty !== undefined) rec.confirmedQty = patch.confirmedQty;
    if (patch.confirmedQtyG !== undefined) rec.confirmedQtyG = patch.confirmedQtyG;
    return prodOrderItemToDto(rec);
  },

  // ── audit ──
  writeAudit(e: Omit<AuditEntry, "id" | "ts">): void {
    auditRows.unshift({ ...e, id: "a" + auditRows.length, ts: new Date().toISOString() });
  },
  listAudit(filter: { userId?: string; branch?: string; action?: string; limit?: number }): AuditEntry[] {
    let rows = auditRows;
    if (filter.userId) rows = rows.filter((r) => r.userId === filter.userId);
    if (filter.branch) rows = rows.filter((r) => r.branch === filter.branch);
    if (filter.action) rows = rows.filter((r) => r.action === filter.action);
    return rows.slice(0, filter.limit ?? 200);
  },
};
