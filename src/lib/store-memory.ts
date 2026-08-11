// In-memory seeded store — default (ไม่ต้องต่อ DB). ใช้ dev/test/preview
// process เดียว (next dev / vercel lambda warm) → ข้อมูลคงอยู่ระหว่าง request
import type { ScheduleRequest, ScheduleRow, ItemBrand, Branch, StockRow, SalesRow, CupRow, RestockRow, Meta, CupSize, User, Role, BranchScope, AuditEntry, Weekday, Requisition, RestockSelectionEntry, RestockExtraItem, ReturnHistoryRow, PaymentIncident, PaymentIncidentKind, ExpiryCheckRow, ProdBranchKey, ProductionOrder, ProductionOrderSummary, ProductionOrderItem, ProductionOrderItemInput, BranchNotice, SalesEvidence, EvidenceType, MatchStatus, CashRemittance, RestockReceiptStatus, RestockSheetSummary, AdminFlag, AdminFlagReason, PendingReturnRow, TimeClockEntry, TimeClockSettings, StaffAllowanceUse, AllowanceSummary, StaffFeedback } from "./types";
import { BRANCHES } from "./types";
import { ITEMS, PAR } from "./seed-data";
import { variance, restockNeed, isSpecialActive, monthRange, ALLOWANCE_DEFAULT_MONTHLY, incidentAdjustment } from "./calc";
import { todayBangkok } from "./fmt";
import { verifyPasscode, hashPasscode, generateSetupCode, SETUP_CODE_TTL_HOURS } from "./auth";

// ── users + audit (memory) ──
interface UserRec extends User {
  passcodeHash: string | null;            // null = ยังไม่ได้ตั้ง PIN (มีแต่รหัสตั้งค่า)
  setupCodeHash?: string | null;
  setupCodeExpiresAt?: number | null;     // epoch ms
}
const users: UserRec[] = [
  { id: "u-admin", name: "แพร (Admin)", role: "admin", branchScope: "all", active: true,
    passcodeHash: "e5a917c2ddfbda72c4473e37bb1fc5b9:69412f814f7f4838e05f09fa2ba1e4cd02a51be249c2efc25f50f0289afb37f8" }, // PIN 2538
];
const auditRows: AuditEntry[] = [];
const requisitions: Requisition[] = [];
// ISO timestamp → วันที่ตามเวลาไทย (YYYY-MM-DD) — ใช้กรองคำขอเบิกเป็นรายวัน
const bangkokDateOf = (iso: string): string =>
  new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Bangkok" }).format(new Date(iso));
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
  // พนักงานกดยืนยันยอด "คงเหลือ" เองที่หน้าสต็อกแล้วหรือยัง (v1.9.3) — true เฉพาะตอน save ผ่านหน้าสต็อกจริง
  // แถวที่เกิดจาก auto-fill รับของอย่างเดียว (ยังไม่มีใครมานับ/ยืนยันคงเหลือ) จะเป็น false ไว้ก่อน
  remainConfirmed?: boolean;
  // ส่วนของ used/returned ที่มาจากผลตรวจวันหมดอายุ (v1.12) — ใช้ถอนของเก่าตอนบันทึกซ้ำ
  expiryReturned?: number;
  expiryUsed?: number;
  // ส่วนของ "รับเข้า" ที่มาจากการแกะรายการอื่นมารวม เก็บเป็นกรัมรวม (ดู migration 0041 ข้อ 4)
}
interface SalesRec extends SalesRow { date: string; branch: Branch; }
interface CupRec extends CupRow { date: string; branch: Branch; }

const stock = new Map<string, StockRec>();   // `${date}|${branch}|${itemId}`
const sales = new Map<string, SalesRec>();    // `${date}|${branch}`
const cups = new Map<string, CupRec>();       // `${date}|${branch}|${size}`

interface RestockSelectionRec { date: string; branch: Branch; itemId: string; selected: boolean; qty: number; qtyG: number; qtyG2: number; updatedByUserId: string; updatedByName: string; updatedAt: string; }
const restockSelections = new Map<string, RestockSelectionRec>(); // key = `${date}|${branch}|${itemId}` — ใช้ sk() เดิมได้เลย
const appSettings = new Map<string, string>([["time_clock_enabled", "0"], ["time_clock_require_face", "1"]]);
const faceEnrollments = new Map<string, { faceId: string | null; enrolledAt: string | null; allowedUntil: string | null }>();
const timeClock = new Map<number, TimeClockEntry>();
let timeClockSeq = 1;
const dispatchedReturnKeys = new Set<string>(); // `${branch}|${checkDate}|${index}` ที่ฝากรถไปแล้ว
const restockNotes = new Map<string, string>(); // key = `${branch}|${date}`

// รายการที่ไม่มีให้เลือกในระบบ (v1.10) — key = `${branch}|${date}` เก็บทั้งชุดต่อคู่ (ไม่ผูก itemId)
interface RestockExtraRec {
  name: string; qty: number; note: string;
  createdByUserId: string; createdByName: string; createdAt: string;
}
const restockExtraItems = new Map<string, RestockExtraRec[]>();

// เคส "รับเงินไม่ตรงบิล" (v1.11) — key = `${branch}|${date}` เก็บทั้งชุดต่อคู่
interface PaymentIncidentRec {
  kind: PaymentIncidentKind; billAmount: number; actualAmount: number; note: string;
  createdByUserId: string; createdByName: string; createdAt: string;
}
const paymentIncidents = new Map<string, PaymentIncidentRec[]>();

// ตรวจวันหมดอายุ (v1.12) — key = `${branch}|${checkDate}` เก็บทั้งชุดต่อรอบตรวจ
const expiryChecks = new Map<string, ExpiryCheckRow[]>();

// สิทธิ์ซื้อของในร้าน (v1.13) — 1 แถว = 1 บิลที่ใช้สิทธิ์
const allowanceUses: StaffAllowanceUse[] = [];

// ความคิดเห็น/ข้อเสนอแนะ (v1.18)
const feedbackRows: StaffFeedback[] = [];
let feedbackSeq = 1;
let allowanceSeq = 1;

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
  editedBy?: string;
}
const adminFlags: AdminFlagRec[] = [];
let adminFlagSeq = 1;
function pushAdminFlag(branch: Branch, date: string, itemId: string | null, itemName: string, reason: AdminFlagReason, detail: string, editedBy?: string) {
  adminFlags.push({ id: adminFlagSeq++, branch, date, itemId, itemName, reason, detail, createdAt: new Date().toISOString(), editedBy });
}

