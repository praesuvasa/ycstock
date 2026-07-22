// Data-store facade — BFF เรียกที่นี่เท่านั้น
// default = memory (seeded). ตั้ง USE_SUPABASE=1 + env → ใช้ Supabase
import type { Branch, StockRow, SalesRow, CupRow, Meta, RestockRow, Role, BranchScope, AuditEntry, Weekday, Requisition, RestockSelectionEntry, ProductionOrder, ProductionOrderSummary, ProductionOrderItem, ProductionOrderItemInput, BranchNotice, SalesEvidence, EvidenceType, MatchStatus, CashRemittance } from "./types";
import { BRANCHES } from "./types";
import { memoryStore } from "./store-memory";
import { supabaseStore } from "./supabase";

const useSupabase = process.env.USE_SUPABASE === "1";

export const db = {
  getMeta: (): Promise<Meta> =>
    useSupabase ? supabaseStore.getMeta() : Promise.resolve(memoryStore.getMeta()),

  setItemConfig: (itemId: string, cfg: { hasRemainder: boolean; gramsPerUOM: number; remainderGroup?: string }) =>
    useSupabase ? supabaseStore.setItemConfig(itemId, cfg) : Promise.resolve(memoryStore.setItemConfig(itemId, cfg)),

  getStock: (branch: Branch, date: string): Promise<StockRow[]> =>
    useSupabase ? supabaseStore.getStock(branch, date) : Promise.resolve(memoryStore.getStock(branch, date)),

  saveStock: (branch: Branch, date: string, rows: StockRow[]) =>
    useSupabase ? supabaseStore.saveStock(branch, date, rows) : Promise.resolve(memoryStore.saveStock(branch, date, rows)),

  getRestock: (branch: Branch, weekday: Weekday): Promise<{ rows: RestockRow[]; specialActive: boolean }> =>
    useSupabase ? supabaseStore.getRestock(branch, weekday) : Promise.resolve(memoryStore.getRestock(branch, weekday)),

  getStockIn: (branch: Branch, date: string) =>
    useSupabase ? supabaseStore.getStockIn(branch, date) : Promise.resolve(memoryStore.getStockIn(branch, date)),
  getRecentStockInDays: (branch: Branch, days: number) =>
    useSupabase ? supabaseStore.getRecentStockInDays(branch, days) : Promise.resolve(memoryStore.getRecentStockInDays(branch, days)),

  getSales: (branch: Branch, date: string): Promise<SalesRow> =>
    useSupabase ? supabaseStore.getSales(branch, date) : Promise.resolve(memoryStore.getSales(branch, date)),

  saveSales: (branch: Branch, date: string, row: SalesRow) =>
    useSupabase ? supabaseStore.saveSales(branch, date, row) : Promise.resolve(memoryStore.saveSales(branch, date, row)),

  getCups: (branch: Branch, date: string): Promise<CupRow[]> =>
    useSupabase ? supabaseStore.getCups(branch, date) : Promise.resolve(memoryStore.getCups(branch, date)),

  saveCups: (branch: Branch, date: string, rows: CupRow[]) =>
    useSupabase ? supabaseStore.saveCups(branch, date, rows) : Promise.resolve(memoryStore.saveCups(branch, date, rows)),

  getDashboard: (date: string) =>
    useSupabase ? supabaseStore.getDashboard(date) : Promise.resolve(memoryStore.getDashboard(date)),

  // ── auth / users / audit ──
  getUserByPasscode: (pin: string) =>
    useSupabase ? supabaseStore.getUserByPasscode(pin) : Promise.resolve(memoryStore.getUserByPasscode(pin)),
  listUsers: () =>
    useSupabase ? supabaseStore.listUsers() : Promise.resolve(memoryStore.listUsers()),
  createUser: (input: { name: string; role: Role; branchScope: BranchScope; passcode: string; createdBy: string }) =>
    useSupabase ? supabaseStore.createUser(input) : Promise.resolve(memoryStore.createUser(input)),
  updateUser: (id: string, patch: { name?: string; role?: Role; branchScope?: BranchScope; active?: boolean; passcode?: string }) =>
    useSupabase ? supabaseStore.updateUser(id, patch) : Promise.resolve(memoryStore.updateUser(id, patch)),
  writeAudit: (e: Omit<AuditEntry, "id" | "ts">) =>
    useSupabase ? supabaseStore.writeAudit(e) : Promise.resolve(memoryStore.writeAudit(e)),
  listAudit: (filter: { userId?: string; branch?: string; action?: string; limit?: number }) =>
    useSupabase ? supabaseStore.listAudit(filter) : Promise.resolve(memoryStore.listAudit(filter)),

  // ── ขอเบิกสินค้า ──
  createRequisition: (input: Omit<Requisition, "id" | "createdAt">) =>
    useSupabase ? supabaseStore.createRequisition(input) : Promise.resolve(memoryStore.createRequisition(input)),
  listRequisitions: (filter: { userId?: string; branch?: string; limit?: number }) =>
    useSupabase ? supabaseStore.listRequisitions(filter) : Promise.resolve(memoryStore.listRequisitions(filter)),
  countUnseenRequisitions: () =>
    useSupabase ? supabaseStore.countUnseenRequisitions() : Promise.resolve(memoryStore.countUnseenRequisitions()),
  markAllRequisitionsSeen: () =>
    useSupabase ? supabaseStore.markAllRequisitionsSeen() : Promise.resolve(memoryStore.markAllRequisitionsSeen()),

  // ── ประกาศพิเศษ (v1.6) ──
  listActiveNotices: (branch: Branch): Promise<BranchNotice[]> =>
    useSupabase ? supabaseStore.listActiveNotices(branch) : Promise.resolve(memoryStore.listActiveNotices(branch)),
  listAllNotices: (): Promise<BranchNotice[]> =>
    useSupabase ? supabaseStore.listAllNotices() : Promise.resolve(memoryStore.listAllNotices()),
  createNotice: (input: { branch: Branch | null; message: string }, userName: string): Promise<BranchNotice> =>
    useSupabase ? supabaseStore.createNotice(input, userName) : Promise.resolve(memoryStore.createNotice(input, userName)),
  deleteNotice: (id: string) =>
    useSupabase ? supabaseStore.deleteNotice(id) : Promise.resolve(memoryStore.deleteNotice(id)),

  // ── หลักฐานยอดขาย (v1.7) ──
  uploadEvidenceImage: (path: string, bytes: Buffer, contentType: string) =>
    useSupabase ? supabaseStore.uploadEvidenceImage(path, bytes, contentType) : Promise.resolve(memoryStore.uploadEvidenceImage(path, bytes, contentType)),
  getEvidenceSignedUrl: (path: string): Promise<string | null> =>
    useSupabase ? supabaseStore.getEvidenceSignedUrl(path) : Promise.resolve(memoryStore.getEvidenceSignedUrl(path)),
  upsertSalesEvidence: (input: {
    branch: Branch; date: string; type: EvidenceType; imagePath: string; enteredAmount: number;
    ocrAmount: number | null; ocrNameMatch: boolean | null; matchStatus: MatchStatus;
    ocrTxnRef: string | null; ocrTxnTime: string | null; duplicateNote: string | null; mismatchNote: string | null;
    userId: string; userName: string;
  }): Promise<SalesEvidence> =>
    useSupabase ? supabaseStore.upsertSalesEvidence(input) : Promise.resolve(memoryStore.upsertSalesEvidence(input)),
  listSalesEvidence: (branch: Branch, date: string): Promise<SalesEvidence[]> =>
    useSupabase ? supabaseStore.listSalesEvidence(branch, date) : Promise.resolve(memoryStore.listSalesEvidence(branch, date)),
  findDuplicateEvidence: (
    txnRef: string, excludeBranch: Branch, excludeDate: string, excludeType: EvidenceType
  ): Promise<{ branch: Branch; date: string; type: EvidenceType } | null> =>
    useSupabase
      ? supabaseStore.findDuplicateEvidence(txnRef, excludeBranch, excludeDate, excludeType)
      : Promise.resolve(memoryStore.findDuplicateEvidence(txnRef, excludeBranch, excludeDate, excludeType)),

  // ── การโอนเงินสด (v1.7) ──
  listUnremittedCashDays: (branch: Branch): Promise<{ date: string; cash: number }[]> =>
    useSupabase ? supabaseStore.listUnremittedCashDays(branch) : Promise.resolve(memoryStore.listUnremittedCashDays(branch)),
  createCashRemittance: (input: {
    branch: Branch; transferredAt: string; dates: string[]; declaredAmount: number; imagePath: string;
    ocrAmount: number | null; ocrNameMatch: boolean | null; matchStatus: MatchStatus;
    ocrTxnRef: string | null; ocrTxnTime: string | null; duplicateNote: string | null; mismatchNote: string | null;
    userId: string; userName: string;
  }): Promise<CashRemittance> =>
    useSupabase ? supabaseStore.createCashRemittance(input) : Promise.resolve(memoryStore.createCashRemittance(input)),
  listCashRemittances: (branch: Branch, limit?: number): Promise<CashRemittance[]> =>
    useSupabase ? supabaseStore.listCashRemittances(branch, limit) : Promise.resolve(memoryStore.listCashRemittances(branch, limit)),
  findDuplicateRemittance: (txnRef: string): Promise<{ branch: Branch; transferredAt: string } | null> =>
    useSupabase ? supabaseStore.findDuplicateRemittance(txnRef) : Promise.resolve(memoryStore.findDuplicateRemittance(txnRef)),
  deleteCashRemittance: (id: string) =>
    useSupabase ? supabaseStore.deleteCashRemittance(id) : Promise.resolve(memoryStore.deleteCashRemittance(id)),

  // ── restock selections (v1.4) ──
  getRestockSelections: (branch: Branch, date: string): Promise<Record<string, { selected: boolean; qty: number; qtyG: number }>> =>
    useSupabase ? supabaseStore.getRestockSelections(branch, date) : Promise.resolve(memoryStore.getRestockSelections(branch, date)),

  saveRestockSelections: (branch: Branch, date: string, entries: RestockSelectionEntry[], userId: string, userName: string) =>
    useSupabase
      ? supabaseStore.saveRestockSelections(branch, date, entries, userId, userName)
      : Promise.resolve(memoryStore.saveRestockSelections(branch, date, entries, userId, userName)),

  // ── ใบสั่งผลิต (v1.5) ──
  listProductionOrders: (limit?: number): Promise<ProductionOrderSummary[]> =>
    useSupabase ? supabaseStore.listProductionOrders(limit) : Promise.resolve(memoryStore.listProductionOrders(limit)),

  getProductionOrder: (id: number): Promise<ProductionOrder | null> =>
    useSupabase ? supabaseStore.getProductionOrder(id) : Promise.resolve(memoryStore.getProductionOrder(id)),

  createProductionOrder: (
    input: { orderDate: string; deliveryDate: string; note: string; items: ProductionOrderItemInput[] },
    userId: string, userName: string
  ): Promise<ProductionOrder> =>
    useSupabase
      ? supabaseStore.createProductionOrder(input, userId, userName)
      : Promise.resolve(memoryStore.createProductionOrder(input, userId, userName)),

  updateProductionOrder: (
    id: number,
    patch: { orderDate?: string; deliveryDate?: string; note?: string; items?: ProductionOrderItemInput[]; removedItemIds?: number[] }
  ): Promise<ProductionOrder | null> =>
    useSupabase ? supabaseStore.updateProductionOrder(id, patch) : Promise.resolve(memoryStore.updateProductionOrder(id, patch)),

  updateProductionOrderItem: (
    id: number,
    patch: { qty?: number; qtyG?: number; confirmed?: boolean; confirmedQty?: number; confirmedQtyG?: number },
    userId: string, userName: string
  ): Promise<ProductionOrderItem | null> =>
    useSupabase
      ? supabaseStore.updateProductionOrderItem(id, patch, userId, userName)
      : Promise.resolve(memoryStore.updateProductionOrderItem(id, patch, userId, userName)),
};

// helper สำหรับ BFF validate branch
export function parseBranch(v: string | null): Branch | null {
  return v != null && (BRANCHES as string[]).includes(v) ? (v as Branch) : null;
}
