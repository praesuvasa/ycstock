// Shared types — สัญญากลางของทั้งระบบ (BFF + UI ใช้ร่วมกัน)

export type Branch = "SND" | "NVP" | "KCN";
export const BRANCHES: Branch[] = ["SND", "NVP", "KCN"];
export const BRANCH_LABEL_TH: Record<Branch, string> = {
  SND: "สินธร", NVP: "เนอวาน่า พอร์ช", KCN: "กาญจนาภิเษก",
};

export type Weekday = "sun" | "mon" | "tue" | "wed" | "thu" | "fri" | "sat";
export type CupSize = "P" | "S" | "BOWL" | "14OZ";
// ความถี่เช็คสต็อกต่อรายการ — daily = ทุกวัน · monThu = เฉพาะวันจันทร์+พฤหัส (ของหมุนช้า ลดภาระกรอกซ้ำ)
export type CheckFrequency = "daily" | "monThu";

export interface Item {
  id: string;
  name: string;
  category: string;
  unit: string;
  isSpecial: boolean;   // 7 รายการ special (รอบเข้าของแยกวัน/สาขา)
  isCup: boolean;       // ถ้วยเสิร์ฟ (reconcile)
  cupSize?: CupSize;
  hasRemainder: boolean; // ขายแบบแกะ (นับเศษ g) · false = ขายเต็มแพ็ค/กล่อง
  gramsPerUOM: number;   // กรัมต่อ 1 แพ็ค (แกะ) หรือ กรัมต่อ 1 กล่อง (สมาชิกกลุ่มเศษรวม)
  remainderGroup?: string; // กลุ่มเศษรวม (Strawberry/Blueberry) — สมาชิกกลุ่มเดียวแชร์เศษก้อนเดียว
  sort: number;
  checkFrequency: CheckFrequency; // หน้าสต็อกโชว์เฉพาะวันที่ถึงรอบ
  showRemainderOnRestock: boolean; // หน้าเติมของ โชว์ "แพ็คเต็ม + เศษกรัม" แทนแค่จำนวนแพ็ค (ของหมุนช้าที่เศษเปิดแล้วอาจพอใช้ถึงรอบหน้า)
  // ผลผลิตออกมาไม่แน่นอน อาจไม่เต็มแพ็ค (เช่น Yuzu/Kyoho — คนละเรื่องกับ showRemainderOnRestock ข้างบน
  // ซึ่งคือ "เศษที่เปิดใช้แล้วเหลือ" ส่วนอันนี้คือ "จำนวนที่จะสั่ง/แบ่งเข้าสาขาอาจไม่ใช่แพ็คเต็ม") — คุมช่อง "+g" ตอนสั่ง/สั่งผลิต
  variableYield: boolean;
  // ── ตรวจวันหมดอายุ (v1.12) — รอบตรวจ อังคาร+ศุกร์ ──
  expiryCheck?: boolean;      // ต้องเดินตรวจวันหมดอายุไหม
  // เตือนล่วงหน้ากี่วัน · ฝั่งโค้ดยกขั้นต่ำให้เท่ากับระยะถึงรอบตรวจถัดไปเสมอ (ดู effectiveWarnDays)
  expiryWarnDays?: number;
  expiryAllowSellFront?: boolean; // อนุญาตให้แกะขายหน้าร้าน/แปลงเข้ารายการอื่น
  expiryAllowReturn?: boolean;    // อนุญาตให้ส่งคืนครัวกลาง
  // แกะแล้วไม่ได้ขายเป็นตัวมันเอง แต่ไปรวมกับอีกรายการ (Greek Yogurt 500g → ตักจาก Greek Yogurt 1kg)
  expiryConvertToItemId?: string | null;
  expiryConvertG?: number | null;  // กรัมที่เข้าไปเพิ่มให้ปลายทาง ต่อ 1 หน่วยต้นทาง
}

