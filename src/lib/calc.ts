// Pure business logic — ใช้ได้ทั้ง BFF และ UI (คำนวณสดขณะพิมพ์)
import type { Branch, Weekday, CupRow, CupSize, CheckFrequency, PaymentIncident, PaymentIncidentKind } from "./types";

const n = (v: unknown): number => {
  const x = typeof v === "number" ? v : parseFloat(String(v ?? ""));
  return Number.isFinite(x) ? x : 0;
};

/** คงเหลือ (ชิ้น) = ยกมา + รับเข้า − ขาย/ใช้  (ไม่ต่ำกว่า 0) */
export function remainPieces(carry: unknown, inQty: unknown, used: unknown): number {
  return Math.max(n(carry) + n(inQty) - n(used), 0);
}

/** คงเหลือ (กรัม) = MAX(ยกมา + รับเข้า − ใช้, 0) */
export function remainGrams(carryG: unknown, inG: unknown, used: unknown): number {
  return Math.max(n(carryG) + n(inG) - n(used), 0);
}

/**
 * Variance = ยกมา + รับเข้า + โอนเข้า − ขาย − ส่งคืน − โอนออก − คงเหลือ  (ต้อง = 0)
 *
 * โอนเข้า/โอนออก = ของที่แกะไปรวมกับรายการอื่น (v1.17) ระบบเขียนเอง พนักงานไม่ได้กรอก
 * ต้องอยู่ในสมการด้วย ไม่งั้นวันที่มีการแกะจะขึ้นผลต่างค้างเท่ากับจำนวนที่แกะ ทั้งที่ไม่มีใครทำผิด
 */
export function variance(
  carry: unknown, inQty: unknown, used: unknown, returned: unknown, remain: unknown,
  transferIn: unknown = 0, transferOut: unknown = 0, packAdjust: unknown = 0
): number {
  // packAdjust = ของที่แพคมีเกิน/ขาดจากที่ระบุ (เจอตอนเปิดแพค) — อยู่ฝั่ง "ของที่มี" เหมือนรับเข้า
  // ไม่งั้นคนนับจะโดนสงสัยทุกครั้งที่แพคไม่ครบ ทั้งที่นับถูก
  return n(carry) + n(inQty) + n(transferIn) + n(packAdjust) - n(used) - n(returned) - n(transferOut) - n(remain);
}

/** ต้องเติม = MAX(Par − คงเหลือ, 0) ; par = null (—) → null (ไม่เติม) */
export function restockNeed(par: number | null, remain: unknown): number | null {
  if (par == null) return null;
  return Math.max(par - n(remain), 0);
}

// รอบ special ต่อสาขา (รับได้หลายวัน) — สาขาที่ไม่อยู่ใน map นี้ = ยังไม่เปิดรับ special (isSpecialActive คืน false เสมอ)
const SPECIAL_DAY: Partial<Record<Branch, Weekday[]>> = { SND: ["sat"], NVP: ["wed"], KCN: ["wed", "sat"] };
const WEEKDAY_LABEL_TH: Record<Weekday, string> = {
  sun: "อาทิตย์", mon: "จันทร์", tue: "อังคาร", wed: "พุธ", thu: "พฤหัสบดี", fri: "ศุกร์", sat: "เสาร์",
};
const WEEKDAY_ORDER: Weekday[] = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"];

/** แปลงวันที่ (YYYY-MM-DD) เป็นวันในสัปดาห์ — ใช้ตอนเลือกวันที่จัดส่งจริงแทนปุ่มพุธ/เสาร์เดิม */
export function weekdayFromDate(dateISO: string): Weekday {
  return WEEKDAY_ORDER[new Date(dateISO + "T00:00:00").getDay()];
}

/** 7 รายการ special เข้ารอบไหน: SND=เสาร์, NVP=พุธ, KCN=พุธ+เสาร์, สาขาอื่นที่ยังไม่กำหนด=ไม่มีรอบ */
export function isSpecialActive(branch: Branch, weekday: Weekday): boolean {
  return SPECIAL_DAY[branch]?.includes(weekday) ?? false;
}

/** ป้ายวันรอบ special ของสาขา (Thai) — null = สาขานี้ยังไม่มีรอบ special กำหนด */
export function specialDayLabel(branch: Branch): string | null {
  const days = SPECIAL_DAY[branch];
  return days && days.length > 0 ? days.map((d) => WEEKDAY_LABEL_TH[d]).join("และ") : null;
}

