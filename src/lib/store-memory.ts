// In-memory seeded store — default (ไม่ต้องต่อ DB). ใช้ dev/test/preview
// process เดียว (next dev / vercel lambda warm) → ข้อมูลคงอยู่ระหว่าง request
import type { Branch, StockRow, SalesRow, CupRow, RestockRow, Meta, CupSize, User, Role, BranchScope, AuditEntry, Weekday, Requisition } from "./types";
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

interface StockRec extends StockRow { date: string; branch: Branch; }
interface SalesRec extends SalesRow { date: string; branch: Branch; }
interface CupRec extends CupRow { date: string; branch: Branch; }

const stock = new Map<string, StockRec>();   // `${date}|${branch}|${itemId}`
const sales = new Map<string, SalesRec>();    // `${date}|${branch}`
const cups = new Map<string, CupRec>();       // `${date}|${branch}|${size}`

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
      if (stock.has(key)) updated++; else inserted++;
      stock.set(key, { ...r, date, branch, variance: v });
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
      if (it.isSpecial && !active) continue;         // special เข้าเฉพาะวันของสาขา
      const remain = remainMap.get(it.id) ?? 0;
      rows.push({
        itemId: it.id, name: it.name, category: it.category, unit: it.unit,
        par, remain, need: restockNeed(par, remain), isSpecial: it.isSpecial,
        remainG: it.showRemainderOnRestock ? (remainGMap.get(it.id) ?? 0) : undefined,
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