// ── ใบสั่งผลิต (v1.5) ──
interface ProductionOrderRec {
  id: number; orderDate: string; deliveryDate: string; note: string;
  createdByUserId: string; createdByName: string; createdAt: string; updatedAt: string;
}
interface ProductionOrderItemRec {
  id: number; orderId: number; itemId?: string; branch?: ProdBranchKey;
  qty: number; qtyG: number; extraName?: string; extraUnit?: string; extraNote?: string;
  inStockNoProduce?: boolean;
  haveStockQty?: number; haveStockG?: number; haveStockGText?: string;
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
    inStockNoProduce: r.inStockNoProduce ?? false,
    haveStockQty: r.haveStockQty ?? 0, haveStockG: r.haveStockG ?? 0,
    haveStockGText: r.haveStockGText ?? "",
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
    // พนักงานกรอกเอง/แก้ทับไปแล้ว → ไม่แตะต่อ · แต่ถ้ายอดไม่ตรงกันต้องเข้าคิวให้แอดมินดู (v1.20)
    if (existing.inAutoPack === undefined) {
      if (existing.inPack !== sumPack || existing.inG !== sumG) {
        pushAdminFlag(
          branch, todayStr, itemId,
          ITEMS.find((i) => i.id === itemId)?.name ?? itemId,
          "receipt_vs_manual",
          `กรอกเองที่หน้าสต็อก ${existing.inPack}${existing.inG ? ` +${existing.inG}g` : ""}` +
            ` · ยืนยันรับของ ${sumPack}${sumG ? ` +${sumG}g` : ""}` +
            ` — ระบบคงยอดที่กรอกเองไว้ ไม่ได้แก้ให้`
        );
      }
      return;
    }
    // ยืนยันรับของหลังมีคนนับ+ยืนยันคงเหลือไปแล้ว → รับเข้าเปลี่ยน แต่คงเหลือยังเป็นเลขที่นับก่อนของมา
    // ผลต่างเปลี่ยนเงียบ ๆ หลังคนนับปิดงาน — ต้องมีคนมาดู (แพรถามเคสนี้ 2026-07-29)
    if ((existing.inPack !== sumPack || existing.inG !== sumG) && existing.remainConfirmed) {
      pushAdminFlag(
        branch, todayStr, itemId,
        ITEMS.find((i) => i.id === itemId)?.name ?? itemId,
        "receipt_after_count",
        `นับสต็อกไปแล้ว (คงเหลือ ${existing.remainPack})` +
          ` · ยืนยันรับของทีหลัง รับเข้า ${existing.inPack} → ${sumPack}` +
          ` — ระบบอัปเดตรับเข้าให้แล้ว แต่คงเหลือยังเป็นยอดที่นับก่อนของมา`
      );
    }
    // "รับเข้า" = ของจากรถส่งอย่างเดียวแล้ว (v1.17) — ของที่แกะย้ายไปอยู่ transferInG
    stock.set(key, {
      ...existing, inPack: sumPack, inG: sumG, inAutoPack: sumPack, inAutoG: sumG,
      // คิดผลต่างใหม่ให้ตรงกับยอดรับเข้าชุดใหม่ ไม่ให้เลขเก่าค้าง
      variance: variance(existing.carryPack, sumPack, existing.used, existing.returned, existing.remainPack),
    });
  } else {
    const prev = latestBefore(branch, itemId, todayStr);
    const carryPack = prev?.remainPack ?? 0;
    const carryG = prev?.remainG ?? 0;
    stock.set(key, {
      date: todayStr, branch, itemId, carryPack, carryG, inPack: sumPack, inG: sumG, used: 0,
      remainPack: carryPack + sumPack, remainG: carryG + sumG, returned: 0, note: "", variance: 0,
      inAutoPack: sumPack, inAutoG: sumG, remainConfirmed: false,
    });
  }
}