// config ที่ตั้งได้ต่อ item (หน้า Settings)
export interface ItemConfig {
  hasRemainder: boolean;
  gramsPerUOM: number;
  remainderGroup?: string;
}

export interface ParMap {
  [itemId: string]: Partial<Record<Branch, number | null>>;
}

export interface Meta {
  branches: Branch[];
  items: Item[];
  par: ParMap;
}

export interface StockRow {
  itemId: string;
  carryPack: number;
  carryG: number;
  inPack: number;
  inG: number;
  used: number;
  remainPack: number;
  remainG: number;
  returned: number;
  note: string;
  variance: number;
  // true = มีแถวบันทึกจริงของวันนี้แล้ว (ไม่ว่าค่าจะเท่ายกมาหรือไม่) · false/undefined = ยังไม่เคยบันทึก (ค่าที่เห็นเป็นแค่ยกมา default)
  hasEntry?: boolean;
  // ส่งคืน/เสีย เป็นกรัม (เฉพาะ item leader ของกลุ่มเศษรวม เช่น Strawberry/Blueberry) — หักจาก remainG ไม่ใช่ remainPack
  returnedG?: number;
}

export interface SalesRow {
  cash: number;
  qr: number;
  edc: number;
  grab: number;
  lineman: number;
}

export interface CupRow {
  size: CupSize;
  start: number;
  in: number;
  remain: number;
  sold: number;
}

export interface RestockRow {
  itemId: string;
  name: string;
  category: string;
  unit: string;
  par: number | null;
  remain: number;
  need: number | null;
  isSpecial: boolean;
  // เศษกรัมคงเหลือในแพ็คที่เปิดอยู่วันนี้ — มีความหมายเฉพาะรายการที่ showRemainderOnRestock=true
  remainG?: number;
  // true = 4 รายการ Cup P(5oz)/Cup S(9oz)/Small Bowl/Cup(14oz) → remainG ข้างบนคือ "จำนวนชิ้น" ไม่ใช่กรัม (ข้อ 4)
  isCup?: boolean;
  // ผลผลิตไม่แน่นอน อาจได้ไม่เต็มแพ็ค (Yuzu/Kyoho/Mint/Vanilla/Pineapple/Biscoff) — คุมช่อง "+g" ตอนกรอกจำนวนสั่ง
  // คนละความหมายกับ remainG ข้างบน (remainG = เศษที่เปิดใช้ไปแล้วเหลือ, อันนี้ = จำนวนที่จะสั่งอาจไม่ใช่แพ็คเต็ม)
  hasVariableYield?: boolean;
}

// ── Restock selections persisted (v1.4) — เก็บ "ตัวเลือกเติมของ" ต่อ (สาขา,วันที่,ไอเทม) ลง DB แทน client memory ──
export interface RestockSelectionEntry {
  itemId: string;
  selected: boolean;
  qty: number;
  // เศษ g ที่ไม่เต็มแพ็ค (มีความหมายเฉพาะรายการ hasRemainder เช่น Yuzu/Kyoho — ผลผลิตบางรอบไม่ออกมาเต็มกล่อง) — default 0
  qtyG: number;
}

// ── ตรวจวันหมดอายุ (v1.12) ──
// 1 แถว = 1 ชุดวันหมดอายุ ของ 1 รายการ · 1 รายการมีได้หลายชุด (ของบนชั้นปนหลายวัน)
// sell_front = แกะขายหน้าร้าน (ลง used) · return = ส่งคืนครัวกลาง (ลง returned)
// convert = แกะไปรวมกับรายการอื่น (ต้นทางลง used · ปลายทางลง in ตาม expiryConvertG)
export type ExpiryDisposition = "sell_front" | "return" | "convert";