/** วันนี้ถึงรอบเช็คไอเทมนี้ไหม — daily = ทุกวัน · monThu = เฉพาะจันทร์/พฤหัส */
export function isCheckDue(freq: CheckFrequency, weekday: Weekday): boolean {
  if (freq === "daily") return true;
  return weekday === "mon" || weekday === "thu";
}

export interface CupReconResult {
  perSize: { size: CupSize; used: number; sold: number; diff: number }[];
  totalUsed: number;
  totalSold: number;
  totalDiff: number;
  swapLikely: boolean; // รวมตรง แต่รายขนาดเพี้ยน → น่าจะสลับขนาด
  balanced: boolean;   // รายขนาดตรงหมด
}

/**
 * Reconcile ถ้วยเสิร์ฟ: ใช้จริง = ตั้งต้น + รับเข้า − คงเหลือ ; เทียบกับ "ขายที่ต้องใช้ถ้วยร้าน"
 *
 * v1.18 — หักบิลที่ลูกค้าเอาแก้วมาเองออกจากยอดขายก่อนเทียบ
 * เพราะบิลพวกนั้น POS นับว่าขาย แต่ไม่ได้กินถ้วยของร้าน ถ้าไม่หักจะขึ้นว่าถ้วยขาดทุกครั้ง
 */
export function cupReconcile(rows: CupRow[]): CupReconResult {
  const perSize = rows.map((r) => {
    const used = Math.max(n(r.start) + n(r.in) - n(r.remain), 0);
    const sold = Math.max(n(r.sold) - n(r.ownCup), 0);
    return { size: r.size, used, sold, diff: used - sold };
  });
  const totalUsed = perSize.reduce((s, r) => s + r.used, 0);
  const totalSold = perSize.reduce((s, r) => s + r.sold, 0);
  const totalDiff = totalUsed - totalSold;
  const balanced = perSize.every((r) => r.diff === 0);
  const swapLikely = !balanced && totalDiff === 0;
  return { perSize, totalUsed, totalSold, totalDiff, swapLikely, balanced };
}

// ── เคส "รับเงินไม่ตรงบิล" (v1.11) ──
// ใช้ร่วมกันทั้ง client (โชว์ผลทันทีตอนกรอก) และ server (คำนวณยอดจริงตอนเทียบสลิป)
// จุดเดียวที่รู้สูตร — แก้ที่นี่ที่เดียวถ้าต้องเพิ่มประเภทเคสใหม่
//
//   diff = ยอดโอนจริง − ยอดตามบิล
//   over_no_change    โอนเกิน ไม่ได้ทอน  → QR +diff · เงินสดไม่ขยับ · ส่วนเกิน = รายได้ร้าน
//   over_cash_change  โอนเกิน ทอนเป็นสด  → QR +diff · เงินสด −diff (สุทธิตรงบิล)
//   under_cash_topup  โอนขาด จ่ายสดเพิ่ม → QR +diff (diff ติดลบ) · เงินสด −diff (สุทธิตรงบิล)
export interface IncidentAdjustment {
  qr: number;      // บวก/ลบเข้ายอด QR
  cash: number;    // บวก/ลบเข้ายอดเงินสด
  overBill: number; // ส่วนที่เกินยอดบิลจริง ๆ (รายได้ร้าน) — 0 ถ้าทอนคืน/เก็บเพิ่มจนสุทธิตรง
}

export function incidentAdjustment(
  kind: PaymentIncidentKind, billAmount: number, actualAmount: number
): IncidentAdjustment {
  // ยกเลิกทั้งบิล = ไม่มียอดบิลเหลือ ระบบบังคับเป็น 0 ให้เอง พนักงานกรอกแค่ยอดที่ลูกค้าโอนมา
  // (เดิมต้องใช้ menu_change_refund แล้วพิมพ์ 0 เอง ซึ่งลืมง่ายและกลายเป็นยอดเพี้ยนแบบเงียบ ๆ)
  const bill = kind === "void_full_refund" ? 0 : n(billAmount);
  const diff = n(actualAmount) - bill;
  if (kind === "over_no_change") return { qr: diff, cash: 0, overBill: diff };
  // อีก 3 เคสเงินสดชดเชยกลับเสมอ ยอดรวมจึงตรงบิล
  // (รวม menu_change_refund — เงินเข้า QR เต็มจำนวนที่โอนมา แล้วจ่ายสดคืนเท่าส่วนต่าง)
  return { qr: diff, cash: -diff, overBill: 0 };
}

