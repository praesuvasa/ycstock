// Data-store facade — BFF เรียกที่นี่เท่านั้น
// default = memory (seeded). ตั้ง USE_SUPABASE=1 + env → ใช้ Supabase
import type { User, Branch, StockRow, SalesRow, CupRow, Meta, RestockRow, Role, BranchScope, AuditEntry, Weekday, Requisition, RestockSelectionEntry, RestockExtraItem, ReturnHistoryRow, PaymentIncident, ExpiryCheckRow, ProductionOrder, ProductionOrderSummary, ProductionOrderItem, ProductionOrderItemInput, BranchNotice, SalesEvidence, EvidenceType, MatchStatus, CashRemittance, RestockReceiptStatus, RestockSheetSummary, RestockReceiptBatchEntry, AdminFlag, StaffAllowanceUse, AllowanceSummary, StaffFeedback } from "./types";
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

  saveStock: (branch: Branch, date: string, rows: StockRow[], userName?: string) =>
    useSupabase ? supabaseStore.saveStock(branch, date, rows, userName) : Promise.resolve(memoryStore.saveStock(branch, date, rows, userName)),

  getStockSavedAt: (branch: Branch, date: string): Promise<{ savedAt: string | null; savedBy: string | null }> =>
    useSupabase ? supabaseStore.getStockSavedAt(branch, date) : Promise.resolve(memoryStore.getStockSavedAt(branch, date)),

  getRestock: (branch: Branch, weekday: Weekday): Promise<{ rows: RestockRow[]; specialActive: boolean }> =>
    useSupabase ? supabaseStore.getRestock(branch, weekday) : Promise.resolve(memoryStore.getRestock(branch, weekday)),

  getStockIn: (branch: Branch, date: string) =>
    useSupabase ? supabaseStore.getStockIn(branch, date) : Promise.resolve(memoryStore.getStockIn(branch, date)),
  getReturnHistory: (branch: Branch | null, from: string, to: string, limit?: number): Promise<ReturnHistoryRow[]> =>
    useSupabase
      ? supabaseStore.getReturnHistory(branch, from, to, limit)
      : Promise.resolve(memoryStore.getReturnHistory(branch, from, to, limit)),

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
  getUserByPasscode: (pin: string): Promise<{ user: User; mustSetPasscode: boolean } | null> =>
    useSupabase ? supabaseStore.getUserByPasscode(pin) : Promise.resolve(memoryStore.getUserByPasscode(pin)),

  // ── ตั้ง/ออกรหัสเอง (v1.15) ──
  issueSetupCode: (userId: string): Promise<string | null> =>
    useSupabase ? supabaseStore.issueSetupCode(userId) : Promise.resolve(memoryStore.issueSetupCode(userId)),
  setOwnPasscode: (userId: string, newPin: string): Promise<{ ok: boolean; reason?: "duplicate" }> =>
    useSupabase ? supabaseStore.setOwnPasscode(userId, newPin) : Promise.resolve(memoryStore.setOwnPasscode(userId, newPin)),
  recordLoginAttempt: (ip: string, ok: boolean): Promise<void> =>
    useSupabase ? supabaseStore.recordLoginAttempt(ip, ok) : Promise.resolve(memoryStore.recordLoginAttempt(ip, ok)),
  countRecentFailedLogins: (ip: string, minutes: number): Promise<number> =>
    useSupabase ? supabaseStore.countRecentFailedLogins(ip, minutes) : Promise.resolve(memoryStore.countRecentFailedLogins(ip, minutes)),
  listUsers: () =>
    useSupabase ? supabaseStore.listUsers() : Promise.resolve(memoryStore.listUsers()),
  createUser: (input: { name: string; role: Role; branchScope: BranchScope; createdBy: string }) =>
    useSupabase ? supabaseStore.createUser(input) : Promise.resolve(memoryStore.createUser(input)),
  updateUser: (id: string, patch: { name?: string; role?: Role; branchScope?: BranchScope; active?: boolean; allowanceEnabled?: boolean; allowanceMonthly?: number }) =>
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

  getRestockNote: (branch: Branch, date: string): Promise<string> =>
    useSupabase ? supabaseStore.getRestockNote(branch, date) : Promise.resolve(memoryStore.getRestockNote(branch, date)),
  // ── ความคิดเห็น/ข้อเสนอแนะจากพนักงาน (v1.18) ──
  createFeedback: (input: {
    userId: string; userName: string; branch: Branch | null;
    anonymous: boolean; topic: string; message: string; wantedAction: string;
  }): Promise<void> =>
    useSupabase ? supabaseStore.createFeedback(input) : Promise.resolve(memoryStore.createFeedback(input)),
  listFeedback: (limit?: number): Promise<StaffFeedback[]> =>
    useSupabase ? supabaseStore.listFeedback(limit) : Promise.resolve(memoryStore.listFeedback(limit)),
  countUnseenFeedback: (): Promise<number> =>
    useSupabase ? supabaseStore.countUnseenFeedback() : Promise.resolve(memoryStore.countUnseenFeedback()),
  markAllFeedbackSeen: (byName: string): Promise<void> =>
    useSupabase ? supabaseStore.markAllFeedbackSeen(byName) : Promise.resolve(memoryStore.markAllFeedbackSeen(byName)),

  // ── ลบผู้ใช้ (v1.15) ──
  getUserActivity: (userId: string): Promise<{ allowanceUses: number; auditRows: number; workRows: number }> =>
    useSupabase ? supabaseStore.getUserActivity(userId) : Promise.resolve(memoryStore.getUserActivity(userId)),
  deleteUser: (userId: string): Promise<{ ok: boolean; reason?: string }> =>
    useSupabase ? supabaseStore.deleteUser(userId) : Promise.resolve(memoryStore.deleteUser(userId)),

  // ── สิทธิ์ซื้อของในร้าน (v1.13) ──
  listAllowanceUses: (userId: string, month: string): Promise<StaffAllowanceUse[]> =>
    useSupabase
      ? supabaseStore.listAllowanceUses(userId, month)
      : Promise.resolve(memoryStore.listAllowanceUses(userId, month)),

  getAllowanceOverview: (month: string): Promise<{ summaries: AllowanceSummary[]; needsReview: StaffAllowanceUse[] }> =>
    useSupabase
      ? supabaseStore.getAllowanceOverview(month)
      : Promise.resolve(memoryStore.getAllowanceOverview(month)),

  addAllowanceUse: (row: StaffAllowanceUse): Promise<void> =>
    useSupabase
      ? supabaseStore.addAllowanceUse(row)
      : Promise.resolve(memoryStore.addAllowanceUse(row)),

  // ── ตรวจวันหมดอายุ (v1.12) ──
  getExpiryChecks: (branch: Branch, checkDate: string): Promise<ExpiryCheckRow[]> =>
    useSupabase
      ? supabaseStore.getExpiryChecks(branch, checkDate)
      : Promise.resolve(memoryStore.getExpiryChecks(branch, checkDate)),

  getBranchesWithExpiryCheck: (checkDate: string): Promise<Branch[]> =>
    useSupabase
      ? supabaseStore.getBranchesWithExpiryCheck(checkDate)
      : Promise.resolve(memoryStore.getBranchesWithExpiryCheck(checkDate)),

  saveExpiryChecks: (branch: Branch, checkDate: string, rows: ExpiryCheckRow[], userId: string, userName: string): Promise<void> =>
    useSupabase
      ? supabaseStore.saveExpiryChecks(branch, checkDate, rows, userId, userName)
      : Promise.resolve(memoryStore.saveExpiryChecks(branch, checkDate, rows, userId, userName)),

  getPaymentIncidents: (branch: Branch, date: string): Promise<PaymentIncident[]> =>
    useSupabase
      ? supabaseStore.getPaymentIncidents(branch, date)
      : Promise.resolve(memoryStore.getPaymentIncidents(branch, date)),

  savePaymentIncidents: (branch: Branch, date: string, incidents: PaymentIncident[], userId: string, userName: string): Promise<void> =>
    useSupabase
      ? supabaseStore.savePaymentIncidents(branch, date, incidents, userId, userName)
      : Promise.resolve(memoryStore.savePaymentIncidents(branch, date, incidents, userId, userName)),

  getConfirmedReceiptItemIds: (branch: Branch, date: string): Promise<string[]> =>
    useSupabase
      ? supabaseStore.getConfirmedReceiptItemIds(branch, date)
      : Promise.resolve(memoryStore.getConfirmedReceiptItemIds(branch, date)),

  getRestockExtraItems: (branch: Branch, date: string): Promise<RestockExtraItem[]> =>
    useSupabase
      ? supabaseStore.getRestockExtraItems(branch, date)
      : Promise.resolve(memoryStore.getRestockExtraItems(branch, date)),

  saveRestockExtraItems: (branch: Branch, date: string, items: RestockExtraItem[], userId: string, userName: string): Promise<void> =>
    useSupabase
      ? supabaseStore.saveRestockExtraItems(branch, date, items, userId, userName)
      : Promise.resolve(memoryStore.saveRestockExtraItems(branch, date, items, userId, userName)),

  saveRestockNote: (branch: Branch, date: string, note: string, userId: string, userName: string): Promise<void> =>
    useSupabase
      ? supabaseStore.saveRestockNote(branch, date, note, userId, userName)
      : Promise.resolve(memoryStore.saveRestockNote(branch, date, note)),

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

  deleteProductionOrder: (id: number) =>
    useSupabase ? supabaseStore.deleteProductionOrder(id) : Promise.resolve(memoryStore.deleteProductionOrder(id)),

  updateProductionOrderItem: (
    id: number,
    patch: { qty?: number; qtyG?: number; confirmed?: boolean; confirmedQty?: number; confirmedQtyG?: number },
    userId: string, userName: string
  ): Promise<ProductionOrderItem | null> =>
    useSupabase
      ? supabaseStore.updateProductionOrderItem(id, patch, userId, userName)
      : Promise.resolve(memoryStore.updateProductionOrderItem(id, patch, userId, userName)),

  // ── ยืนยันรับของ (v1.9) ──
  listOutstandingRestockSheets: (branch: Branch): Promise<RestockSheetSummary[]> =>
    useSupabase ? supabaseStore.listOutstandingRestockSheets(branch) : Promise.resolve(memoryStore.listOutstandingRestockSheets(branch)),
  getRestockReceiptStatus: (branch: Branch, date: string): Promise<RestockReceiptStatus[]> =>
    useSupabase ? supabaseStore.getRestockReceiptStatus(branch, date) : Promise.resolve(memoryStore.getRestockReceiptStatus(branch, date)),
  confirmRestockReceipt: (
    branch: Branch, date: string, itemId: string, receivedQty: number, receivedQtyG: number,
    isExtra: boolean, userId: string, userName: string, note?: string, notReceived?: boolean
  ): Promise<void> =>
    useSupabase
      ? supabaseStore.confirmRestockReceipt(branch, date, itemId, receivedQty, receivedQtyG, isExtra, userId, userName, note, notReceived)
      : Promise.resolve(memoryStore.confirmRestockReceipt(branch, date, itemId, receivedQty, receivedQtyG, isExtra, userId, userName, note, notReceived)).then(() => undefined),
  batchConfirmRestockReceipt: (
    branch: Branch, date: string, entries: RestockReceiptBatchEntry[], userId: string, userName: string
  ): Promise<void> =>
    useSupabase
      ? supabaseStore.batchConfirmRestockReceipt(branch, date, entries, userId, userName)
      : Promise.resolve(memoryStore.batchConfirmRestockReceipt(branch, date, entries, userId, userName)).then(() => undefined),
  unconfirmRestockReceipt: (branch: Branch, date: string, itemId: string): Promise<void> =>
    useSupabase
      ? supabaseStore.unconfirmRestockReceipt(branch, date, itemId)
      : Promise.resolve(memoryStore.unconfirmRestockReceipt(branch, date, itemId)),
  getPendingReceiptCount: (branch: Branch): Promise<number> =>
    useSupabase ? supabaseStore.getPendingReceiptCount(branch) : Promise.resolve(memoryStore.getPendingReceiptCount(branch)),
  listAdminFlags: (includeResolved?: boolean): Promise<AdminFlag[]> =>
    useSupabase ? supabaseStore.listAdminFlags(includeResolved) : Promise.resolve(memoryStore.listAdminFlags(includeResolved)),
  resolveAdminFlag: (id: number, resolvedBy: string): Promise<void> =>
    useSupabase ? supabaseStore.resolveAdminFlag(id, resolvedBy) : Promise.resolve(memoryStore.resolveAdminFlag(id, resolvedBy)),
};

// helper สำหรับ BFF validate branch
export function parseBranch(v: string | null): Branch | null {
  return v != null && (BRANCHES as string[]).includes(v) ? (v as Branch) : null;
}
