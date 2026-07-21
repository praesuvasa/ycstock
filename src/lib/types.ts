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
}

export interface Session {
  userId: string;
  name: string;
  role: Role;
  branchScope: BranchScope;
  exp: number; // epoch ms
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