/** รวมผลการปรับของทุกเคสในวันนั้น — ใช้บวกทับยอดที่กรอกจาก POS */
export function sumIncidentAdjustments(incidents: PaymentIncident[]): IncidentAdjustment {
  return incidents.reduce<IncidentAdjustment>(
    (acc, it) => {
      const a = incidentAdjustment(it.kind, it.billAmount, it.actualAmount);
      return { qr: acc.qr + a.qr, cash: acc.cash + a.cash, overBill: acc.overBill + a.overBill };
    },
    { qr: 0, cash: 0, overBill: 0 }
  );
}

// ── ตรวจวันหมดอายุ (v1.12) ──
// รอบตรวจ: อังคาร + ศุกร์ (แพรเลือก เพราะรถเข้าส่งของ พุธ + เสาร์ → ตรวจก่อน 1 วัน ของส่งคืนขึ้นรถทัน)
export const EXPIRY_CHECK_DAYS: Weekday[] = ["tue", "fri"];
export const isExpiryCheckDue = (weekday: Weekday): boolean => EXPIRY_CHECK_DAYS.includes(weekday);

const WEEKDAY_INDEX: Weekday[] = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"];

/** อีกกี่วันถึงรอบตรวจถัดไป (อังคาร→ศุกร์ = 3 · ศุกร์→อังคาร = 4) */
export function daysToNextExpiryCheck(weekday: Weekday): number {
  const from = WEEKDAY_INDEX.indexOf(weekday);
  let best = 7;
  for (const d of EXPIRY_CHECK_DAYS) {
    const gap = (WEEKDAY_INDEX.indexOf(d) - from + 7) % 7;
    if (gap > 0 && gap < best) best = gap;
  }
  return best;
}

/**
 * จำนวนวันเตือนที่ใช้จริง = มากกว่าระหว่าง "ค่าที่ตั้งไว้" กับ "ระยะถึงรอบตรวจถัดไป"
 *
 * เหตุผล: ถ้าเตือนสั้นกว่าช่วงห่างรอบ จะมีของหมดอายุ "ระหว่างรอบ" โดยไม่เคยขึ้นเตือนสักครั้ง
 * เช่น ตั้งเตือน 3 วัน · ตรวจวันศุกร์ · ของหมดอายุวันอังคาร (อีก 4 วัน) → ศุกร์ไม่เตือน
 * แล้วขายต่อทั้งเสาร์–จันทร์ กว่าจะเจอก็อังคารซึ่งหมดอายุพอดี
 * ยกขั้นต่ำเป็น 4 เฉพาะรอบวันศุกร์จึงปิดช่องโหว่นี้โดยไม่ต้องบังคับให้ทุกวันเตือนยาวเท่ากัน
 */
export function effectiveWarnDays(warnDays: number, checkWeekday: Weekday): number {
  return Math.max(warnDays, daysToNextExpiryCheck(checkWeekday));
}

export type ExpiryStatus = "ok" | "near" | "expired";

/** นับวันแบบเทียบวันที่ล้วน (ไม่เอาเวลามาเกี่ยว) — วันหมดอายุ − วันที่ตรวจ */
export function daysUntil(expiryDate: string, fromDate: string): number {
  const a = new Date(`${expiryDate}T00:00:00Z`).getTime();
  const b = new Date(`${fromDate}T00:00:00Z`).getTime();
  return Math.round((a - b) / 86400000);
}

/** ok = ยังไม่ถึงเกณฑ์เตือน · near = ใกล้หมดอายุ (ถึงเกณฑ์แล้ว) · expired = เลยวันหมดอายุ */
export function expiryStatus(expiryDate: string, checkDate: string, warnDays: number): ExpiryStatus {
  const left = daysUntil(expiryDate, checkDate);
  if (left < 0) return "expired";
  return left <= effectiveWarnDays(warnDays, weekdayFromDate(checkDate)) ? "near" : "ok";
}

// ── สิทธิ์ซื้อของในร้าน (v1.13) ──
export const monthKeyOf = (dateISO: string): string => dateISO.slice(0, 7);

/** ช่วงวันของเดือน "YYYY-MM" — to เป็นแบบ exclusive (วันที่ 1 ของเดือนถัดไป) */
export function monthRange(month: string): { from: string; to: string } {
  const [y, m] = month.split("-").map(Number);
  const nextY = m === 12 ? y + 1 : y;
  const nextM = m === 12 ? 1 : m + 1;
  const pad = (n: number) => String(n).padStart(2, "0");
  return { from: `${y}-${pad(m)}-01`, to: `${nextY}-${pad(nextM)}-01` };
}

export const ALLOWANCE_DEFAULT_MONTHLY = 400;