export const memoryStore = {
  getMeta(): Meta {
    seed();
    return { branches: BRANCHES, items: ITEMS, par: PAR };
  },

  // โหมด dev ยังไม่มีตารางกะ (ข้อมูลจริงอยู่ที่ Supabase อย่างเดียว) — คืนว่างไว้ก่อน
  listSchedules(_branch: Branch, _date: string): ScheduleRow[] {
    return [];
  },

  listSchedulesMonth(_branch: Branch, _month: string): (ScheduleRow & { workDate: string })[] {
    return [];
  },

  // โหมด dev ไม่มีตารางกะ — คำขอเปลี่ยนตารางจึงยังไม่รองรับ (ข้อมูลจริงอยู่ที่ Supabase)
  listScheduleRequests(_branch: Branch): ScheduleRequest[] {
    return [];
  },
  createScheduleRequest(_input: any): ScheduleRequest {
    throw new Error("โหมดทดสอบยังไม่รองรับคำขอเปลี่ยนตาราง");
  },
  applyLeaveRequest(_input: any): { appliedCode: string; downgraded: boolean; used: number; quota: number; remaining: number } {
    throw new Error("โหมดทดสอบยังไม่รองรับการขอลา");
  },

  setScheduleShift(_input: any): { ok: false; error: string } {
    return { ok: false, error: "โหมดทดสอบยังไม่รองรับการแก้ตาราง" };
  },
  decideScheduleRequest(_id: number, _approve: boolean, _by: string, _note: string) {
    return { ok: false as const, error: "โหมดทดสอบยังไม่รองรับ" };
  },

  setItemBrand(itemId: string, brand: ItemBrand) {
    const it = ITEMS.find((x) => x.id === itemId);
    if (it) it.brand = brand;
    return { ok: true };
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
      // ยกมา = คงเหลือของวันก่อนหน้าล่าสุดเสมอ คำนวณสดทุกครั้ง (ไม่ใช่ค่าที่ freeze ไว้ตอนบันทึกแถวนี้ครั้งแรก)
      // กันเคสแก้ไขคงเหลือของวันก่อนหน้าย้อนหลัง แล้วยกมาของวันถัดไปไม่อัปเดตตาม
      const prev = latestBefore(branch, it.id, date);
      const carryPack = prev?.remainPack ?? 0;
      const carryG = prev?.remainG ?? 0;
      const saved = stock.get(sk(date, branch, it.id));
      if (saved) {
        const { date: _d, branch: _b, ...row } = saved;
        return { ...row, carryPack, carryG, hasEntry: !!saved.remainConfirmed };
      }
      return {
        itemId: it.id, carryPack, carryG, inPack: 0, inG: 0, used: 0,
        remainPack: carryPack, remainG: carryG, returned: 0, note: "", variance: 0, hasEntry: false,
      };
    });
  },

  // dev store ไม่มีหลายเครื่องพร้อมกัน — คืนค่าให้ signature ตรงกับ production เท่านั้น
  getStockSavedAt(_branch: Branch, _date: string): { savedAt: string | null; savedBy: string | null } {
    return { savedAt: null, savedBy: null };
  },

  saveStock(branch: Branch, date: string, rows: StockRow[], userName?: string, isAdminActor?: boolean) {
    seed();
    let updated = 0, inserted = 0;
    for (const r of rows) {
      const key = sk(date, branch, r.itemId);
      // ยกมาคำนวณสดจาก DB ตอนบันทึกเสมอ — ห้ามเชื่อ carryPack ที่ client ส่งมา เพราะอาจเป็นค่าเก่าที่ค้าง
      // อยู่ในหน้าเว็บตั้งแต่ก่อนมีการแก้ไขคงเหลือของวันก่อนหน้าไปแล้ว (กันเซฟทับค่าที่แก้ไปแล้วกลับเป็นค่าผิดเดิม)
      const prev = latestBefore(branch, r.itemId, date);
      const carryPack = prev?.remainPack ?? 0;
      const carryG = prev?.remainG ?? 0;
      const v = variance(carryPack, r.inPack, r.used, r.returned, r.remainPack, 0, 0, r.packAdjust ?? 0);
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

      // ── แจ้งเตือนแอดมินเพิ่ม 2 เคส (แพรขอ 2026-07-26) ──
      const itemName = ITEMS.find((x) => x.id === r.itemId)?.name ?? r.itemId;

      // 1) คงเหลือ > ของที่มี (ยกมา+รับเข้า) — เป็นไปไม่ได้ เพราะขาย/ส่งคืนมีแต่ทำให้ลดลง
      //    เช็คเฉพาะ "แพ็ค" ไม่เช็คกรัม เพราะเศษกรัมเกินยกมาได้ตามปกติ (แกะกล่องใหม่มาใช้)
      if (r.remainPack > carryPack + r.inPack) {
        pushAdminFlag(branch, date, r.itemId, itemName, "stock_impossible",
          `คงเหลือ ${r.remainPack} เกินของที่มี ${carryPack + r.inPack} (ยกมา ${carryPack} + รับเข้า ${r.inPack})`);
      }

      // 2) แก้ยอดหลังจากที่นับ+ยืนยันคงเหลือไปแล้วรอบหนึ่ง — ไม่ว่าช่องไหนก็ตาม และไม่ว่าจะเป็นวันนี้
      //    หรือย้อนหลัง (แพรขอ 2026-08-05 ขยายจากเดิมที่เช็คแค่กรณีย้อนหลัง)
      const isBackdated = date !== new Date().toISOString().slice(0, 10);
      if (existing && existing.remainConfirmed) {
        const changes: string[] = [];
        if (existing.remainPack !== r.remainPack) changes.push(`คงเหลือ ${existing.remainPack}→${r.remainPack}`);
        if ((existing.remainG ?? 0) !== r.remainG) changes.push(`คงเหลือเศษ ${existing.remainG ?? 0}→${r.remainG}g`);
        if (existing.inPack !== r.inPack) changes.push(`รับเข้า ${existing.inPack}→${r.inPack}`);
        if ((existing.inG ?? 0) !== r.inG) changes.push(`รับเข้าเศษ ${existing.inG ?? 0}→${r.inG}g`);
        if ((existing.used ?? 0) !== r.used) changes.push(`ขาย/ใช้ ${existing.used ?? 0}→${r.used}`);
        if ((existing.returned ?? 0) !== r.returned) changes.push(`ส่งคืน ${existing.returned ?? 0}→${r.returned}`);
        if ((existing.returnedG ?? 0) !== (r.returnedG ?? 0)) changes.push(`ส่งคืนเศษ ${existing.returnedG ?? 0}→${r.returnedG ?? 0}g`);
        // แอดมินแก้เองไม่ต้องขึ้นแจ้งเตือน (แพรขอ 2026-08-06) — เหมือน supabase.ts
        if (changes.length && !isAdminActor) {
          pushAdminFlag(branch, date, r.itemId, itemName, isBackdated ? "stock_backdated_edit" : "stock_same_day_edit",
            `${isBackdated ? "แก้ย้อนหลัง" : "แก้ไขซ้ำ (วันนี้)"} · ${changes.join(" · ")}`, userName);
        }
      }

      stock.set(key, { ...r, date, branch, carryPack, carryG, variance: v, inAutoPack, inAutoG, remainConfirmed: true });
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

  // ประวัติส่งคืน/ของเสีย (v1.10) — อ่านจากช่อง returned/returnedG ที่พนักงานกรอกอยู่แล้วในหน้าสต็อก
  // branch = null → ทุกสาขา (admin เท่านั้น) · เรียงวันใหม่สุดก่อน
  getReturnHistory(branch: Branch | null, from: string, to: string, limit = 500): ReturnHistoryRow[] {
    seed();
    const itemById = new Map(ITEMS.map((it) => [it.id, it]));
    const out: ReturnHistoryRow[] = [];
    for (const rec of stock.values()) {
      if (branch && rec.branch !== branch) continue;
      if (rec.date < from || rec.date > to) continue;
      const returned = rec.returned ?? 0;
      const returnedG = rec.returnedG ?? 0;
      if (returned <= 0 && returnedG <= 0) continue;
      const it = itemById.get(rec.itemId);
      if (!it) continue;
      out.push({
        date: rec.date, branch: rec.branch, itemId: it.id, itemName: it.name, unit: it.unit,
        returned, returnedG, note: rec.note ?? "",
      });
    }
    return out
      .sort((a, b) => (a.date === b.date ? a.itemName.localeCompare(b.itemName) : (a.date < b.date ? 1 : -1)))
      .slice(0, limit);
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
    return { cash: 0, qr: 0, edc: 0, grab: 0, lineman: 0, posTotal: null };
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
      const inQ = s ? s.inPack * conv + s.inG + (s.packAdjust ?? 0) : 0;
      const remain = s ? s.remainPack * conv + s.remainG : 0;
      const rec = cups.get(ck(date, branch, size));
      return { size, start, in: inQ, remain, sold: rec?.sold ?? 0, ownCup: rec?.ownCup ?? 0 };
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
  getUserByPasscode(pin: string): { user: User; mustSetPasscode: boolean } | { expiredSetupCode: true } | null {
    const byPin = users.find((x) => x.active && verifyPasscode(pin, x.passcodeHash));
    if (byPin) {
      const { passcodeHash, setupCodeHash, setupCodeExpiresAt, ...pub } = byPin;
      return { user: pub, mustSetPasscode: false };
    }
    const now = Date.now();
    const bySetup = users.find(
      (x) => x.active && x.setupCodeExpiresAt && x.setupCodeExpiresAt > now && verifyPasscode(pin, x.setupCodeHash)
    );
    if (bySetup) {
      const { passcodeHash, setupCodeHash, setupCodeExpiresAt, ...pub } = bySetup;
      return { user: pub, mustSetPasscode: true };
    }
    // ตรงกับรหัสตั้งค่าของใครสักคนแต่หมดอายุไปแล้ว — แยกจาก "รหัสไม่ถูกต้อง" เฉยๆ
    const expired = users.some(
      (x) => x.active && !!x.setupCodeHash && verifyPasscode(pin, x.setupCodeHash)
    );
    return expired ? { expiredSetupCode: true } : null;
  },

  // ── ตั้ง/ออกรหัสเอง (v1.15) ──
  issueSetupCode(userId: string): string | null {
    const u = users.find((x) => x.id === userId);
    if (!u) return null;
    const code = generateSetupCode();
    u.setupCodeHash = hashPasscode(code);
    u.setupCodeExpiresAt = Date.now() + SETUP_CODE_TTL_HOURS * 3600_000;
    u.mustSetPasscode = true;
    u.passcodeHash = null; // ตัด PIN เก่าทิ้งทันที ไม่งั้นคนที่รู้รหัสเดิมยังเข้าได้
    return code;
  },
  setOwnPasscode(userId: string, newPin: string): { ok: boolean; reason?: "duplicate" } {
    const now = Date.now();
    const dup = users.some(
      (x) => x.id !== userId &&
        (verifyPasscode(newPin, x.passcodeHash) ||
          (!!x.setupCodeExpiresAt && x.setupCodeExpiresAt > now && verifyPasscode(newPin, x.setupCodeHash)))
    );
    if (dup) return { ok: false, reason: "duplicate" };
    const u = users.find((x) => x.id === userId);
    if (!u) return { ok: false };
    u.passcodeHash = hashPasscode(newPin);
    u.mustSetPasscode = false;
    u.setupCodeHash = null;
    u.setupCodeExpiresAt = null;
    return { ok: true };
  },
  // dev store ไม่ต้องหน่วง (เครื่องเดียว ไม่มีใครมายิงเดา) — มีไว้ให้ signature ตรงกับ production
  recordLoginAttempt(_ip: string, _ok: boolean): void {},
  countRecentFailedLogins(_ip: string, _minutes: number): number { return 0; },
  getUserById(id: string): User | null {
    const rec = users.find((u) => u.id === id);
    if (!rec) return null;
    const { passcodeHash, setupCodeHash, setupCodeExpiresAt, ...pub } = rec;
    return pub;
  },
  listUsers(): User[] {
    return users.map(({ passcodeHash, setupCodeHash, setupCodeExpiresAt, ...pub }) => pub);
  },
  createUser(input: { name: string; role: Role; branchScope: BranchScope; createdBy: string }): User & { setupCode: string } {
    const setupCode = generateSetupCode();
    const u: UserRec = {
      id: "u-" + Math.abs(Date.now() % 1_000_000).toString(36) + users.length,
      name: input.name, role: input.role, branchScope: input.branchScope, active: true,
      passcodeHash: null, mustSetPasscode: true,
      setupCodeHash: hashPasscode(setupCode),
      setupCodeExpiresAt: Date.now() + SETUP_CODE_TTL_HOURS * 3600_000,
    };
    users.push(u);
    const { passcodeHash, setupCodeHash, setupCodeExpiresAt, ...pub } = u;
    return { ...pub, setupCode };
  },
  updateUser(id: string, patch: { name?: string; role?: Role; branchScope?: BranchScope; active?: boolean; allowanceEnabled?: boolean; allowanceMonthly?: number; workUnit?: User["workUnit"]; isSenior?: boolean }): User | null {
    const u = users.find((x) => x.id === id);
    if (!u) return null;
    if (patch.name !== undefined) u.name = patch.name;
    if (patch.role !== undefined) u.role = patch.role;
    if (patch.branchScope !== undefined) u.branchScope = patch.branchScope;
    if (patch.active !== undefined) u.active = patch.active;
    if (patch.allowanceEnabled !== undefined) u.allowanceEnabled = patch.allowanceEnabled;
    if (patch.allowanceMonthly !== undefined) u.allowanceMonthly = patch.allowanceMonthly;
    if (patch.workUnit !== undefined) u.workUnit = patch.workUnit;
    const { passcodeHash, ...pub } = u;
    return pub;
  },

  // ── ลูกค้าเอาแก้วมาเอง (v1.18) ──
  getOwnCups(branch: Branch, date: string): { size: CupSize; ownCup: number }[] {
    const sizes: CupSize[] = ["P", "S", "BOWL", "14OZ"];
    return sizes.map((size) => ({ size, ownCup: cups.get(ck(date, branch, size))?.ownCup ?? 0 }));
  },
  saveOwnCups(branch: Branch, date: string, rows: { size: CupSize; ownCup: number }[]) {
    for (const r of rows) {
      const key = ck(date, branch, r.size);
      const cur = cups.get(key);
      cups.set(key, {
        ...(cur ?? { size: r.size, start: 0, in: 0, remain: 0, sold: 0, date, branch }),
        ownCup: r.ownCup,
      } as any);
    }
    return { ok: true };
  },

  // ── ความคิดเห็น/ข้อเสนอแนะจากพนักงาน (v1.18) ──
  createFeedback(input: {
    userId: string; userName: string; branch: Branch | null;
    anonymous: boolean; topic: string; message: string; wantedAction: string;
  }): void {
    feedbackRows.unshift({
      id: feedbackSeq++,
      userName: input.anonymous ? null : input.userName,
      branch: input.branch, anonymous: input.anonymous,
      topic: input.topic as StaffFeedback["topic"],
      message: input.message, wantedAction: input.wantedAction,
      seenAt: null, createdAt: new Date().toISOString(),
    });
  },
  listFeedback(limit = 200): StaffFeedback[] {
    return feedbackRows.slice(0, limit).map((r) => ({ ...r }));
  },
  countUnseenFeedback(): number {
    return feedbackRows.filter((r) => !r.seenAt).length;
  },
  markAllFeedbackSeen(_byName: string): void {
    for (const r of feedbackRows) if (!r.seenAt) r.seenAt = new Date().toISOString();
  },

  // ── ลบผู้ใช้ (v1.15) ──
  getUserActivity(userId: string): { allowanceUses: number; auditRows: number; workRows: number } {
    return {
      allowanceUses: allowanceUses.filter((r) => r.userId === userId).length,
      auditRows: auditRows.filter((r) => r.userId === userId).length,
      workRows: requisitions.filter((r) => r.requestedByUserId === userId).length,
    };
  },
  deleteUser(userId: string): { ok: boolean; reason?: string } {
    const i = users.findIndex((u) => u.id === userId);
    if (i < 0) return { ok: false, reason: "ไม่พบผู้ใช้" };
    users.splice(i, 1);
    return { ok: true };
  },

  // ── สิทธิ์ซื้อของในร้าน (v1.13) ──
  listAllowanceUses(userId: string, month: string): StaffAllowanceUse[] {
    const { from, to } = monthRange(month);
    return allowanceUses
      .filter((r) => r.userId === userId && r.useDate >= from && r.useDate < to)
      .sort((a, b) => (a.useDate < b.useDate ? 1 : -1))
      .map((r) => ({ ...r }));
  },
  getAllowanceOverview(month: string): { summaries: AllowanceSummary[]; needsReview: StaffAllowanceUse[] } {
    const { from, to } = monthRange(month);
    const inMonth = allowanceUses.filter((r) => r.useDate >= from && r.useDate < to);
    const usedBy = new Map<string, number>();
    for (const r of inMonth) usedBy.set(r.userId, (usedBy.get(r.userId) ?? 0) + r.discountAmount);
    const nameBy = new Map(users.map((u) => [u.id, u.name]));
    const summaries: AllowanceSummary[] = users
      .filter((u) => u.allowanceEnabled && u.active)
      .map((u) => {
        const monthly = u.allowanceMonthly ?? ALLOWANCE_DEFAULT_MONTHLY;
        const used = usedBy.get(u.id) ?? 0;
        return { userId: u.id, userName: u.name, branchScope: u.branchScope, monthly, used, remaining: Math.max(monthly - used, 0) };
      });
    const needsReview = inMonth
      .filter((r) => r.needsReview)
      .map((r) => ({ ...r, userName: nameBy.get(r.userId) ?? r.userId }));
    return { summaries, needsReview };
  },
  addAllowanceUse(row: StaffAllowanceUse): void {
    allowanceUses.push({ ...row, id: allowanceSeq++, createdAt: new Date().toISOString() });
  },

  // ── ขอเบิกสินค้า (ไม่มีสถานะ แค่ log ให้ restock/admin กวาดดู) ──
  createRequisition(input: Omit<Requisition, "id" | "createdAt" | "status">): Requisition {
    const rec: Requisition = {
      ...input,
      id: "req-" + Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
      createdAt: new Date().toISOString(),
      status: "pending",
    };
    requisitions.unshift(rec);
    return rec;
  },
  listRequisitions(filter: { userId?: string; branch?: string; limit?: number; date?: string }): Requisition[] {
    let rows = requisitions;
    if (filter.userId) rows = rows.filter((r) => r.requestedByUserId === filter.userId);
    if (filter.branch) rows = rows.filter((r) => r.branch === filter.branch);
    if (filter.date) rows = rows.filter((r) => bangkokDateOf(r.createdAt) === filter.date);
    return rows.slice(0, filter.limit ?? 100);
  },
  countUnseenRequisitions(): number {
    return requisitions.filter((r) => !r.seenAt).length;
  },
  markAllRequisitionsSeen(): void {
    const now = new Date().toISOString();
    for (const r of requisitions) if (!r.seenAt) r.seenAt = now;
  },
  // ย้ายคำขอเบิกไปเป็นรายการพิเศษในเมนู "ต้องเติม" ของสาขา+วันที่ระบุ (แพรขอ 2026-08-07)
  // v1.33 (2026-08-11) — ถ้า itemId ตรงกับ catalog ปัจจุบัน ใส่จำนวนทับเข้าช่องรายการนั้นตรงๆ (ทับ ไม่บวกรวม
  // กับที่มีอยู่ก่อน — แพรยืนยัน) แทนที่จะเข้ารายการอื่นๆ เสมอ (ดูเหตุผลเต็มที่ supabase.ts moveRequisitionToRestock)
  moveRequisitionToRestock(id: string, date: string, _actorUserId: string, actorName: string): Requisition {
    const req = requisitions.find((r) => r.id === id);
    if (!req) throw new Error("ไม่พบคำขอเบิกนี้");
    if (req.status === "moved") throw new Error("รายการนี้ถูกย้ายไปแล้ว");

    const now = new Date().toISOString();
    const catalogItem = req.itemId ? ITEMS.find((it) => it.id === req.itemId) : undefined;

    if (catalogItem) {
      restockSelections.set(sk(date, req.branch, req.itemId!), {
        date, branch: req.branch, itemId: req.itemId!, selected: true,
        qty: req.qty, qtyG: 0, qtyG2: 0,
        updatedByUserId: _actorUserId, updatedByName: actorName, updatedAt: now,
      });
    } else {
      const key = `${req.branch}|${date}`;
      const existing = restockExtraItems.get(key) ?? [];
      restockExtraItems.set(key, [
        ...existing,
        {
          name: `${req.itemName}${req.unit ? ` (${req.unit})` : ""}`,
          qty: req.qty,
          note: `จากคำขอเบิกของ ${req.requestedBy}${req.note ? ` — ${req.note}` : ""}`,
          createdByUserId: _actorUserId, createdByName: actorName, createdAt: now,
        },
      ]);
    }

    req.status = "moved";
    req.movedAt = now;
    req.movedBy = actorName;
    return { ...req };
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
  // สูตรเดียวกับ supabaseStore.listUnremittedCashDays — หักผลกระทบเงินสดของเคส "รับเงินไม่ตรงบิล" ออกก่อน
  // (ไม่ทำแบบนี้จะเจอบั๊กเดียวกับที่แพรเจอ 2026-07-31 ตอนรันแบบไม่ต่อ Supabase)
  listUnremittedCashDays(branch: Branch): { date: string; cash: number }[] {
    const coveredDates = new Set(cashRemittanceRows.filter((r) => r.branch === branch).flatMap((r) => r.coveredDates));
    return [...sales.values()]
      .filter((r) => r.branch === branch && !coveredDates.has(r.date))
      .map((r) => {
        const incidents = paymentIncidents.get(`${branch}|${r.date}`) ?? [];
        const cashAdj = incidents.reduce((sum, it) => {
          if (it.kind === "over_no_change") return sum; // เงินเข้า QR อย่างเดียว ไม่แตะลิ้นชัก
          return sum + incidentAdjustment(it.kind, it.billAmount, it.actualAmount).cash;
        }, 0);
        return { date: r.date, cash: r.cash + cashAdj };
      })
      .filter((r) => r.cash > 0)
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
  getRestockSelections(branch: Branch, date: string): Record<string, { selected: boolean; qty: number; qtyG: number; qtyG2: number }> {
    const out: Record<string, { selected: boolean; qty: number; qtyG: number; qtyG2: number }> = {};
    for (const rec of restockSelections.values()) {
      if (rec.branch !== branch || rec.date !== date) continue;
      out[rec.itemId] = { selected: rec.selected, qty: rec.qty, qtyG: rec.qtyG, qtyG2: rec.qtyG2 ?? 0 };
    }
    return out;
  },

  saveRestockSelections(branch: Branch, date: string, entries: RestockSelectionEntry[], userId: string, userName: string) {
    const now = new Date().toISOString();
    for (const e of entries) {
      restockSelections.set(sk(date, branch, e.itemId), {
        date, branch, itemId: e.itemId, selected: e.selected, qty: e.qty, qtyG: e.qtyG, qtyG2: e.qtyG2 ?? 0,
        updatedByUserId: userId, updatedByName: userName, updatedAt: now,
      });
    }
    return { ok: true, savedCount: entries.length };
  },

  // ── ตรวจวันหมดอายุ (v1.12) ──
  getExpiryChecks(branch: Branch, checkDate: string): ExpiryCheckRow[] {
    return (expiryChecks.get(`${branch}|${checkDate}`) ?? []).map((r, i) => ({ ...r, id: i + 1 }));
  },
  // ── ลงเวลาเข้า-ออกงาน (v1.22) — dev store เก็บใน memory ──
  getTimeClockSettings(): TimeClockSettings {
    return {
      enabled: appSettings.get("time_clock_enabled") === "1",
      requireFace: appSettings.get("time_clock_require_face") !== "0",
      requireLocation: appSettings.get("time_clock_require_location") === "1",
    };
  },
  getAppSetting(key: string): string | null {
    return appSettings.get(key) ?? null;
  },
  setAppSetting(key: string, value: string, _updatedBy: string): void {
    appSettings.set(key, value);
  },
  getBranchGeo(_branch: Branch): { lat: number; lng: number; radiusM: number } | null {
    return null; // dev ไม่เช็คตำแหน่ง
  },
  setBranchGeo(_branch: Branch, _lat: number, _lng: number, _radiusM: number): void {},
  getFaceEnrollment(userId: string): { faceId: string | null; enrolledAt: string | null; allowedUntil: string | null } {
    return faceEnrollments.get(userId) ?? { faceId: null, enrolledAt: null, allowedUntil: null };
  },
  clearFaceEnrollment(userId: string): string | null {
    const cur = faceEnrollments.get(userId);
    faceEnrollments.set(userId, { faceId: null, enrolledAt: null, allowedUntil: null });
    return cur?.faceId ?? null;
  },
  saveFaceEnrollment(userId: string, faceId: string): void {
    faceEnrollments.set(userId, { faceId, enrolledAt: new Date().toISOString(), allowedUntil: null });
  },
  getOpenShift(userId: string): TimeClockEntry | null {
    return [...timeClock.values()].find((e) => e.userId === userId && !e.clockOut) ?? null;
  },
  clockIn(input: {
    branch: Branch | null; userId: string; userName: string; workDate: string;
    photoPath?: string | null; similarity?: number | null;
    lat?: number | null; lng?: number | null; distanceM?: number | null;
  }): TimeClockEntry {
    const id = timeClockSeq++;
    const row: TimeClockEntry = {
      id, branch: input.branch, userId: input.userId, userName: input.userName,
      workDate: input.workDate, clockIn: new Date().toISOString(), clockOut: null,
      inDistanceM: input.distanceM ?? null, inFaceSimilarity: input.similarity ?? null,
    };
    timeClock.set(id, row);
    return row;
  },
  clockOut(id: number, input: { similarity?: number | null; distanceM?: number | null }): TimeClockEntry | null {
    const row = timeClock.get(id);
    if (!row || row.clockOut) return null;
    row.clockOut = new Date().toISOString();
    row.outFaceSimilarity = input.similarity ?? null;
    row.outDistanceM = input.distanceM ?? null;
    return row;
  },
  listTimeClock(month: string, branch?: Branch): TimeClockEntry[] {
    return [...timeClock.values()]
      .filter((e) => e.workDate.startsWith(month) && (!branch || e.branch === branch))
      .sort((a, b) => b.clockIn.localeCompare(a.clockIn));
  },
  editTimeClock(id: number, patch: { clockIn?: string; clockOut?: string | null; note: string; editedBy: string }): void {
    const row = timeClock.get(id);
    if (!row) return;
    if (patch.clockIn) row.clockIn = patch.clockIn;
    if (patch.clockOut !== undefined) row.clockOut = patch.clockOut;
    row.editedBy = patch.editedBy;
    row.editNote = patch.note;
  },

  // ── ของรอฝากรถส่งคืน (v1.21) — dev store เก็บใน memory ตามชุด expiryChecks ──
  listPendingReturns(branch: Branch): PendingReturnRow[] {
    const out: PendingReturnRow[] = [];
    const itemMap = new Map(ITEMS.map((it) => [it.id, it]));
    for (const [key, rows] of expiryChecks) {
      const [b, checkDate] = key.split("|");
      if (b !== branch) continue;
      rows.forEach((r, i) => {
        if (r.disposition !== "return" || dispatchedReturnKeys.has(`${key}|${i}`)) return;
        const it = itemMap.get(r.itemId);
        out.push({
          id: i + 1, checkDate, itemId: r.itemId,
          itemName: it?.name ?? r.itemId, unit: it?.unit ?? "",
          qty: r.qty, expiryDate: r.expiryDate,
        });
      });
    }
    return out.sort((a, b2) => a.checkDate.localeCompare(b2.checkDate));
  },
  markReturnsDispatched(branch: Branch): number {
    let n = 0;
    for (const [key, rows] of expiryChecks) {
      if (!key.startsWith(`${branch}|`)) continue;
      rows.forEach((r, i) => {
        if (r.disposition !== "return") return;
        const k = `${key}|${i}`;
        if (!dispatchedReturnKeys.has(k)) { dispatchedReturnKeys.add(k); n++; }
      });
    }
    return n;
  },

  // สาขาไหน "บันทึกผลตรวจของวันนั้นแล้ว" — ใช้ทำ badge เตือนวันอังคาร/ศุกร์
  getBranchesWithExpiryCheck(checkDate: string): Branch[] {
    const out = new Set<Branch>();
    for (const [k, rows] of expiryChecks) {
      const [b, d] = k.split("|");
      if (d === checkDate && rows.length > 0) out.add(b as Branch);
    }
    return [...out];
  },

  // บันทึกทับทั้งชุด แล้วเขียนผลลงสต็อกแบบ idempotent (ถอนของเก่าก่อนใส่ใหม่ — ไม่บวกทบ)
  saveExpiryChecks(
    branch: Branch, checkDate: string, rows: ExpiryCheckRow[], userId: string, userName: string
  ): void {
    seed();
    expiryChecks.set(`${branch}|${checkDate}`, rows.map((r) => ({ ...r })));

    const itemById = new Map(ITEMS.map((it) => [it.id, it]));
    const wantReturn = new Map<string, number>();
    const wantUsed = new Map<string, number>();
    const wantTransferOut = new Map<string, number>(); // ต้นทางการแปลง (แพ็ค)
    const wantInG = new Map<string, number>();          // ปลายทางการแปลง (กรัม)
    for (const r of rows) {
      if (r.disposition === "return") {
        wantReturn.set(r.itemId, (wantReturn.get(r.itemId) ?? 0) + r.qty);
      } else if (r.disposition === "sell_front") {
        wantUsed.set(r.itemId, (wantUsed.get(r.itemId) ?? 0) + r.qty);
      } else if (r.disposition === "convert") {
        // ไม่ลง used/in — ของไม่ได้ขายและไม่ได้มาจากรถส่ง แค่ย้ายกองภายในร้าน (v1.17)
        wantTransferOut.set(r.itemId, (wantTransferOut.get(r.itemId) ?? 0) + r.qty);
        const src = itemById.get(r.itemId);
        const to = src?.expiryConvertToItemId ?? null;
        const g = Number(src?.expiryConvertG ?? 0);
        if (to && g > 0) wantInG.set(to, (wantInG.get(to) ?? 0) + r.qty * g);
      }
    }
    const touched = new Set<string>([
      ...wantReturn.keys(), ...wantUsed.keys(), ...wantInG.keys(), ...wantTransferOut.keys(),
    ]);
    for (const rec of stock.values()) {
      if (rec.branch !== branch || rec.date !== checkDate) continue;
      if ((rec.expiryReturned ?? 0) !== 0 || (rec.expiryUsed ?? 0) !== 0
        || (rec.transferOut ?? 0) !== 0 || (rec.transferInG ?? 0) !== 0) {
        touched.add(rec.itemId);
      }
    }

    for (const itemId of touched) {
      const key = sk(checkDate, branch, itemId);
      const cur = stock.get(key);
      const newRet = wantReturn.get(itemId) ?? 0;
      const newUse = wantUsed.get(itemId) ?? 0;
      const newTransferOut = wantTransferOut.get(itemId) ?? 0;
      const newTransferInG = wantInG.get(itemId) ?? 0;
      const gpu = Number(itemById.get(itemId)?.gramsPerUOM ?? 0);
      if (cur) {
        // used/returned ปนกับที่พนักงานกรอกเอง → ถอนของเก่าก่อน · transfer_* ระบบเขียนเองล้วน เขียนทับได้
        const baseRet = Math.max(cur.returned - (cur.expiryReturned ?? 0), 0);
        const baseUse = Math.max(cur.used - (cur.expiryUsed ?? 0), 0);
        stock.set(key, {
          ...cur,
          returned: baseRet + newRet, used: baseUse + newUse,
          expiryReturned: newRet, expiryUsed: newUse,
          transferOut: newTransferOut, transferInG: newTransferInG,
        });
      } else if (newRet > 0 || newUse > 0 || newTransferOut > 0 || newTransferInG > 0) {
        const prev = latestBefore(branch, itemId, checkDate);
        const carryPack = prev?.remainPack ?? 0;
        const carryG = prev?.remainG ?? 0;
        const inPacks = gpu > 0 ? Math.floor(newTransferInG / gpu) : 0;
        stock.set(key, {
          date: checkDate, branch, itemId, carryPack, carryG, inPack: 0, inG: 0,
          used: newUse,
          remainPack: Math.max(carryPack + inPacks - newUse - newRet - newTransferOut, 0),
          remainG: carryG + (gpu > 0 ? newTransferInG % gpu : newTransferInG),
          returned: newRet, note: "", variance: 0,
          expiryReturned: newRet, expiryUsed: newUse,
          transferOut: newTransferOut, transferInG: newTransferInG,
          remainConfirmed: false,
        });
      }
    }
  },

  // ── เคส "รับเงินไม่ตรงบิล" (v1.11) — บันทึกทับทั้งชุดต่อ (สาขา,วันที่) ──
  getPaymentIncidents(branch: Branch, date: string): PaymentIncident[] {
    return (paymentIncidents.get(`${branch}|${date}`) ?? []).map((r, i) => ({
      id: i + 1, kind: r.kind, billAmount: r.billAmount, actualAmount: r.actualAmount,
      note: r.note, createdByName: r.createdByName, createdAt: r.createdAt,
    }));
  },
  savePaymentIncidents(
    branch: Branch, date: string, incidents: PaymentIncident[], userId: string, userName: string
  ): void {
    const now = new Date().toISOString();
    paymentIncidents.set(`${branch}|${date}`, incidents.map((it) => ({
      kind: it.kind, billAmount: it.billAmount, actualAmount: it.actualAmount, note: it.note,
      createdByUserId: userId, createdByName: userName, createdAt: now,
    })));
  },

  // itemId ที่ "ส่งไปแล้วและสาขายืนยันรับแล้ว" ของใบวันนั้น — ใช้กรองตอนพิมพ์ใบรอบที่ 2
  // ไม่นับตัวที่ติ๊ก "ไม่ได้รับ" เพราะของยังไม่ถึงสาขา ถ้าจะส่งใหม่ก็ต้องพิมพ์ซ้ำ
  getConfirmedReceiptItemIds(branch: Branch, date: string): string[] {
    const out: string[] = [];
    for (const r of restockReceipts.values()) {
      if (r.branch !== branch || r.date !== date || r.notReceived) continue;
      out.push(r.itemId);
    }
    return out;
  },

  getRestockNote(branch: Branch, date: string): string {
    return restockNotes.get(`${branch}|${date}`) ?? "";
  },
  saveRestockNote(branch: Branch, date: string, note: string): void {
    restockNotes.set(`${branch}|${date}`, note);
  },

  // ── รายการที่ไม่มีให้เลือกในระบบ (v1.10) — ไม่ผูก itemId ไม่ auto-fill รับเข้า เก็บเป็นประวัติ ──
  getRestockExtraItems(branch: Branch, date: string): RestockExtraItem[] {
    return (restockExtraItems.get(`${branch}|${date}`) ?? [])
      .map((r) => ({ name: r.name, qty: r.qty, note: r.note, createdByName: r.createdByName, createdAt: r.createdAt }));
  },
  // บันทึกทับทั้งชุดต่อ (สาขา,วันที่) เหมือน restock_selections — ลบของเดิมแล้วใส่ชุดใหม่
  saveRestockExtraItems(branch: Branch, date: string, items: RestockExtraItem[], userId: string, userName: string): void {
    const now = new Date().toISOString();
    restockExtraItems.set(`${branch}|${date}`, items.map((it) => ({
      name: it.name, qty: it.qty, note: it.note,
      createdByUserId: userId, createdByName: userName, createdAt: now,
    })));
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
    // ไม่นับใบที่ยังไม่ถึงวัน — ให้ตรงกับหน้ายืนยันรับของที่ซ่อนใบล่วงหน้าไว้
    const today = todayBangkok();
    return this.listOutstandingRestockSheets(branch)
      .filter((s) => s.date <= today)
      .reduce((sum, s) => sum + s.pendingCount, 0);
  },

  listAdminFlags(filter: { includeResolved?: boolean; branch?: Branch; reasons?: AdminFlagReason[] } = {}): AdminFlag[] {
    return adminFlags
      .filter((f) => filter.includeResolved || !f.resolvedAt)
      .filter((f) => !filter.branch || f.branch === filter.branch)
      .filter((f) => !filter.reasons || filter.reasons.includes(f.reason))
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
        inStockNoProduce: i.inStockNoProduce ?? false,
        haveStockQty: i.haveStockQty ?? 0, haveStockG: i.haveStockG ?? 0, haveStockGText: i.haveStockGText ?? "",
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
          existing.qty = i.qty; existing.qtyG = i.qtyG;
          existing.inStockNoProduce = i.inStockNoProduce ?? false;
          existing.haveStockQty = i.haveStockQty ?? 0; existing.haveStockG = i.haveStockG ?? 0;
          existing.haveStockGText = i.haveStockGText ?? "";
          existing.updatedAt = now;
        } else if (i.qty > 0 || i.qtyG > 0) {
          const itemId = prodItemSeq++;
          productionOrderItems.set(itemId, {
            id: itemId, orderId: id, itemId: i.itemId, branch: i.branch,
            qty: i.qty, qtyG: i.qtyG,
            inStockNoProduce: i.inStockNoProduce ?? false,
            haveStockQty: i.haveStockQty ?? 0, haveStockG: i.haveStockG ?? 0, haveStockGText: i.haveStockGText ?? "",
            confirmed: false, createdAt: now, updatedAt: now,
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
            existing.inStockNoProduce = row.inStockNoProduce ?? false;
            existing.haveStockQty = row.haveStockQty ?? 0; existing.haveStockG = row.haveStockG ?? 0;
            existing.haveStockGText = row.haveStockGText ?? "";
            existing.updatedAt = now;
          }
        } else if (row.extraName) {
          const itemId = prodItemSeq++;
          productionOrderItems.set(itemId, {
            id: itemId, orderId: id, qty: row.qty, qtyG: row.qtyG,
            extraName: row.extraName, extraUnit: row.extraUnit, extraNote: row.extraNote,
            inStockNoProduce: row.inStockNoProduce ?? false,
            haveStockQty: row.haveStockQty ?? 0, haveStockG: row.haveStockG ?? 0, haveStockGText: row.haveStockGText ?? "",
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
