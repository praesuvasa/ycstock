// Data-store facade — BFF เรียกที่นี่เท่านั้น
// default = memory (seeded). ตั้ง USE_SUPABASE=1 + env → ใช้ Supabase
import type { Branch, StockRow, SalesRow, CupRow, Meta, RestockRow } from "./types";
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

  getRestock: (branch: Branch, weekday: "wed" | "sat"): Promise<{ rows: RestockRow[]; specialActive: boolean }> =>
    useSupabase ? supabaseStore.getRestock(branch, weekday) : Promise.resolve(memoryStore.getRestock(branch, weekday)),

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
};

// helper สำหรับ BFF validate branch
export function parseBranch(v: string | null): Branch | null {
  return v === "SND" || v === "NVP" ? v : null;
}