export interface ExpiryCheckRow {
  id?: number;
  itemId: string;
  itemName?: string;
  unit?: string;
  category?: string;
  expiryDate: string;   // yyyy-mm-dd
  qty: number;          // นับของจริงตอนตรวจ
  disposition?: ExpiryDisposition | null; // null = ยังวางขายต่อ
  note: string;
}

// ── เคส "รับเงินไม่ตรงบิล" (v1.11) — QR ↔ เงินสด ──
// POS บอกยอดตามบิล แต่เงินเข้าจริงต่างออกไป · พนักงานกรอกยอด POS ตามปกติ แล้วบันทึกเคสแยก
// ระบบคำนวณ "ยอดเงินเข้าจริง" ให้เอง (POS + ผลรวมการปรับ) → เอาไปเทียบสลิปตอนอัปโหลดหลักฐาน
export type PaymentIncidentKind =
  | "over_no_change"    // โอนเกิน ไม่ได้ทอนคืน — ส่วนเกินนับเป็นรายได้ร้าน
  | "over_cash_change"  // โอนเกิน ทอนเป็นเงินสด — ยอดรวมตรงบิล
  | "under_cash_topup"; // โอนขาด จ่ายสดเพิ่ม — ยอดรวมตรงบิล

export interface PaymentIncident {
  id?: number;
  kind: PaymentIncidentKind;
  billAmount: number;    // ยอดตามบิล/POS
  actualAmount: number;  // ยอดที่โอนเข้าจริง
  note: string;
  createdByName?: string;
  createdAt?: string;
}

// ประวัติส่งคืน/ของเสีย (v1.10) — อ่านจาก stock_daily ที่พนักงานกรอกช่อง "ส่งคืน/เสีย" อยู่แล้ว
// ไม่ใช่การกรอกใหม่ · เป็นแค่มุมมองย้อนหลัง (พนักงานดูสาขาตัวเอง read-only · admin ดูได้ทุกสาขา)
export interface ReturnHistoryRow {
  date: string;
  branch: Branch;
  itemId: string;
  itemName: string;
  unit: string;
  returned: number;   // จำนวนแพ็ค
  returnedG: number;  // เศษกรัม
  note: string;
}

// รายการที่ "ไม่มีให้เลือกในระบบ" ของหน้าเติมของ (v1.10) — ของใหม่/เฉพาะกิจที่ยังไม่ได้ตั้งเป็นสินค้า
// ไม่ผูก itemId และไม่ auto-fill รับเข้า (ไม่เข้าหน้ายืนยันรับของ) — เก็บไว้เป็นประวัติ + โชว์บนใบปริ้นเท่านั้น
export interface RestockExtraItem {
  name: string;
  qty: number;
  note: string;
  createdByName?: string;
  createdAt?: string;
}

// ── Auth / RBAC / Audit (v1.2) ──
// restock = เจ้าหน้าที่ Restock/สั่งผลิต — เข้าได้แค่หน้า /restock เท่านั้น (ไม่ใช่ user ทั่วไป ไม่ใช่ admin เต็ม)
export type Role = "user" | "admin" | "restock";
export type BranchScope = "all" | Branch;

export interface User {
  id: string;
  name: string;
  role: Role;
  branchScope: BranchScope;
  active: boolean;
  // ── สิทธิ์ซื้อของในร้าน (v1.13) ──
  allowanceEnabled?: boolean;  // false = ยังไม่ได้รับสิทธิ์ → ไม่เห็นเมนูนี้เลย
  allowanceMonthly?: number;   // วงเงินต่อเดือน (default 400)
  // v1.15 — true = มีแต่ "รหัสตั้งค่า" ยังไม่ได้ตั้ง PIN ของตัวเอง (หน้าผู้ใช้โชว์ป้ายเตือน)
  mustSetPasscode?: boolean;
}

