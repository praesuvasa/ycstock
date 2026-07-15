// In-memory seeded store — default (ไม่ต้องต่อ DB). ใช้ dev/test/preview
// process เดียว (next dev / vercel lambda warm) → ข้อมูลคงอยู่ระหว่าง request
import type { Branch, StockRow, SalesRow, CupRow, RestockRow, Meta, CupSize } from "./types";
import { BRANCHES } from "./types";
import { ITEMS, PAR } from "./seed-data";
import { variance, restockNeed, isSpecialActive } from "./calc";

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
        return row;
      }
      const prev = latestBefore(branch, it.id, date);
      const carryPack = prev?.remainPack ?? 0;
      const carryG = prev?.remainG ?? 0;
      return {
        itemId: it.id, carryPack, carryG, inPack: 0, inG: 0, used: 0,
        remainPack: carryPack, remainG: carryG, returned: 0, note: "", variance: 0,
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

  getRestock(branch: Branch, weekday: "wed" | "sat"): { rows: RestockRow[]; specialActive: boolean } {
    seed();
    const active = isSpecialActive(branch, weekday);
    const rows: RestockRow[] = [];
    for (const it of ITEMS) {
      const par = PAR[it.id]?.[branch] ?? null;
      if (par == null) continue;                    // "-" ไม่ stock
      if (it.isSpecial && !active) continue;         // special เข้าเฉพาะวันของสาขา
      const rec = latestUpto(branch, it.id, "9999-99-99");
      const remain = rec?.remainPack ?? 0;
      rows.push({
        itemId: it.id, name: it.name, category: it.category, unit: it.unit,
        par, remain, need: restockNeed(par, remain), isSpecial: it.isSpecial,
      });
    }
    return { rows, specialActive: active };
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
    return sizes.map((size) => {
      const rec = cups.get(ck(date, branch, size));
      if (rec) { const { date: _d, branch: _b, ...row } = rec; return row; }
      // start = คงเหลือถ้วยเมื่อวาน (carry)
      let prev: CupRec | undefined;
      for (const c of cups.values()) {
        if (c.branch === branch && c.size === size && c.date < date) {
          if (!prev || c.date > prev.date) prev = c;
        }
      }
      return { size, start: prev?.remain ?? 0, in: 0, remain: prev?.remain ?? 0, sold: 0 };
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
};
