// Shared types — สัญญากลางของทั้งระบบ (BFF + UI ใช้ร่วมกัน)

export type Branch = "SND" | "NVP";
export const BRANCHES: Branch[] = ["SND", "NVP"];

export type Weekday = "wed" | "sat";
export type CupSize = "P" | "S" | "BOWL" | "14OZ";

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
}

// config ที่ตั้งได้ต่อ item (หน้า Settings)
export interface ItemConfig {
  hasRemainder: boolean;
  gramsPerUOM: number;
  remainderGroup?: string;
}

export interface ParMap {
  [itemId: string]: { SND: number | null; NVP: number | null };
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
}

// ── Auth / RBAC / Audit (v1.2) ──
export type Role = "user" | "admin";
export type BranchScope = "all" | "SND" | "NVP";

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