// ── สิทธิ์ซื้อของในร้าน (v1.13) — วงเงินส่วนลด 400 บาท/คน/เดือน คิดที่ราคาขายเต็ม ──
// แบ่งใช้หลายบิลได้ · ยอดที่ตัดสิทธิ์คือ "ส่วนลดบนบิล" ไม่ใช่ยอดที่จ่ายจริง
export interface StaffAllowanceUse {
  id?: number;
  userId: string;
  userName?: string;
  branch?: Branch | null;
  useDate: string;        // yyyy-mm-dd
  billTotal: number;      // ยอดเต็มก่อนลด
  discountAmount: number; // ยอดที่ตัดจากสิทธิ์
  paidAmount: number;     // จ่ายเองส่วนที่เกิน
  imagePath?: string | null;
  imageUrl?: string;      // signed url — ใส่ตอนตอบ API เท่านั้น
  ocrDiscount?: number | null; // ยอดส่วนลดที่ OCR อ่านได้ — ต่างจากที่กรอก = ส่งให้แอดมินตรวจ
  needsReview: boolean;
  reviewNote: string;
  note: string;
  createdAt?: string;
}

export interface AllowanceSummary {
  userId: string;
  userName: string;
  branchScope: BranchScope;
  monthly: number;
  used: number;
  remaining: number;
}

export interface Session {
  userId: string;
  name: string;
  role: Role;
  branchScope: BranchScope;
  exp: number; // epoch ms
  // v1.15 — เข้าด้วย "รหัสตั้งค่าครั้งแรก" ยังไม่ได้ตั้ง PIN ของตัวเอง
  // middleware จะบังคับไปหน้า /set-pin จนกว่าจะตั้งเสร็จ (ใช้หน้าอื่นไม่ได้เลย)
  mustSetPasscode?: boolean;
}

// ── ขอเบิกสินค้า (v1.3) — พนักงานสาขาขอของเกิน Par หรือของนอกลิสต์ ไม่มีสถานะติดตาม แค่ list ให้ restock/admin กวาดดู ──
export interface Requisition {
  id: string;
  branch: Branch;
  itemId?: string;    // ถ้าเลือกจากรายการที่มีอยู่ในระบบ
  itemName: string;   // ชื่อที่โชว์ (จาก item หรือพิมพ์เอง)
  qty: number;
  unit?: string;       // หน่วย (กรอกเองเฉพาะกรณีพิมพ์ชื่อเอง)
  note: string;         // เหตุผล/โอกาสพิเศษ
  requestedBy: string;
  requestedByUserId: string;
  createdAt: string;   // ISO
  seenAt?: string;     // ISO — undefined/null = ยังไม่มีใครเปิดดู (ใช้ทำ badge เตือนที่เมนู/Dashboard)
}

// ── หลักฐานยอดขาย (v1.7) — แนบรูปสลิป/สรุปยอด ให้ Claude vision อ่านยอด+ชื่อผู้รับ เทียบกับที่กรอก ──
// v1.8: เพิ่มตรวจจับเอกสารซ้ำ (อัปโหลดซ้ำ/ถ่ายคนละมุม/ใช้ยอดเดิมหลายวัน/ถ่ายจอซ้ำ) โดยเทียบเลขอ้างอิงที่อ่านได้จากรูป
export type EvidenceType = "qr" | "grab" | "lineman";
export type MatchStatus = "ok" | "mismatch" | "unclear" | "duplicate" | "pending";

export interface SalesEvidence {
  id: string;
  branch: Branch;
  date: string; // yyyy-mm-dd
  type: EvidenceType;
  imagePath: string;
  imageUrl?: string; // signed URL — เติมตอนส่งให้ frontend เท่านั้น ไม่เก็บใน DB
  enteredAmount: number;
  ocrAmount?: number;
  ocrNameMatch?: boolean; // undefined = ไม่เช็คชื่อ (grab/lineman ไม่มี concept ผู้รับเงิน)
  matchStatus: MatchStatus;
  duplicateNote?: string; // มีค่าเมื่อ matchStatus === "duplicate" — บอกว่าซ้ำกับรายการไหน
  mismatchNote?: string; // มีค่าเมื่อ matchStatus === "mismatch" — บอกสาเหตุจริง (ยอด/ชื่อผู้รับ/ทั้งคู่) กันสับสน
  uploadedBy: string;
  createdAt: string;
}

