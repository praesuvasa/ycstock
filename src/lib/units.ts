// อัตลักษณ์ต่อหน่วยงาน (v1.25) — ชื่อระบบ · สี · หน้าหลักของแต่ละหน่วย
//
// ที่มา: แอปนี้ไม่ใช่ของ YC อย่างเดียวแล้ว — ฝ่ายผลิต (Yogi) ใช้ด้วย และ KCN/NCD ขาย Staple ควบ YC
// กฎที่แพรตัดสิน 2026-07-30:
//   1. ธีมของหน้า = ตาม "หน่วยงาน" (หน้าร้าน / ฝ่ายผลิต) ไม่ใช่ตามแบรนด์
//   2. สีแบรนด์ Staple ใช้เป็น "ข้อมูล" (ติดที่ตัวรายการ/ยอดขายที่เป็นของ Staple) ไม่ใช่ทาทั้งหน้า
//      เพราะพนักงาน KCN คนเดียวขายทั้ง 2 แบรนด์ในกะเดียว ถ้าทาทั้งหน้าต้องสลับจอไปมา
import type { Branch, WorkUnit } from "./types";

export interface UnitBrand {
  unit: WorkUnit;
  /** ชื่อที่ขึ้นหัวจอ */
  headline: string;
  /** ชื่อแท็บเบราว์เซอร์ */
  docTitle: string;
  /** หน้าหลักของหน่วยนี้ */
  homeHref: string;
  /** สีประจำหน่วย — ใช้เป็นแถบ/จุดเล็ก ๆ ข้างชื่อ ไม่ใช่ทาพื้นทั้งหน้า */
  dotCls: string;
}

export const STORE_BRAND: UnitBrand = {
  unit: "store",
  headline: "ระบบหน้าร้าน",
  docTitle: "BQMP หน้าร้าน — ระบบจัดการงานประจำวัน",
  homeHref: "/store",
  dotCls: "bg-brand-red",
};

export const PRODUCTION_BRAND: UnitBrand = {
  unit: "production",
  headline: "ระบบฝ่ายผลิต",
  docTitle: "Yogi — ระบบฝ่ายผลิต",
  homeHref: "/yogi",
  dotCls: "bg-brand-yogi",
};

export function unitBrand(unit: WorkUnit | undefined | null): UnitBrand {
  return unit === "production" ? PRODUCTION_BRAND : STORE_BRAND;
}

// สาขาที่ขาย 2 แบรนด์ในพื้นที่เดียว ใช้พนักงาน/POS/สต็อกชุดเดียวกัน
// NCD เปิด ก.ย. 2569 — ใส่ไว้ล่วงหน้าได้ ไม่มีผลจนกว่าจะมีสาขานี้ในระบบ
const DUAL_BRAND_BRANCHES = new Set<string>(["KCN", "NCD"]);

/** ป้ายบอกแบรนด์ของสาขา — "YC + Staple" เฉพาะสาขาที่ขายควบ */
export function branchBrandLabel(branch: Branch | string): string {
  return DUAL_BRAND_BRANCHES.has(branch) ? "YC + Staple" : "YC";
}

export function isDualBrandBranch(branch: Branch | string): boolean {
  return DUAL_BRAND_BRANCHES.has(branch);
}
