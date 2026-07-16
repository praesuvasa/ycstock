// Pure business logic — ใช้ได้ทั้ง BFF และ UI (คำนวณสดขณะพิมพ์)
import type { Branch, Weekday, CupRow, CupSize } from "./types";

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

/** Variance = ยกมา + รับเข้า − ขาย − ส่งคืน − คงเหลือ  (ต้อง = 0) */
export function variance(
  carry: unknown, inQty: unknown, used: unknown, returned: unknown, remain: unknown
): number {
  return n(carry) + n(inQty) - n(used) - n(returned) - n(remain);
}

/** ต้องเติม = MAX(Par − คงเหลือ, 0) ; par = null (—) → null (ไม่เติม) */
export function restockNeed(par: number | null, remain: unknown): number | null {
  if (par == null) return null;
  return Math.max(par - n(remain), 0);
}

// รอบ special ต่อสาขา (รับได้หลายวัน) — สาขาที่ไม่อยู่ใน map นี้ = ยังไม่เปิดรับ special (isSpecialActive คืน false เสมอ)
const SPECIAL_DAY: Partial<Record<Branch, Weekday[]>> = { SND: ["sat"], NVP: ["wed"], KCN: ["wed", "sat"] };
const WEEKDAY_LABEL_TH: Record<Weekday, string> = { wed: "พุธ", sat: "เสาร์" };

/** 7 รายการ special เข้ารอบไหน: SND=เสาร์, NVP=พุธ, KCN=พุธ+เสาร์, สาขาอื่นที่ยังไม่กำหนด=ไม่มีรอบ */
export function isSpecialActive(branch: Branch, weekday: Weekday): boolean {
  return SPECIAL_DAY[branch]?.includes(weekday) ?? false;
}

/** ป้ายวันรอบ special ของสาขา (Thai) — null = สาขานี้ยังไม่มีรอบ special กำหนด */
export function specialDayLabel(branch: Branch): string | null {
  const days = SPECIAL_DAY[branch];
  return days && days.length > 0 ? days.map((d) => WEEKDAY_LABEL_TH[d]).join("และ") : null;
}

export interface CupReconResult {
  perSize: { size: CupSize; used: number; sold: number; diff: number }[];
  totalUsed: number;
  totalSold: number;
  totalDiff: number;
  swapLikely: boolean; // รวมตรง แต่รายขนาดเพี้ยน → น่าจะสลับขนาด
  balanced: boolean;   // รายขนาดตรงหมด
}

/** Reconcile ถ้วยเสิร์ฟ: ใช้จริง = ตั้งต้น + รับเข้า − คงเหลือ ; เทียบกับ ขายจริง */
export function cupReconcile(rows: CupRow[]): CupReconResult {
  const perSize = rows.map((r) => {
    const used = Math.max(n(r.start) + n(r.in) - n(r.remain), 0);
    const sold = n(r.sold);
    return { size: r.size, used, sold, diff: used - sold };
  });
  const totalUsed = perSize.reduce((s, r) => s + r.used, 0);
  const totalSold = perSize.reduce((s, r) => s + r.sold, 0);
  const totalDiff = totalUsed - totalSold;
  const balanced = perSize.every((r) => r.diff === 0);
  const swapLikely = !balanced && totalDiff === 0;
  return { perSize, totalUsed, totalSold, totalDiff, swapLikely, balanced };
}