// การโอนเงินสด (v1.7) — แยกจากยอดขายรายวัน เพราะพนักงานอาจรวมเงินสดหลายวันแล้วโอนทีเดียว
export interface CashRemittance {
  id: string;
  branch: Branch;
  transferredAt: string; // yyyy-mm-dd — วันที่โอนจริง
  declaredAmount: number; // ผลรวมยอดเงินสดของวันที่เลือกครอบคลุม
  imagePath: string;
  imageUrl?: string;
  ocrAmount?: number;
  ocrNameMatch?: boolean;
  matchStatus: MatchStatus;
  duplicateNote?: string;
  mismatchNote?: string;
  coveredDates: string[]; // วันที่ (yyyy-mm-dd) ที่ถูกครอบคลุมโดยการโอนครั้งนี้
  uploadedBy: string;
  createdAt: string;
}

// ── ประกาศพิเศษ (v1.6) — admin ตั้งข้อความแจ้งเตือนชั่วคราวต่อสาขา เช่น รอบส่งของเลื่อนเพราะวันหยุดพนักงานส่งของ/วันหยุดสาขา ──
export interface BranchNotice {
  id: string;
  branch: Branch | null; // null = ทุกสาขา
  message: string;
  createdBy: string;
  createdAt: string; // ISO
}

// ── ใบสั่งผลิต (v1.5) — persist ProductionOrder component จาก client state เดิม ──
// "OTHER" = ช่อง "อื่นๆ" ในกริดสั่งผลิตเดิม (ProdField เดิมมี "other") — ไม่ใช่สาขาจริงจึงแยก type จาก Branch
export type ProdBranchKey = "SND" | "NVP" | "KCN" | "OTHER";

// รายการเดียวในใบสั่งผลิต — 1 แถว = 1 ช่องกรอก (item×branch) หรือ 1 รายการพิเศษ
export interface ProductionOrderItem {
  id: number;                 // production_order_items.id — ใช้ PATCH คอนเฟิร์ม/แก้ทีละแถว
  itemId?: string;            // undefined = รายการพิเศษ
  branch?: ProdBranchKey;     // undefined สำหรับรายการพิเศษ
  qty: number;                // จำนวนที่ "สั่ง"
  qtyG: number;
  extraName?: string;
  extraUnit?: string;
  extraNote?: string;
  confirmed: boolean;
  confirmedQty?: number;      // undefined = ยังไม่กรอกจำนวนจริง — ดูข้อ 0.4
  confirmedQtyG?: number;
  confirmedAt?: string;       // ISO
  confirmedByName?: string;
  // ข้อ 17: มีของอยู่แล้ว ไม่ต้องผลิตใหม่ — ยังต้องหยิบไปส่ง จึงยังอยู่ในใบ แต่แยกกลุ่มท้ายใบ
  inStockNoProduce?: boolean;
}

export interface ProductionOrder {
  id: number;
  orderDate: string;
  deliveryDate: string;
  note: string;
  items: ProductionOrderItem[];
  createdByName: string;
  createdAt: string;   // ISO
  updatedAt: string;   // ISO
}

// สรุปย่อ ใช้หน้า list ประวัติ (ไม่ต้องโหลด items ทั้งใบ)
export interface ProductionOrderSummary {
  id: number;
  orderDate: string;
  deliveryDate: string;
  itemCount: number;
  confirmedCount: number;
  note: string;
  createdByName: string;
  createdAt: string;
  updatedAt: string;
}

