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