// shape ที่ POST/PATCH ใบส่งขึ้นไป (ไม่มี confirm fields — สร้าง/แก้ "คำสั่ง" เท่านั้น คอนเฟิร์มแยก endpoint)
// id ใส่มาด้วย = อัปเดตแถวเดิม (ใช้ตอน PATCH), ไม่ใส่ id = แถวใหม่ (insert)
export interface ProductionOrderItemInput {
  id?: number;
  itemId?: string;
  branch?: ProdBranchKey;
  qty: number;
  qtyG: number;
  extraName?: string;
  extraUnit?: string;
  extraNote?: string;
  inStockNoProduce?: boolean;
}

// ── ยืนยันรับของ (v1.9) — พนักงานสาขาติ๊กรับจริงจากใบ "ต้องเติม" แก้จำนวนได้ถ้าไม่ตรง เพิ่มรายการนอกใบได้
// รับจริงที่ยืนยัน → auto-fill เข้าช่อง "รับเข้า" หน้าสต็อกของวันที่ติ๊กจริง (ไม่ใช่วันที่ในใบ) ──
export interface RestockReceiptStatus {
  itemId: string;
  name: string;
  unit: string;
  orderedQty: number;
  orderedQtyG: number;
  receivedQty: number | null;  // null = ยังไม่ติ๊กยืนยัน
  receivedQtyG: number | null;
  isExtra: boolean;            // true = เพิ่มนอกใบเดิม ไม่ได้อยู่ในตัวเลือกที่บันทึกไว้
  notReceived: boolean;        // true = พนักงานติ๊กว่าไม่ได้รับสินค้านี้ — ตรวจสอบแล้ว ไม่ auto-fill สต็อก
  note?: string;               // หมายเหตุต่อรายการ (ไม่บังคับ) — บันทึกพร้อมยืนยันรับ
  confirmedByName?: string;
  confirmedAt?: string;        // ISO
}

// รายการยืนยันรับ 1 แถว ตอนกด "ยืนยันทั้งหมด" (batch)
export interface RestockReceiptBatchEntry {
  itemId: string;
  receivedQty: number;
  receivedQtyG: number;
  isExtra: boolean;
  notReceived: boolean;
  note?: string;
}

// สรุปย่อต่อใบ (วันที่) — ใช้หน้าเลือกใบที่จะยืนยันรับ (ไม่ผูกวันนี้อย่างเดียว เผื่อของมาส่งช้า)
export interface RestockSheetSummary {
  date: string;
  pendingCount: number;
  totalCount: number;
}

// คิวตรวจสอบแอดมิน — รับไม่ตรงยอดสั่ง / เพิ่มรายการนอกใบ / แก้ทับค่า auto-fill ทีหลังในหน้าสต็อก
export type AdminFlagReason =
  | "receipt_mismatch" | "receipt_not_received" | "receipt_extra"
  | "stock_override" | "receipt_edited"
  // คงเหลือมากกว่า "ของที่มี" (ยกมา+รับเข้า) — เป็นไปไม่ได้ทางกายภาพ เพราะขาย/ส่งคืนมีแต่ทำให้ลดลง
  | "stock_impossible"
  // ย้อนกลับไปแก้ยอดคงเหลือ/รับเข้า ของวันก่อนหน้า (ไม่ใช่วันนี้)
  | "stock_backdated_edit";

export interface AdminFlag {
  id: number;
  branch: Branch;
  date: string;
  itemId: string | null;
  itemName: string;
  reason: AdminFlagReason;
  detail: string;
  createdAt: string;   // ISO
  resolvedAt?: string; // ISO — undefined = ยังไม่ตรวจ
  resolvedBy?: string;
}

export interface AuditEntry {
  id: string;
  ts: string;        // ISO
  userId: string;
  userName: string;
  action: string;    // login | save_stock | save_sales | save_cups | update_item | create_user | update_user | ...
  branch: string | null;
  date: string | null;
  entity: string | null;
  detail: string;    // สรุปสั้น
}
